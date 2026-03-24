from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from reuse_ai.config import load_yaml


@dataclass(frozen=True)
class ClassProfile:
    id: str
    display_name_pt: str
    description_pt: str
    material: str
    disposal_stream: str
    reusable: bool
    hazardous: bool


def load_class_catalog(path: str | Path) -> dict[str, ClassProfile]:
    raw_catalog = load_yaml(path)
    catalog: dict[str, ClassProfile] = {}
    for entry in raw_catalog.get("classes", []):
        profile = ClassProfile(
            id=entry["id"],
            display_name_pt=entry["display_name_pt"],
            description_pt=entry["description_pt"],
            material=entry["material"],
            disposal_stream=entry["disposal_stream"],
            reusable=bool(entry.get("reusable", False)),
            hazardous=bool(entry.get("hazardous", False)),
        )
        if profile.id in catalog:
            raise ValueError(f"Classe duplicada no catalogo: {profile.id}")
        catalog[profile.id] = profile
    return catalog


def list_class_ids(path: str | Path) -> list[str]:
    return list(load_class_catalog(path).keys())
