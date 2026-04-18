from __future__ import annotations

import math
import logging
from io import BytesIO
from pathlib import Path
from typing import Sequence

import timm
import torch
import torch.nn.functional as F
from PIL import Image
from PIL import ImageOps
from PIL import ImageStat
from torchvision import transforms

from reuse_ai.advisor import DisposalAdvisor
from reuse_ai.catalog import load_class_catalog
from reuse_ai.config import ensure_runtime_dirs, load_project_config
from reuse_ai.data import build_transforms
from reuse_ai.evaluation import deserialize_prototype_store
from reuse_ai.location import LocationResolver
from reuse_ai.presentation import format_material_label


ImageInput = str | Path | Image.Image | bytes
logger = logging.getLogger(__name__)


class ReusePredictor:
    def __init__(self, config_path: str | Path | None = None, checkpoint_path: str | Path | None = None) -> None:
        self.config = load_project_config(config_path) if config_path else load_project_config()
        ensure_runtime_dirs(self.config)
        self.device = self._resolve_device()
        self.catalog = load_class_catalog(self.config["paths"]["class_catalog"])
        self.advisor = DisposalAdvisor(
            self.config["paths"]["class_catalog"],
            self.config["paths"]["disposal_rules"],
        )
        self.location_resolver = LocationResolver(
            user_agent=self.config["location"]["geocoder_user_agent"],
            timeout_seconds=int(self.config["location"]["geocoder_timeout_seconds"]),
        )
        self.checkpoint_path = Path(checkpoint_path or self.config["paths"]["checkpoint_path"])
        self.checkpoint_inference_config: dict[str, float | bool] = {}
        self.prototype_store = None
        self.prototype_vectors: torch.Tensor | None = None
        self.model, self.class_names = self._load_model()
        _, self.eval_transform = build_transforms(self.image_size, self.config.get("training"))
        self.full_frame_transform = self._build_full_frame_transform()
        inference_config = self._resolve_inference_config()
        self.top_k = int(inference_config["top_k"])
        self.confidence_threshold = float(inference_config["confidence_threshold"])
        self.margin_threshold = float(inference_config["margin_threshold"])
        self.entropy_threshold = float(inference_config["entropy_threshold"])
        self.min_consensus = float(inference_config["min_consensus"])
        self.temperature = float(inference_config["temperature"])
        self.tta_horizontal_flip = bool(inference_config["tta_horizontal_flip"])
        self.use_full_frame_view = bool(inference_config.get("use_full_frame_view", True))
        self.use_focus_crops = bool(inference_config.get("use_focus_crops", True))
        self.focus_crop_ratio = float(inference_config.get("focus_crop_ratio", 0.82))
        self.focus_crop_aspect_threshold = float(
            inference_config.get("focus_crop_aspect_threshold", 1.3)
        )
        self.class_confidence_thresholds = {
            class_id: float(threshold)
            for class_id, threshold in inference_config.get("class_confidence_thresholds", {}).items()
        }
        self.reject_on_prototype_disagreement = bool(
            inference_config.get("reject_on_prototype_disagreement", True)
        )
        self.prototype_similarity_threshold = float(inference_config.get("prototype_similarity_threshold", -1.0))
        loaded_prototype_thresholds = dict(getattr(self, "prototype_similarity_thresholds", {}))
        loaded_prototype_thresholds.update(
            {
                class_id: float(threshold)
                for class_id, threshold in inference_config.get("prototype_similarity_thresholds", {}).items()
            }
        )
        self.prototype_similarity_thresholds = loaded_prototype_thresholds

    def _resolve_device(self) -> torch.device:
        prefer_cuda = bool(self.config["training"].get("prefer_cuda", True))
        if prefer_cuda and torch.cuda.is_available():
            torch.backends.cuda.matmul.allow_tf32 = True
            torch.backends.cudnn.allow_tf32 = True
            return torch.device("cuda")
        return torch.device("cpu")

    def _load_model(self) -> tuple[torch.nn.Module, list[str]]:
        if not self.checkpoint_path.exists():
            raise FileNotFoundError(
                "Checkpoint do modelo não encontrado em "
                f"{self.checkpoint_path}. Treine o modelo antes de inferir."
            )

        checkpoint = torch.load(self.checkpoint_path, map_location=self.device, weights_only=False)
        class_names = checkpoint["class_names"]
        self._validate_checkpoint_classes(class_names)
        self.image_size = int(checkpoint.get("image_size", self.config["model"]["image_size"]))
        self.checkpoint_inference_config = dict(checkpoint.get("inference", {}))
        self.prototype_store = deserialize_prototype_store(checkpoint.get("prototype_store"))
        if self.prototype_store is not None and self.prototype_store.class_names != class_names:
            self.prototype_store = None
        if self.prototype_store is not None:
            self.prototype_similarity_thresholds = {
                class_id: float(threshold)
                for class_id, threshold in self.prototype_store.similarity_thresholds.items()
            }
        model = timm.create_model(
            checkpoint["model_name"],
            pretrained=False,
            num_classes=len(class_names),
            drop_rate=float(checkpoint.get("dropout", 0.0)),
        )
        model.load_state_dict(checkpoint["state_dict"])
        model.to(self.device)
        model.eval()
        if self.prototype_store is not None:
            self.prototype_vectors = F.normalize(
                self.prototype_store.vectors.to(self.device),
                dim=1,
            )
        return model, class_names

    def _resolve_inference_config(self) -> dict[str, float | bool]:
        defaults = {
            "top_k": 3,
            "confidence_threshold": 0.7,
            "margin_threshold": 0.18,
            "entropy_threshold": 0.55,
            "min_consensus": 0.6,
            "temperature": 1.15,
            "tta_horizontal_flip": True,
            "use_embedding_prototypes": True,
            "use_full_frame_view": True,
            "use_focus_crops": True,
            "focus_crop_ratio": 0.82,
            "focus_crop_aspect_threshold": 1.3,
            "reject_on_prototype_disagreement": True,
            "prototype_similarity_threshold": -1.0,
        }
        inference_config = dict(defaults)
        runtime_inference_config = dict(self.config.get("inference", {}))
        inference_config.update(runtime_inference_config)
        inference_config.update(self.checkpoint_inference_config)
        if "confidence_threshold" in runtime_inference_config:
            inference_config["confidence_threshold"] = float(runtime_inference_config["confidence_threshold"])
        max_confidence_threshold = runtime_inference_config.get("max_confidence_threshold")
        if max_confidence_threshold is not None:
            inference_config["confidence_threshold"] = min(
                float(inference_config["confidence_threshold"]),
                float(max_confidence_threshold),
            )
        return inference_config

    def _validate_checkpoint_classes(self, class_names: list[str]) -> None:
        checkpoint_classes = set(class_names)
        catalog_classes = set(self.catalog.keys())
        if checkpoint_classes == catalog_classes:
            return

        messages = ["Checkpoint incompatível com o catálogo atual."]
        missing_in_checkpoint = sorted(catalog_classes - checkpoint_classes)
        unexpected_in_checkpoint = sorted(checkpoint_classes - catalog_classes)
        if missing_in_checkpoint:
            messages.append("Classes faltando no checkpoint: " + ", ".join(missing_in_checkpoint))
        if unexpected_in_checkpoint:
            messages.append("Classes extras no checkpoint: " + ", ".join(unexpected_in_checkpoint))
        messages.append("Rode scripts/split_dataset.py e scripts/train.py para gerar um novo checkpoint.")
        raise RuntimeError(" | ".join(messages))

    def _load_image(self, image_input: ImageInput) -> Image.Image:
        if isinstance(image_input, Image.Image):
            return image_input.convert("RGB")
        if isinstance(image_input, bytes):
            with Image.open(BytesIO(image_input)) as image:
                return image.convert("RGB")
        with Image.open(image_input) as image:
            return image.convert("RGB")

    def _build_full_frame_transform(self) -> transforms.Compose:
        normalize = transforms.Normalize(
            mean=(0.485, 0.456, 0.406),
            std=(0.229, 0.224, 0.225),
        )
        return transforms.Compose(
            [
                transforms.ToTensor(),
                normalize,
            ]
        )

    def _mean_fill_color(self, image: Image.Image) -> tuple[int, int, int]:
        means = ImageStat.Stat(image).mean[:3]
        return tuple(int(round(value)) for value in means)

    def _full_frame_square_view(self, image: Image.Image) -> Image.Image:
        fill_color = self._mean_fill_color(image)
        return ImageOps.pad(
            image,
            (self.image_size, self.image_size),
            method=Image.Resampling.BILINEAR,
            color=fill_color,
            centering=(0.5, 0.5),
        )

    def _build_focus_crops(self, image: Image.Image) -> list[Image.Image]:
        width, height = image.size
        shorter_side = min(width, height)
        longer_side = max(width, height)
        if shorter_side <= 0:
            return []

        aspect_ratio = longer_side / shorter_side
        if aspect_ratio < self.focus_crop_aspect_threshold:
            return []

        crop_ratio = min(max(self.focus_crop_ratio, 0.6), 0.95)
        crops: list[Image.Image] = []
        if width >= height:
            crop_width = max(shorter_side, int(width * crop_ratio))
            if crop_width >= width:
                return []
            offsets = [0, max(0, (width - crop_width) // 2), width - crop_width]
            unique_offsets = sorted(set(offsets))
            for offset in unique_offsets:
                crops.append(image.crop((offset, 0, offset + crop_width, height)))
            return crops

        crop_height = max(shorter_side, int(height * crop_ratio))
        if crop_height >= height:
            return []
        offsets = [0, max(0, (height - crop_height) // 2), height - crop_height]
        unique_offsets = sorted(set(offsets))
        for offset in unique_offsets:
            crops.append(image.crop((0, offset, width, offset + crop_height)))
        return crops

    def _tensorize_view(self, image: Image.Image, *, preserve_full_frame: bool) -> torch.Tensor:
        if preserve_full_frame:
            return self.full_frame_transform(self._full_frame_square_view(image))
        return self.eval_transform(image)

    def _build_inference_tensors(self, image: Image.Image) -> list[torch.Tensor]:
        tensors = [self._tensorize_view(image, preserve_full_frame=False)]
        if self.use_full_frame_view:
            tensors.append(self._tensorize_view(image, preserve_full_frame=True))
        if self.use_focus_crops:
            tensors.extend(
                self._tensorize_view(crop, preserve_full_frame=True)
                for crop in self._build_focus_crops(image)
            )
        return tensors

    def _forward_with_embeddings(self, batch: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor | None]:
        forward_features = getattr(self.model, "forward_features", None)
        forward_head = getattr(self.model, "forward_head", None)
        if callable(forward_features) and callable(forward_head):
            features = forward_features(batch)
            embeddings = forward_head(features, pre_logits=True)
            logits = forward_head(features)
            if embeddings.ndim > 2:
                embeddings = torch.flatten(embeddings, start_dim=1)
            return logits, embeddings
        return self.model(batch), None

    def _build_top_predictions(self, probabilities: torch.Tensor) -> list[dict[str, str | float]]:
        top_probabilities, top_indices = torch.topk(
            probabilities,
            k=min(self.top_k, len(self.class_names)),
        )
        predictions: list[dict[str, str | float]] = []
        for confidence, index in zip(top_probabilities.tolist(), top_indices.tolist(), strict=False):
            class_id = self.class_names[index]
            profile = self.catalog.get(class_id)
            predictions.append(
                {
                    "class_id": class_id,
                    "display_name_pt": profile.display_name_pt if profile else class_id,
                    "confidence": round(float(confidence), 4),
                }
            )
        return predictions

    def _normalized_entropy(self, probabilities: torch.Tensor) -> float:
        if len(self.class_names) <= 1:
            return 0.0
        entropy = -(probabilities * torch.log(probabilities.clamp_min(1e-8))).sum().item()
        return float(entropy / math.log(len(self.class_names)))

    def _build_uncertainty_reasons(
        self,
        class_id: str,
        confidence: float,
        confidence_threshold: float,
        prototype_similarity: float | None,
        prototype_similarity_threshold: float | None,
        prototype_disagreement: bool,
        margin: float,
        entropy: float,
        consensus: float,
    ) -> list[str]:
        reasons: list[str] = []
        if confidence < confidence_threshold:
            if confidence_threshold > self.confidence_threshold:
                reasons.append(
                    f"a classe prevista exige confiança mínima de {confidence_threshold:.0%} e o valor observado ficou abaixo disso"
                )
            else:
                reasons.append(
                    "a confiança da classe principal ficou abaixo do mínimo esperado"
                )
        if (
            prototype_similarity is not None
            and prototype_similarity_threshold is not None
            and prototype_similarity < prototype_similarity_threshold
        ):
            reasons.append(
                "a imagem não ficou suficientemente parecida com os exemplos aprendidos dessa classe"
            )
        if prototype_disagreement and self.reject_on_prototype_disagreement:
            reasons.append(
                "o padrão visual mais parecido no espaço de embeddings apontou para outra classe"
            )
        if margin < self.margin_threshold:
            reasons.append(
                "as duas classes mais prováveis ficaram próximas demais entre si"
            )
        if entropy > self.entropy_threshold:
            reasons.append(
                "a distribuição de probabilidades ficou dispersa, sem um padrão dominante"
            )
        if consensus < self.min_consensus:
            reasons.append(
                "a previsão variou demais entre as diferentes leituras da mesma imagem"
            )
        return reasons

    def _confidence_threshold_for_class(self, class_id: str) -> float:
        return float(self.class_confidence_thresholds.get(class_id, self.confidence_threshold))

    def _prototype_similarity_threshold_for_class(self, class_id: str) -> float:
        return float(
            self.prototype_similarity_thresholds.get(
                class_id,
                self.prototype_similarity_threshold,
            )
        )

    def _build_uncertain_best_match(
        self,
        top_predictions: list[dict[str, str | float]],
    ) -> dict[str, object]:
        candidate_text = ", ".join(
            f"{prediction['display_name_pt']} ({float(prediction['confidence']):.1%})"
            for prediction in top_predictions
        )
        description = (
            "A IA não conseguiu identificar o item com segurança suficiente. "
            "Isso costuma acontecer quando o objeto foge do padrão aprendido, aparece com outra cor, "
            "ângulo, iluminação, fundo poluído ou está fora do catálogo esperado."
        )
        recommendation = (
            "Revise manualmente antes do descarte. Tire novas fotos mostrando o objeto inteiro, "
            "com fundo neutro e iluminação uniforme."
        )
        if candidate_text:
            recommendation += f" Hipóteses mais próximas: {candidate_text}."

        return {
            "class_id": "unknown",
            "display_name_pt": "Item não identificado com segurança",
            "description_pt": description,
            "material": format_material_label("não determinado"),
            "hazardous": False,
            "reusable": False,
            "disposal_stream": "manual_review",
            "recommendation": recommendation,
            "dropoff": "Não descarte com base em um palpite automático.",
            "preparation": "Tire novas fotos e confirme manualmente o tipo de item.",
            "region_notes": [],
            "location": None,
        }

    def predict(
        self,
        images: Sequence[ImageInput],
        latitude: float | None = None,
        longitude: float | None = None,
        country_code: str | None = None,
        state: str | None = None,
        state_code: str | None = None,
        city: str | None = None,
    ) -> dict:
        if not images:
            raise ValueError("Pelo menos uma imagem deve ser fornecida.")

        tensors = []
        views_analyzed = 0
        for image in images:
            pil_image = self._load_image(image)
            base_tensors = self._build_inference_tensors(pil_image)
            tensors.extend(base_tensors)
            views_analyzed += len(base_tensors)
            if self.tta_horizontal_flip:
                mirrored_tensors = self._build_inference_tensors(ImageOps.mirror(pil_image))
                tensors.extend(mirrored_tensors)
                views_analyzed += len(mirrored_tensors)

        batch = torch.stack(tensors).to(self.device)
        if self.device.type == "cuda":
            batch = batch.to(memory_format=torch.channels_last)
        with torch.inference_mode():
            if self.device.type == "cuda":
                with torch.autocast(device_type="cuda", dtype=torch.float16):
                    logits, embeddings = self._forward_with_embeddings(batch)
            else:
                logits, embeddings = self._forward_with_embeddings(batch)

        if self.temperature > 0 and self.temperature != 1.0:
            logits = logits / self.temperature

        aggregated_logits = logits.mean(dim=0, keepdim=True)
        probabilities = torch.softmax(aggregated_logits, dim=1)[0]
        per_view_probabilities = torch.softmax(logits, dim=1)
        top_predictions = self._build_top_predictions(probabilities)
        best_confidence, best_index = torch.max(probabilities, dim=0)
        best_class_id = self.class_names[int(best_index)]
        confidence = round(float(best_confidence), 4)
        class_confidence_threshold = self._confidence_threshold_for_class(best_class_id)
        prototype_similarity = None
        prototype_similarity_threshold = None
        prototype_best_class_id = None
        prototype_disagreement = False
        if embeddings is not None and self.prototype_vectors is not None:
            normalized_embeddings = F.normalize(embeddings.float(), dim=1)
            aggregated_embedding = F.normalize(normalized_embeddings.mean(dim=0, keepdim=True), dim=1)[0]
            similarities = aggregated_embedding @ self.prototype_vectors.T
            prototype_best_index = int(similarities.argmax().item())
            prototype_best_class_id = self.class_names[prototype_best_index]
            prototype_disagreement = prototype_best_class_id != best_class_id
            prototype_similarity = round(float(similarities[int(best_index)].item()), 4)
            prototype_similarity_threshold = round(
                self._prototype_similarity_threshold_for_class(best_class_id),
                4,
            )
        second_confidence = 0.0
        if len(self.class_names) > 1:
            top_two = torch.topk(probabilities, k=2).values.tolist()
            second_confidence = float(top_two[1])
        margin = round(confidence - second_confidence, 4)
        entropy = round(self._normalized_entropy(probabilities), 4)
        consensus = round(
            float((per_view_probabilities.argmax(dim=1) == best_index).float().mean().item()),
            4,
        )
        uncertainty_reasons = self._build_uncertainty_reasons(
            class_id=best_class_id,
            confidence=confidence,
            confidence_threshold=class_confidence_threshold,
            prototype_similarity=prototype_similarity,
            prototype_similarity_threshold=prototype_similarity_threshold,
            prototype_disagreement=prototype_disagreement,
            margin=margin,
            entropy=entropy,
            consensus=consensus,
        )
        uncertain_prediction = bool(uncertainty_reasons)
        classification_source = "model"

        if uncertain_prediction:
            advisory = self._build_uncertain_best_match(top_predictions)
            classification_source = "uncertain"
        else:
            location_context = self.location_resolver.resolve(
                latitude=latitude,
                longitude=longitude,
                country_code=country_code,
                state=state,
                state_code=state_code,
                city=city,
            )
            advisory = self.advisor.recommend(best_class_id, location_context)
            classification_source = "model"

        return {
            "images_analyzed": len(images),
            "views_analyzed": views_analyzed,
            "device": str(self.device),
            "confidence": confidence,
            "margin": margin,
            "entropy": entropy,
            "consensus": consensus,
            "effective_confidence_threshold": round(class_confidence_threshold, 4),
            "prototype_similarity": prototype_similarity,
            "prototype_best_class_id": prototype_best_class_id,
            "prototype_disagreement": prototype_disagreement,
            "effective_prototype_similarity_threshold": prototype_similarity_threshold,
            "uncertain_prediction": uncertain_prediction,
            "uncertainty_reasons": uncertainty_reasons,
            "top_predictions": top_predictions,
            "classification_source": classification_source,
            "best_match": advisory,
        }


def format_analysis_report(result: dict) -> str:
    best_match = result["best_match"]
    lines = [
        f"Item identificado: {best_match['display_name_pt']}",
        f"Descrição: {best_match['description_pt']}",
        f"Material: {best_match['material']}",
        f"Confiança: {result['confidence']:.2%}",
        f"Canal de descarte: {best_match['dropoff']}",
        f"Como descartar: {best_match['recommendation']}",
        f"Preparação: {best_match['preparation']}",
    ]
    if result["uncertain_prediction"]:
        lines.append("Aviso: a IA não atingiu segurança suficiente para cravar a classe.")
        for reason in result.get("uncertainty_reasons", []):
            lines.append(f"- Motivo: {reason}")
    top_predictions = result.get("top_predictions", [])
    if top_predictions:
        lines.append("Hipóteses mais próximas:")
        lines.extend(
            f"- {prediction['display_name_pt']}: {float(prediction['confidence']):.2%}"
            for prediction in top_predictions
        )
    if best_match["region_notes"]:
        lines.append("Observações da região:")
        lines.extend(f"- {note}" for note in best_match["region_notes"])
    return "\n".join(lines)
