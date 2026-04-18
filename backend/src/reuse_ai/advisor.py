from __future__ import annotations

from copy import deepcopy
from pathlib import Path
from typing import Any

from reuse_ai.catalog import ClassProfile, load_class_catalog
from reuse_ai.config import load_yaml
from reuse_ai.location import LocationContext
from reuse_ai.presentation import format_material_label, sentence_case_pt_br


def _merge_dict(base: dict[str, Any], incoming: dict[str, Any]) -> dict[str, Any]:
    for key, value in incoming.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            base[key] = _merge_dict(base[key], value)
        else:
            base[key] = value
    return base


def _validate_rule_coverage(catalog: dict[str, ClassProfile], rules: dict[str, Any]) -> None:
    streams = rules.get("streams", {})
    if not streams:
        raise ValueError("Nenhum fluxo de descarte foi definido em disposal_rules.yaml.")

    missing_streams = sorted(
        {
            profile.disposal_stream
            for profile in catalog.values()
            if profile.disposal_stream not in streams
        }
    )
    if missing_streams:
        raise ValueError(
            "Fluxos de descarte ausentes em disposal_rules.yaml: "
            + ", ".join(missing_streams)
        )


class DisposalAdvisor:
    def __init__(self, catalog_path: str | Path, rules_path: str | Path) -> None:
        self.catalog = load_class_catalog(catalog_path)
        self.rules = load_yaml(rules_path)
        _validate_rule_coverage(self.catalog, self.rules)

    def recommend(self, class_id: str, location: LocationContext | None = None) -> dict[str, Any]:
        if class_id not in self.catalog:
            raise KeyError(f"Classe não encontrada no catálogo: {class_id}")

        profile: ClassProfile = self.catalog[class_id]
        stream_name = profile.disposal_stream
        stream_rules = deepcopy(self.rules["streams"][stream_name])
        region_notes: list[str] = []
        region_keys = location.region_keys if location and location.region_keys else [self.rules.get("default_region", "BR")]

        for region_key in region_keys:
            region_config = self.rules.get("regions", {}).get(region_key)
            if not region_config:
                continue
            if "overrides" in region_config and stream_name in region_config["overrides"]:
                stream_rules = _merge_dict(stream_rules, region_config["overrides"][stream_name])
            region_notes.extend(region_config.get("notes", []))

        return {
            "class_id": profile.id,
            "display_name_pt": sentence_case_pt_br(profile.display_name_pt),
            "description_pt": sentence_case_pt_br(profile.description_pt),
            "material": format_material_label(profile.material),
            "hazardous": profile.hazardous,
            "reusable": profile.reusable,
            "disposal_stream": stream_name,
            "recommendation": sentence_case_pt_br(stream_rules["recommendation"]),
            "dropoff": sentence_case_pt_br(stream_rules["dropoff"]),
            "preparation": sentence_case_pt_br(stream_rules["preparation"]),
            "region_notes": [sentence_case_pt_br(note) for note in region_notes],
            "location": location.to_dict() if location else None,
        }
