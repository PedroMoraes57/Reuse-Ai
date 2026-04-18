from __future__ import annotations

import csv
import json
import math
from dataclasses import dataclass
from itertools import product
from pathlib import Path
from typing import Any

import torch
import torch.nn.functional as F
from sklearn.metrics import confusion_matrix, f1_score, precision_recall_fscore_support


@dataclass
class CollectedOutputs:
    logits: torch.Tensor
    tta_logits: torch.Tensor | None
    embeddings: torch.Tensor | None
    tta_embeddings: torch.Tensor | None
    targets: torch.Tensor


@dataclass
class PrototypeStore:
    class_names: list[str]
    vectors: torch.Tensor
    similarity_thresholds: dict[str, float]


def _forward_with_embeddings(
    model: torch.nn.Module,
    images: torch.Tensor,
) -> tuple[torch.Tensor, torch.Tensor | None]:
    forward_features = getattr(model, "forward_features", None)
    forward_head = getattr(model, "forward_head", None)
    if callable(forward_features) and callable(forward_head):
        features = forward_features(images)
        embeddings = forward_head(features, pre_logits=True)
        logits = forward_head(features)
        if embeddings.ndim > 2:
            embeddings = torch.flatten(embeddings, start_dim=1)
        return logits, embeddings
    return model(images), None


def collect_model_outputs(
    model: torch.nn.Module,
    loader: torch.utils.data.DataLoader,
    device: torch.device,
    mixed_precision: bool,
    tta_horizontal_flip: bool,
) -> CollectedOutputs:
    was_training = model.training
    model.eval()
    logits_batches: list[torch.Tensor] = []
    tta_batches: list[torch.Tensor] = []
    embedding_batches: list[torch.Tensor] = []
    tta_embedding_batches: list[torch.Tensor] = []
    target_batches: list[torch.Tensor] = []

    with torch.inference_mode():
        for images, targets in loader:
            images = images.to(device, non_blocking=True)
            if device.type == "cuda":
                images = images.to(memory_format=torch.channels_last)

            if mixed_precision and device.type == "cuda":
                with torch.autocast(device_type="cuda", dtype=torch.float16):
                    logits, embeddings = _forward_with_embeddings(model, images)
                    flipped_logits = None
                    flipped_embeddings = None
                    if tta_horizontal_flip:
                        flipped_logits, flipped_embeddings = _forward_with_embeddings(
                            model,
                            torch.flip(images, dims=[3]),
                        )
            else:
                logits, embeddings = _forward_with_embeddings(model, images)
                flipped_logits = None
                flipped_embeddings = None
                if tta_horizontal_flip:
                    flipped_logits, flipped_embeddings = _forward_with_embeddings(
                        model,
                        torch.flip(images, dims=[3]),
                    )

            logits_batches.append(logits.detach().float().cpu())
            if embeddings is not None:
                embedding_batches.append(embeddings.detach().float().cpu())
            if flipped_logits is not None:
                tta_batches.append(flipped_logits.detach().float().cpu())
            if flipped_embeddings is not None:
                tta_embedding_batches.append(flipped_embeddings.detach().float().cpu())
            target_batches.append(targets.detach().long().cpu())

    model.train(was_training)
    return CollectedOutputs(
        logits=torch.cat(logits_batches, dim=0),
        tta_logits=torch.cat(tta_batches, dim=0) if tta_batches else None,
        embeddings=torch.cat(embedding_batches, dim=0) if embedding_batches else None,
        tta_embeddings=torch.cat(tta_embedding_batches, dim=0) if tta_embedding_batches else None,
        targets=torch.cat(target_batches, dim=0),
    )


def calibrate_temperature(logits: torch.Tensor, targets: torch.Tensor) -> float:
    candidates_coarse = torch.linspace(0.7, 2.5, steps=37)
    best_temperature = 1.0
    best_loss = float("inf")

    for candidate in candidates_coarse.tolist():
        loss = torch.nn.functional.cross_entropy(logits / candidate, targets).item()
        if loss < best_loss:
            best_loss = loss
            best_temperature = float(candidate)

    lower = max(0.5, best_temperature - 0.15)
    upper = min(3.0, best_temperature + 0.15)
    candidates_fine = torch.linspace(lower, upper, steps=31)

    for candidate in candidates_fine.tolist():
        loss = torch.nn.functional.cross_entropy(logits / candidate, targets).item()
        if loss < best_loss:
            best_loss = loss
            best_temperature = float(candidate)

    return round(best_temperature, 4)


