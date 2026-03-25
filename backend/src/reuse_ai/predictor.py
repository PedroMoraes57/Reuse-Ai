from __future__ import annotations

from io import BytesIO
from pathlib import Path
from typing import Sequence

import timm
import torch
from PIL import Image

from reuse_ai.advisor import DisposalAdvisor
from reuse_ai.catalog import load_class_catalog
from reuse_ai.config import ensure_runtime_dirs, load_project_config
from reuse_ai.data import build_transforms
from reuse_ai.location import LocationResolver


ImageInput = str | Path | Image.Image | bytes


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
        self.model, self.class_names = self._load_model()
        _, self.eval_transform = build_transforms(self.image_size)
        self.top_k = int(self.config["inference"]["top_k"])
        self.confidence_threshold = float(self.config["inference"]["confidence_threshold"])

    def _resolve_device(self) -> torch.device:
        prefer_cuda = bool(self.config["training"].get("prefer_cuda", True))
        if prefer_cuda and torch.cuda.is_available():
            return torch.device("cuda")
        return torch.device("cpu")

    def _load_model(self) -> tuple[torch.nn.Module, list[str]]:
        if not self.checkpoint_path.exists():
            raise FileNotFoundError(
                "Checkpoint do modelo nao encontrado em "
                f"{self.checkpoint_path}. Treine o modelo antes de inferir."
            )

        checkpoint = torch.load(self.checkpoint_path, map_location=self.device, weights_only=False)
        class_names = checkpoint["class_names"]
        self._validate_checkpoint_classes(class_names)
        self.image_size = int(checkpoint.get("image_size", self.config["model"]["image_size"]))
        model = timm.create_model(
            checkpoint["model_name"],
            pretrained=False,
            num_classes=len(class_names),
            drop_rate=float(checkpoint.get("dropout", 0.0)),
        )
        model.load_state_dict(checkpoint["state_dict"])
        model.to(self.device)
        model.eval()
        return model, class_names

    def _validate_checkpoint_classes(self, class_names: list[str]) -> None:
        checkpoint_classes = set(class_names)
        catalog_classes = set(self.catalog.keys())
        if checkpoint_classes == catalog_classes:
            return

        messages = ["Checkpoint incompativel com o catalogo atual."]
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
        for image in images:
            pil_image = self._load_image(image)
            tensors.append(self.eval_transform(pil_image))

        batch = torch.stack(tensors).to(self.device)
        if self.device.type == "cuda":
            batch = batch.to(memory_format=torch.channels_last)
        with torch.inference_mode():
            if self.device.type == "cuda":
                with torch.autocast(device_type="cuda", dtype=torch.float16):
                    logits = self.model(batch)
            else:
                logits = self.model(batch)

        aggregated_logits = logits.mean(dim=0, keepdim=True)
        probabilities = torch.softmax(aggregated_logits, dim=1)[0]
        top_probabilities, top_indices = torch.topk(probabilities, k=min(self.top_k, len(self.class_names)))

        predictions = []
        for confidence, index in zip(top_probabilities.tolist(), top_indices.tolist(), strict=False):
            class_id = self.class_names[index]
            profile = self.catalog.get(class_id)
            predictions.append(
                {
                    "class_id": class_id,
                    "display_name_pt": profile.display_name_pt if profile else class_id,
                    "confidence": round(confidence, 4),
                }
            )

        best_class_id = predictions[0]["class_id"]
        location_context = self.location_resolver.resolve(
            latitude=latitude,
            longitude=longitude,
            country_code=country_code,
            state=state,
            state_code=state_code,
            city=city,
        )
        advisory = self.advisor.recommend(best_class_id, location_context)

        return {
            "images_analyzed": len(images),
            "device": str(self.device),
            "uncertain_prediction": predictions[0]["confidence"] < self.confidence_threshold,
            "top_predictions": predictions,
            "best_match": advisory,
        }


def format_analysis_report(result: dict) -> str:
    best_match = result["best_match"]
    top_predictions = result["top_predictions"]
    lines = [
        f"Item identificado: {best_match['display_name_pt']}",
        f"Descricao: {best_match['description_pt']}",
        f"Material: {best_match['material']}",
        f"Canal de descarte: {best_match['dropoff']}",
        f"Como descartar: {best_match['recommendation']}",
        f"Preparacao: {best_match['preparation']}",
    ]
    if result["uncertain_prediction"]:
        lines.append("Aviso: confianca baixa; vale capturar mais imagens do mesmo item.")
    if best_match["region_notes"]:
        lines.append("Observacoes da regiao:")
        lines.extend(f"- {note}" for note in best_match["region_notes"])
    lines.append("Top previsoes:")
    lines.extend(
        f"- {prediction['display_name_pt']}: {prediction['confidence']:.2%}"
        for prediction in top_predictions
    )
    return "\n".join(lines)
