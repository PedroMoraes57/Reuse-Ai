from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

from reuse_ai.advisor import DisposalAdvisor
from reuse_ai.catalog import ClassProfile, load_class_catalog
from reuse_ai.config import load_project_config, load_yaml


@dataclass(frozen=True)
class TopicProfile:
    id: str
    response_type: str
    answer: str
    action: str
    aliases: tuple[str, ...]
    quick_replies: tuple[str, ...]
    alert: str | None = None


class ChatbotKnowledgeBase:
    _ITEM_ALIASES = {
        "battery": ("pilha", "pilhas", "bateria comum", "bateria pequena", "bateria"),
        "battery_waste": ("bateria usada", "bateria de celular", "bateria de notebook", "bateria automotiva"),
        "glass_bottle": ("garrafa de vidro", "vidro", "garrafa vidro"),
        "plastic_bottle": ("garrafa pet", "pet", "garrafa plastica"),
        "plastic_bag": ("sacola", "sacola plastica", "sacolinha", "filme plastico"),
        "paper_cup": ("copo de papel", "copo descartavel de papel"),
        "copo_plastico": ("copo plastico", "copinho plastico", "copo descartavel plastico"),
        "plastic_food_containers": ("pote plastico", "embalagem plastica", "pote de comida"),
        "plastic_lunch_box": ("marmita", "marmita plastica"),
        "milk_carton": ("caixa de leite", "longa vida", "tetra pak", "tetrapak"),
        "pizza_box": ("caixa de pizza", "papelao engordurado"),
        "metal_can": ("lata", "latinha", "lata de aluminio"),
        "light_bulbs": ("lampada", "lampada quebrada", "lampada fluorescente", "lampada led"),
        "mobile": ("celular", "smartphone", "telefone"),
        "earphones": ("fone", "fone de ouvido", "headphone"),
        "television": ("televisao", "tv", "monitor"),
        "washing_machine": ("maquina de lavar", "lavadora"),
        "microwave": ("microondas", "micro ondas", "micro-ondas"),
        "styrofoam_tray": ("isopor", "bandeja de isopor"),
        "newspaper": ("jornal", "papel seco", "revista"),
        "cardboard_box": ("caixa de papelao", "papelao", "caixa de papel"),
        "food_waste": ("resto de comida", "sobras de comida", "comida estragada"),
        "egg_shell": ("casca de ovo", "cascas de ovo"),
    }

    _SYNONYM_GROUPS = {
        "bateria": ("pilha", "pilhas", "bateria", "baterias"),
        "descartar": ("jogar", "descartar", "descarte", "colocar", "levar"),
        "reciclar": ("reciclar", "reciclavel", "reciclaveis", "reciclagem"),
        "lixo": ("lixo", "residuo", "residuos", "rejeito"),
        "lavar": ("lavar", "enxaguar", "limpar", "higienizar"),
        "sustentavel": ("sustentavel", "sustentabilidade", "ecologico", "ambiental"),
        "reutilizar": ("reutilizar", "reusar", "reuso", "reaproveitar"),
        "coleta": ("coleta", "ecoponto", "pev", "ponto"),
        "oleo": ("oleo", "azeite usado", "oleo usado", "oleo de fritura"),
        "organico": ("organico", "compostagem", "composteira", "compostar"),
    }

    def __init__(
        self,
        catalog_path: str | Path | None = None,
        rules_path: str | Path | None = None,
        topics_path: str | Path | None = None,
    ) -> None:
        config = load_project_config()
        paths = config["paths"]
        self.catalog_path = catalog_path or paths["class_catalog"]
        self.rules_path = rules_path or paths["disposal_rules"]
        self.topics_path = topics_path or paths["chat_topics"]
        self.catalog = load_class_catalog(self.catalog_path)
        self.advisor = DisposalAdvisor(self.catalog_path, self.rules_path)
        self.topics = self._load_topics()

    def build_intent_definitions(self) -> list[dict[str, Any]]:
        return self._build_item_intents() + self._build_topic_intents()

    def build_synonyms(self) -> dict[str, str]:
        synonyms: dict[str, str] = {}
        for canonical, aliases in self._SYNONYM_GROUPS.items():
            for alias in aliases:
                synonyms[alias] = canonical
        return synonyms

    def get_topic(self, topic_id: str) -> TopicProfile:
        return self.topics[topic_id]

    def build_item_payload(
        self,
        class_id: str,
        analysis_context: dict[str, Any] | None = None,
    ) -> tuple[ClassProfile, dict[str, Any]]:
        profile = self.catalog[class_id]
        advisory = self.advisor.recommend(class_id)
        best_match = analysis_context.get("best_match", {}) if analysis_context else {}
        if class_id == best_match.get("class_id"):
            advisory.update(
                {
                    "dropoff": best_match.get("dropoff", advisory["dropoff"]),
                    "recommendation": best_match.get("recommendation", advisory["recommendation"]),
                    "preparation": best_match.get("preparation", advisory["preparation"]),
                    "region_notes": best_match.get("region_notes", advisory.get("region_notes", [])),
                }
            )
        return profile, advisory

    def _build_item_intents(self) -> list[dict[str, Any]]:
        intents: list[dict[str, Any]] = []
        for class_id, profile in self.catalog.items():
            aliases = set(self._ITEM_ALIASES.get(class_id, ()))
            aliases.add(profile.display_name_pt)
            aliases.add(class_id.replace("_", " "))
            examples = list(aliases)
            for alias in list(aliases):
                examples.extend(
                    [
                        f"onde descartar {alias}",
                        f"como descartar {alias}",
                        f"{alias} vai no lixo comum",
                        f"{alias} pode reciclar",
                        f"precisa lavar {alias}",
                    ]
                )
            intents.append(
                {
                    "intent_id": f"item:{class_id}",
                    "label": profile.display_name_pt,
                    "examples": tuple(dict.fromkeys(examples)),
                    "metadata": {
                        "kind": "item",
                        "class_id": class_id,
                        "display_name_pt": profile.display_name_pt,
                    },
                }
            )
        return intents

    def _build_topic_intents(self) -> list[dict[str, Any]]:
        intents: list[dict[str, Any]] = []
        for topic_id, topic in self.topics.items():
            examples = list(topic.aliases) + list(topic.quick_replies)
            intents.append(
                {
                    "intent_id": f"topic:{topic_id}",
                    "label": topic_id.replace("_", " "),
                    "examples": tuple(dict.fromkeys(examples)),
                    "metadata": {"kind": "topic", "topic_id": topic_id},
                }
            )
        return intents

    def _load_topics(self) -> dict[str, TopicProfile]:
        raw_topics = load_yaml(self.topics_path).get("topics", [])
        topics: dict[str, TopicProfile] = {}
        for entry in raw_topics:
            topics[entry["id"]] = TopicProfile(
                id=entry["id"],
                response_type=entry["response_type"],
                answer=entry["answer"],
                action=entry["action"],
                aliases=tuple(entry.get("aliases", [])),
                quick_replies=tuple(entry.get("quick_replies", [])),
                alert=entry.get("alert"),
            )
        return topics