def _normalized_entropy(probabilities: torch.Tensor) -> torch.Tensor:
    if probabilities.shape[1] <= 1:
        return torch.zeros(probabilities.shape[0], dtype=probabilities.dtype)
    entropy = -(probabilities * torch.log(probabilities.clamp_min(1e-8))).sum(dim=1)
    return entropy / math.log(probabilities.shape[1])


def _aggregate_embeddings(collected: CollectedOutputs) -> torch.Tensor | None:
    if collected.embeddings is None:
        return None
    base_embeddings = F.normalize(collected.embeddings.float(), dim=1)
    if collected.tta_embeddings is None:
        return base_embeddings
    tta_embeddings = F.normalize(collected.tta_embeddings.float(), dim=1)
    return F.normalize((base_embeddings + tta_embeddings) / 2, dim=1)


def build_prototype_store(
    collected: CollectedOutputs,
    class_names: list[str],
) -> PrototypeStore | None:
    embeddings = _aggregate_embeddings(collected)
    if embeddings is None:
        return None

    prototype_vectors: list[torch.Tensor] = []
    for class_index, _class_id in enumerate(class_names):
        class_mask = collected.targets == class_index
        if not bool(class_mask.any()):
            return None
        prototype = embeddings[class_mask].mean(dim=0)
        prototype_vectors.append(F.normalize(prototype.unsqueeze(0), dim=1)[0])

    return PrototypeStore(
        class_names=class_names,
        vectors=torch.stack(prototype_vectors, dim=0),
        similarity_thresholds={},
    )


def serialize_prototype_store(prototype_store: PrototypeStore | None) -> dict[str, Any] | None:
    if prototype_store is None:
        return None
    return {
        "class_names": prototype_store.class_names,
        "vectors": [
            [round(float(value), 6) for value in row]
            for row in prototype_store.vectors.cpu().tolist()
        ],
        "similarity_thresholds": {
            class_id: round(float(threshold), 4)
            for class_id, threshold in prototype_store.similarity_thresholds.items()
        },
    }


def deserialize_prototype_store(payload: dict[str, Any] | None) -> PrototypeStore | None:
    if not payload:
        return None
    class_names = list(payload.get("class_names", []))
    vectors = payload.get("vectors", [])
    if not class_names or not vectors:
        return None
    return PrototypeStore(
        class_names=class_names,
        vectors=torch.tensor(vectors, dtype=torch.float32),
        similarity_thresholds={
            class_id: float(threshold)
            for class_id, threshold in payload.get("similarity_thresholds", {}).items()
        },
    )


def _effective_prototype_similarity_thresholds(
    predictions: torch.Tensor,
    class_names: list[str],
    inference_config: dict[str, Any],
    prototype_store: PrototypeStore | None,
) -> torch.Tensor:
    base_threshold = float(inference_config.get("prototype_similarity_threshold", -1.0))
    thresholds = torch.full_like(predictions, fill_value=base_threshold, dtype=torch.float32)
    if prototype_store is None:
        return thresholds

    class_thresholds = prototype_store.similarity_thresholds or {}
    index_by_class = {class_id: index for index, class_id in enumerate(class_names)}
    for class_id, threshold in class_thresholds.items():
        class_index = index_by_class.get(class_id)
        if class_index is None:
            continue
        thresholds[predictions == class_index] = float(threshold)
    return thresholds


def build_policy_outputs(
    collected: CollectedOutputs,
    inference_config: dict[str, Any],
    prototype_store: PrototypeStore | None = None,
) -> dict[str, torch.Tensor]:
    base_logits = collected.logits.float()
    tta_logits = collected.tta_logits.float() if collected.tta_logits is not None else None
    aggregated_logits = base_logits if tta_logits is None else (base_logits + tta_logits) / 2

    temperature = float(inference_config.get("temperature", 1.0))
    if temperature > 0 and temperature != 1.0:
        aggregated_logits = aggregated_logits / temperature

    probabilities = torch.softmax(aggregated_logits, dim=1)
    confidences, predictions = probabilities.max(dim=1)
    if probabilities.shape[1] > 1:
        top2 = torch.topk(probabilities, k=2, dim=1).values
        margins = top2[:, 0] - top2[:, 1]
    else:
        margins = torch.ones_like(confidences)

    per_view_predictions = [base_logits.argmax(dim=1)]
    if tta_logits is not None:
        per_view_predictions.append(tta_logits.argmax(dim=1))
    stacked_view_predictions = torch.stack(per_view_predictions, dim=1)
    consensus = (stacked_view_predictions == predictions.unsqueeze(1)).float().mean(dim=1)
    entropy = _normalized_entropy(probabilities)
    confidence_thresholds = _effective_confidence_thresholds(
        predictions=predictions,
        class_names=class_names_from_config(inference_config),
        inference_config=inference_config,
    )
    prototype_similarity = torch.ones_like(confidences)
    prototype_similarity_thresholds = torch.full_like(confidences, fill_value=-1.0)
    prototype_predictions = predictions.clone()
    prototype_disagreement = torch.zeros_like(predictions, dtype=torch.bool)
    embeddings = _aggregate_embeddings(collected)
    if (
        bool(inference_config.get("use_embedding_prototypes", False))
        and prototype_store is not None
        and embeddings is not None
        and prototype_store.vectors.shape[0] == probabilities.shape[1]
    ):
        prototype_vectors = F.normalize(prototype_store.vectors.float(), dim=1)
        similarities = embeddings @ prototype_vectors.T
        prototype_predictions = similarities.argmax(dim=1)
        prototype_disagreement = prototype_predictions != predictions
        prototype_similarity = similarities.gather(1, predictions.unsqueeze(1)).squeeze(1)
        prototype_similarity_thresholds = _effective_prototype_similarity_thresholds(
            predictions=predictions,
            class_names=class_names_from_config(inference_config),
            inference_config=inference_config,
            prototype_store=prototype_store,
        )

    uncertain = (
        (confidences < confidence_thresholds)
        | (margins < float(inference_config.get("margin_threshold", 0.18)))
        | (entropy > float(inference_config.get("entropy_threshold", 0.55)))
        | (consensus < float(inference_config.get("min_consensus", 0.6)))
        | (prototype_similarity < prototype_similarity_thresholds)
        | (
            prototype_disagreement
            & bool(inference_config.get("reject_on_prototype_disagreement", False))
        )
    )

    return {
        "probabilities": probabilities,
        "predictions": predictions,
        "confidences": confidences,
        "margins": margins,
        "entropy": entropy,
        "consensus": consensus,
        "confidence_thresholds": confidence_thresholds,
        "prototype_similarity": prototype_similarity,
        "prototype_similarity_thresholds": prototype_similarity_thresholds,
        "prototype_predictions": prototype_predictions,
        "prototype_disagreement": prototype_disagreement,
        "uncertain": uncertain,
    }


def class_names_from_config(inference_config: dict[str, Any]) -> list[str]:
    return list(inference_config.get("class_names", []))


def _effective_confidence_thresholds(
    predictions: torch.Tensor,
    class_names: list[str],
    inference_config: dict[str, Any],
) -> torch.Tensor:
    base_threshold = float(inference_config.get("confidence_threshold", 0.6))
    thresholds = torch.full_like(predictions, fill_value=base_threshold, dtype=torch.float32)
    class_thresholds = inference_config.get("class_confidence_thresholds", {})
    if not class_names or not class_thresholds:
        return thresholds

    index_by_class = {class_id: index for index, class_id in enumerate(class_names)}
    for class_id, threshold in class_thresholds.items():
        class_index = index_by_class.get(class_id)
        if class_index is None:
            continue
        thresholds[predictions == class_index] = float(threshold)
    return thresholds


def evaluate_inference_policy(
    collected: CollectedOutputs,
    class_names: list[str],
    inference_config: dict[str, Any],
    prototype_store: PrototypeStore | None = None,
) -> dict[str, Any]:
    outputs = build_policy_outputs(collected, inference_config, prototype_store=prototype_store)
    targets = collected.targets.long()
    predictions = outputs["predictions"].long()
    accepted = ~outputs["uncertain"]
    rejected = outputs["uncertain"]
    correct = predictions == targets
    total = int(targets.numel())
    total_wrong = int((~correct).sum().item())

    accuracy = (correct.float().mean().item()) if total else 0.0
    macro_f1 = f1_score(targets.tolist(), predictions.tolist(), average="macro") if total else 0.0
    accepted_total = int(accepted.sum().item())
    rejected_total = int(rejected.sum().item())
    accepted_correct = int((correct & accepted).sum().item())
    accepted_wrong = int(((~correct) & accepted).sum().item())
    rejected_correct = int((correct & rejected).sum().item())
    rejected_wrong = int(((~correct) & rejected).sum().item())

    accepted_accuracy = accepted_correct / accepted_total if accepted_total else None
    wrong_accept_rate = accepted_wrong / total if total else 0.0
    rejected_error_capture_rate = rejected_wrong / total_wrong if total_wrong else None

    precisions, recalls, f1_scores, supports = precision_recall_fscore_support(
        targets.tolist(),
        predictions.tolist(),
        labels=list(range(len(class_names))),
        zero_division=0,
    )
    matrix = confusion_matrix(
        targets.tolist(),
        predictions.tolist(),
        labels=list(range(len(class_names))),
    )

    per_class_metrics: list[dict[str, Any]] = []
    for index, class_id in enumerate(class_names):
        class_mask = targets == index
        support = int(class_mask.sum().item())
        accepted_mask = accepted & class_mask
        rejected_mask = rejected & class_mask
        accepted_support = int(accepted_mask.sum().item())
        per_class_metrics.append(
            {
                "class_id": class_id,
                "precision": round(float(precisions[index]), 4),
                "recall": round(float(recalls[index]), 4),
                "f1": round(float(f1_scores[index]), 4),
                "support": support,
                "accepted": accepted_support,
                "rejected": int(rejected_mask.sum().item()),
                "accepted_rate": round(accepted_support / support, 4) if support else 0.0,
                "accepted_accuracy": round(
                    float((correct & accepted_mask).sum().item() / accepted_support),
                    4,
                )
                if accepted_support
                else None,
                "mean_confidence": round(
                    float(outputs["confidences"][class_mask].mean().item()),
                    4,
                )
                if support
                else None,
                "mean_prototype_similarity": round(
                    float(outputs["prototype_similarity"][class_mask].mean().item()),
                    4,
                )
                if support
                else None,
            }
        )

    top_confusions: list[dict[str, Any]] = []
    for true_index, true_class in enumerate(class_names):
        for predicted_index, predicted_class in enumerate(class_names):
            if true_index == predicted_index:
                continue
            count = int(matrix[true_index, predicted_index])
            if count <= 0:
                continue
            top_confusions.append(
                {
                    "true_class_id": true_class,
                    "predicted_class_id": predicted_class,
                    "count": count,
                }
            )
    top_confusions.sort(key=lambda item: item["count"], reverse=True)

    summary = {
        "samples": total,
        "accuracy": round(float(accuracy), 4),
        "macro_f1": round(float(macro_f1), 4),
        "accepted_rate": round(accepted_total / total, 4) if total else 0.0,
        "accepted_accuracy": round(float(accepted_accuracy), 4) if accepted_accuracy is not None else None,
        "wrong_accept_rate": round(float(wrong_accept_rate), 4),
        "rejected_rate": round(rejected_total / total, 4) if total else 0.0,
        "rejected_error_capture_rate": round(float(rejected_error_capture_rate), 4)
        if rejected_error_capture_rate is not None
        else None,
        "accepted_wrong": accepted_wrong,
        "rejected_wrong": rejected_wrong,
        "accepted_correct": accepted_correct,
        "rejected_correct": rejected_correct,
        "mean_confidence": round(float(outputs["confidences"].mean().item()), 4) if total else 0.0,
        "mean_margin": round(float(outputs["margins"].mean().item()), 4) if total else 0.0,
        "mean_entropy": round(float(outputs["entropy"].mean().item()), 4) if total else 0.0,
        "mean_consensus": round(float(outputs["consensus"].mean().item()), 4) if total else 0.0,
        "mean_prototype_similarity": round(float(outputs["prototype_similarity"].mean().item()), 4)
        if total
        else None,
        "prototype_disagreement_rate": round(float(outputs["prototype_disagreement"].float().mean().item()), 4)
        if total
        else 0.0,
    }

    return {
        "summary": summary,
        "per_class_metrics": per_class_metrics,
        "top_confusions": top_confusions[:30],
        "confusion_matrix": matrix.tolist(),
    }


def optimize_inference_policy(
    collected: CollectedOutputs,
    class_names: list[str],
    inference_config: dict[str, Any],
    prototype_store: PrototypeStore | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    optimized_config = dict(inference_config)
    optimized_config["class_names"] = class_names
    max_confidence_threshold = optimized_config.get("max_confidence_threshold")
    if max_confidence_threshold is not None:
        max_confidence_threshold = float(max_confidence_threshold)
        optimized_config["confidence_threshold"] = min(
            float(optimized_config.get("confidence_threshold", 0.7)),
            max_confidence_threshold,
        )

    aggregated_logits = collected.logits if collected.tta_logits is None else (collected.logits + collected.tta_logits) / 2
    if bool(optimized_config.get("calibrate_temperature", True)):
        optimized_config["temperature"] = calibrate_temperature(aggregated_logits, collected.targets)

    baseline_evaluation = evaluate_inference_policy(
        collected,
        class_names,
        optimized_config,
        prototype_store=prototype_store,
    )
    best_config = dict(optimized_config)
    best_evaluation = baseline_evaluation
    best_score = _policy_score(best_evaluation["summary"], best_config)

    if bool(optimized_config.get("calibrate_thresholds", True)):
        confidence_candidates = _candidate_values(
            float(optimized_config.get("confidence_threshold", 0.6)),
            [0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75],
        )
        if max_confidence_threshold is not None:
            confidence_candidates = [
                value for value in confidence_candidates if value <= max_confidence_threshold + 1e-8
            ]
            if not confidence_candidates:
                confidence_candidates = [round(max_confidence_threshold, 4)]
        margin_candidates = _candidate_values(
            float(optimized_config.get("margin_threshold", 0.18)),
            [0.05, 0.08, 0.1, 0.12, 0.15, 0.18, 0.22, 0.26],
        )
        entropy_candidates = _candidate_values(
            float(optimized_config.get("entropy_threshold", 0.55)),
            [0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7],
        )
        consensus_candidates = (
            _candidate_values(float(optimized_config.get("min_consensus", 0.6)), [0.5, 0.75])
            if collected.tta_logits is not None
            else [0.0]
        )

        for confidence, margin, entropy, consensus in product(
            confidence_candidates,
            margin_candidates,
            entropy_candidates,
            consensus_candidates,
        ):
            candidate_config = dict(optimized_config)
            candidate_config.update(
                {
                    "confidence_threshold": confidence,
                    "margin_threshold": margin,
                    "entropy_threshold": entropy,
                    "min_consensus": consensus,
                }
            )
            candidate_evaluation = evaluate_inference_policy(
                collected,
                class_names,
                candidate_config,
                prototype_store=prototype_store,
            )
            candidate_score = _policy_score(candidate_evaluation["summary"], candidate_config)
            if candidate_score > best_score:
                best_score = candidate_score
                best_config = candidate_config
                best_evaluation = candidate_evaluation

    class_thresholds = calibrate_class_confidence_thresholds(
        collected=collected,
        class_names=class_names,
        inference_config=best_config,
        prototype_store=prototype_store,
    )
    if class_thresholds:
        candidate_config = dict(best_config)
        candidate_config["class_confidence_thresholds"] = class_thresholds
        candidate_evaluation = evaluate_inference_policy(
            collected,
            class_names,
            candidate_config,
            prototype_store=prototype_store,
        )
        candidate_score = _policy_score(candidate_evaluation["summary"], candidate_config)
        if candidate_score >= best_score:
            best_score = candidate_score
            best_config = candidate_config
            best_evaluation = candidate_evaluation

    calibration_report = {
        "baseline_summary": baseline_evaluation["summary"],
        "optimized_summary": best_evaluation["summary"],
        "optimized_inference": {
            key: best_config[key]
            for key in (
                "temperature",
                "confidence_threshold",
                "margin_threshold",
                "entropy_threshold",
                "min_consensus",
                "top_k",
                "tta_horizontal_flip",
                "reject_on_prototype_disagreement",
            )
            if key in best_config
        },
        "class_confidence_thresholds": best_config.get("class_confidence_thresholds", {}),
        "score": round(float(best_score), 4),
    }
    return best_config, calibration_report


def calibrate_class_confidence_thresholds(
    collected: CollectedOutputs,
    class_names: list[str],
    inference_config: dict[str, Any],
    prototype_store: PrototypeStore | None = None,
) -> dict[str, float]:
    outputs = build_policy_outputs(
        collected,
        {**inference_config, "class_names": class_names},
        prototype_store=prototype_store,
    )
    predictions = outputs["predictions"]
    confidences = outputs["confidences"]
    targets = collected.targets.long()
    correct = predictions == targets
    base_threshold = float(inference_config.get("confidence_threshold", 0.6))
    target_precision = float(
        inference_config.get(
            "target_min_class_precision",
            inference_config.get("target_min_accepted_accuracy", 0.92),
        )
    )
    min_support = int(inference_config.get("class_threshold_min_support", 20))
    min_keep_ratio = float(inference_config.get("class_threshold_min_keep_ratio", 0.35))
    min_gain = float(inference_config.get("class_threshold_min_gain", 0.03))

    thresholds: dict[str, float] = {}
    for class_index, class_id in enumerate(class_names):
        predicted_mask = predictions == class_index
        support = int(predicted_mask.sum().item())
        if support < min_support:
            continue

        base_precision = float(correct[predicted_mask].float().mean().item())
        wrong_support = int((~correct[predicted_mask]).sum().item())
        if base_precision >= target_precision and wrong_support < max(3, int(support * 0.06)):
            continue
        class_confidences = confidences[predicted_mask]
        quantiles = torch.quantile(
            class_confidences,
            torch.tensor([0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6], dtype=torch.float32),
        ).tolist()
        candidate_thresholds = sorted(
            {
                round(float(value), 4)
                for value in [base_threshold, 0.7, 0.75, 0.8, 0.85, 0.9, *quantiles]
                if float(value) >= base_threshold
            }
        )

        best_threshold = base_threshold
        best_precision = base_precision
        best_keep_ratio = 1.0
        for threshold in candidate_thresholds:
            accepted_mask = predicted_mask & (confidences >= threshold)
            accepted_total = int(accepted_mask.sum().item())
            if accepted_total == 0:
                continue
            keep_ratio = accepted_total / support
            if keep_ratio < min_keep_ratio:
                continue
            accepted_precision = float(correct[accepted_mask].float().mean().item())
            improvement = accepted_precision - base_precision
            if accepted_precision < best_precision:
                continue
            if accepted_precision >= target_precision or improvement >= min_gain:
                score = accepted_precision * 0.85 + keep_ratio * 0.15
                best_score = best_precision * 0.85 + best_keep_ratio * 0.15
                if score > best_score:
                    best_threshold = threshold
                    best_precision = accepted_precision
                    best_keep_ratio = keep_ratio

        if best_threshold > base_threshold:
            thresholds[class_id] = round(float(best_threshold), 4)
    return thresholds


def calibrate_prototype_similarity_thresholds(
    collected: CollectedOutputs,
    class_names: list[str],
    inference_config: dict[str, Any],
    prototype_store: PrototypeStore | None,
) -> dict[str, float]:
    if prototype_store is None:
        return {}

    outputs = build_policy_outputs(
        collected,
        {
            **inference_config,
            "class_names": class_names,
            "use_embedding_prototypes": False,
            "reject_on_prototype_disagreement": False,
        },
        prototype_store=prototype_store,
    )
    predictions = outputs["predictions"]
    similarities = outputs["prototype_similarity"]
    targets = collected.targets.long()
    correct = predictions == targets
    base_threshold = float(inference_config.get("prototype_similarity_threshold", -1.0))
    target_precision = float(
        inference_config.get(
            "target_min_class_precision",
            inference_config.get("target_min_accepted_accuracy", 0.92),
        )
    )
    min_support = int(inference_config.get("prototype_threshold_min_support", 20))
    min_keep_ratio = float(inference_config.get("prototype_threshold_min_keep_ratio", 0.35))
    min_gain = float(inference_config.get("prototype_threshold_min_gain", 0.02))

    thresholds: dict[str, float] = {}
    for class_index, class_id in enumerate(class_names):
        predicted_mask = predictions == class_index
        support = int(predicted_mask.sum().item())
        if support < min_support:
            continue

        base_precision = float(correct[predicted_mask].float().mean().item())
        wrong_support = int((~correct[predicted_mask]).sum().item())
        if base_precision >= target_precision and wrong_support < max(3, int(support * 0.06)):
            continue

        class_similarities = similarities[predicted_mask]
        quantiles = torch.quantile(
            class_similarities,
            torch.tensor([0.0, 0.1, 0.2, 0.3, 0.4, 0.5], dtype=torch.float32),
        ).tolist()
        candidate_thresholds = sorted(
            {
                round(float(value), 4)
                for value in [base_threshold, 0.2, 0.3, 0.4, 0.5, 0.6, *quantiles]
                if float(value) > base_threshold
            }
        )

        best_threshold = base_threshold
        best_precision = base_precision
        best_keep_ratio = 1.0
        for threshold in candidate_thresholds:
            accepted_mask = predicted_mask & (similarities >= threshold)
            accepted_total = int(accepted_mask.sum().item())
            if accepted_total == 0:
                continue
            keep_ratio = accepted_total / support
            if keep_ratio < min_keep_ratio:
                continue
            accepted_precision = float(correct[accepted_mask].float().mean().item())
            improvement = accepted_precision - base_precision
            if accepted_precision < best_precision:
                continue
            if accepted_precision >= target_precision or improvement >= min_gain:
                score = accepted_precision * 0.85 + keep_ratio * 0.15
                best_score = best_precision * 0.85 + best_keep_ratio * 0.15
                if score > best_score:
                    best_threshold = threshold
                    best_precision = accepted_precision
                    best_keep_ratio = keep_ratio

        if best_threshold > base_threshold:
            thresholds[class_id] = round(float(best_threshold), 4)
    return thresholds


def save_evaluation_report(
    report_dir: Path,
    split_name: str,
    class_names: list[str],
    inference_config: dict[str, Any],
    evaluation: dict[str, Any],
) -> None:
    report_dir.mkdir(parents=True, exist_ok=True)
    full_report = {
        "split": split_name,
        "inference_config": inference_config,
        "summary": evaluation["summary"],
        "per_class_metrics": evaluation["per_class_metrics"],
        "top_confusions": evaluation["top_confusions"],
    }
    (report_dir / f"{split_name}_report.json").write_text(
        json.dumps(full_report, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )

    with (report_dir / f"{split_name}_per_class_metrics.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(
            file,
            fieldnames=[
                "class_id",
                "precision",
                "recall",
                "f1",
                "support",
                "accepted",
                "rejected",
                "accepted_rate",
                "accepted_accuracy",
                "mean_confidence",
                "mean_prototype_similarity",
            ],
        )
        writer.writeheader()
        writer.writerows(evaluation["per_class_metrics"])

    with (report_dir / f"{split_name}_confusion_matrix.csv").open("w", newline="", encoding="utf-8") as file:
        writer = csv.writer(file)
        writer.writerow(["true_class_id", *class_names])
        for class_id, row in zip(class_names, evaluation["confusion_matrix"], strict=False):
            writer.writerow([class_id, *row])


def _candidate_values(current_value: float, defaults: list[float]) -> list[float]:
    values = {round(float(value), 4) for value in defaults}
    values.add(round(float(current_value), 4))
    return sorted(values)


def _policy_score(summary: dict[str, Any], inference_config: dict[str, Any]) -> float:
    coverage = float(summary["accepted_rate"])
    accepted_accuracy = float(summary["accepted_accuracy"] or 0.0)
    wrong_accept_rate = float(summary["wrong_accept_rate"])
    macro_f1 = float(summary["macro_f1"])
    rejected_error_capture_rate = float(summary["rejected_error_capture_rate"] or 0.0)

    target_min_coverage = float(inference_config.get("target_min_coverage", 0.55))
    target_min_accepted_accuracy = float(inference_config.get("target_min_accepted_accuracy", 0.9))
    max_wrong_accept_rate = float(inference_config.get("max_wrong_accept_rate", 0.08))

    penalty = 0.0
    if coverage < target_min_coverage:
        penalty += (target_min_coverage - coverage) * 2.0
    if accepted_accuracy < target_min_accepted_accuracy:
        penalty += (target_min_accepted_accuracy - accepted_accuracy) * 3.5
    if wrong_accept_rate > max_wrong_accept_rate:
        penalty += (wrong_accept_rate - max_wrong_accept_rate) * 4.0

    return (
        accepted_accuracy * 0.45
        + coverage * 0.2
        + macro_f1 * 0.15
        + rejected_error_capture_rate * 0.2
        - penalty
    )
