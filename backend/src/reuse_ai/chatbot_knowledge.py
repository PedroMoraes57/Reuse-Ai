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
    keywords: tuple[str, ...]
    quick_replies: tuple[str, ...]
    alert: str | None = None


@dataclass(frozen=True)
class SystemProfile:
    id: str
    kind: str
    label: str
    response_type: str
    answer: str
    action: str
    aliases: tuple[str, ...]
    keywords: tuple[str, ...]
    route_ids: tuple[str, ...]
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
        "plastic_lunch_box": (
            "marmita",
            "marmita plastica",
            "embalagem de marmita",
            "embalagem da marmita",
            "pote de marmita",
            "marmitex",
        ),
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
        "acessibilidade": ("acessibilidade", "acessivel", "acessiveis", "inclusao"),
        "teclado": ("teclado", "tab", "tabulacao", "tabulacao"),
        "contraste": ("contraste", "legibilidade", "visibilidade"),
        "imagem": ("imagem", "foto", "figura", "icone"),
        "pagina": ("pagina", "tela", "aba", "area"),
        "sistema": ("sistema", "plataforma", "site", "app"),
        "conta": ("conta", "perfil", "usuario", "cadastro"),
        "ranking": ("ranking", "lideranca", "pontuacao", "xp", "nivel", "missoes"),
        "amigos": ("amigos", "amizade", "contatos"),
        "batalha": ("batalha", "duelo", "desafio", "quiz"),
        "localizacao": ("localizacao", "gps", "mapa", "proximos"),
    }

    def __init__(
        self,
        catalog_path: str | Path | None = None,
        rules_path: str | Path | None = None,
        topics_path: str | Path | None = None,
        system_path: str | Path | None = None,
    ) -> None:
        config = load_project_config()
        paths = config["paths"]
        self.catalog_path = catalog_path or paths["class_catalog"]
        self.rules_path = rules_path or paths["disposal_rules"]
        self.topics_path = topics_path or paths["chat_topics"]
        self.system_path = system_path or paths["chat_system_knowledge"]
        self.catalog = load_class_catalog(self.catalog_path)
        self.advisor = DisposalAdvisor(self.catalog_path, self.rules_path)
        self.topics = self._load_topics()
        self.system_entries = self._load_system_entries()
        self._system_by_route = self._build_system_route_index()

    def build_intent_definitions(self) -> list[dict[str, Any]]:
        return (
            self._build_item_intents()
            + self._build_topic_intents()
            + self._build_system_intents()
        )

    def build_synonyms(self) -> dict[str, str]:
        synonyms: dict[str, str] = {}
        for canonical, aliases in self._SYNONYM_GROUPS.items():
            for alias in aliases:
                synonyms[alias] = canonical
        return synonyms

    def get_topic(self, topic_id: str) -> TopicProfile:
        return self.topics[topic_id]

    def get_system_entry(self, entry_id: str) -> SystemProfile:
        return self.system_entries[entry_id]

    def get_system_entry_for_route(self, route_id: str) -> SystemProfile | None:
        return self._system_by_route.get(route_id)

    def build_item_alias_map(self) -> dict[str, tuple[str, ...]]:
        alias_map: dict[str, tuple[str, ...]] = {}
        for class_id, profile in self.catalog.items():
            aliases = set(self._ITEM_ALIASES.get(class_id, ()))
            aliases.add(profile.display_name_pt)
            aliases.add(class_id.replace("_", " "))
            alias_map[class_id] = tuple(sorted(aliases))
        return alias_map

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
            examples = list(topic.aliases) + list(topic.keywords) + list(topic.quick_replies)
            intents.append(
                {
                    "intent_id": f"topic:{topic_id}",
                    "label": topic_id.replace("_", " "),
                    "examples": tuple(dict.fromkeys(examples)),
                    "metadata": {"kind": "topic", "topic_id": topic_id},
                }
            )
        return intents

    def _build_system_intents(self) -> list[dict[str, Any]]:
        intents: list[dict[str, Any]] = []
        for entry_id, entry in self.system_entries.items():
            generated_examples = self._system_entry_examples(entry)
            intents.append(
                {
                    "intent_id": f"system:{entry_id}",
                    "label": entry.label,
                    "examples": tuple(dict.fromkeys(generated_examples)),
                    "metadata": {
                        "kind": "system",
                        "entry_id": entry_id,
                        "entry_kind": entry.kind,
                        "route_ids": entry.route_ids,
                    },
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
                keywords=tuple(entry.get("keywords", [])),
                quick_replies=tuple(entry.get("quick_replies", [])),
                alert=entry.get("alert"),
            )
        return topics

    def _load_system_entries(self) -> dict[str, SystemProfile]:
        raw_entries = load_yaml(self.system_path).get("entries", [])
        entries: dict[str, SystemProfile] = {}
        for entry in raw_entries:
            entries[entry["id"]] = SystemProfile(
                id=entry["id"],
                kind=entry.get("kind", "feature"),
                label=entry["label"],
                response_type=entry["response_type"],
                answer=entry["answer"],
                action=entry["action"],
                aliases=tuple(entry.get("aliases", [])),
                keywords=tuple(entry.get("keywords", [])),
                route_ids=tuple(entry.get("route_ids", [])),
                quick_replies=tuple(entry.get("quick_replies", [])),
                alert=entry.get("alert"),
            )
        return entries

    def _build_system_route_index(self) -> dict[str, SystemProfile]:
        index: dict[str, SystemProfile] = {}
        for entry in self.system_entries.values():
            if entry.kind != "page":
                continue
            for route_id in entry.route_ids:
                index[route_id] = entry
        return index

    def _system_entry_examples(self, entry: SystemProfile) -> list[str]:
        examples = list(entry.aliases) + list(entry.keywords) + list(entry.quick_replies)
        generated = []
        for alias in entry.aliases[:8]:
            generated.extend(
                [
                    f"como funciona {alias}",
                    f"para que serve {alias}",
                    f"onde fica {alias}",
                    f"o que tem em {alias}",
                    f"como usar {alias}",
                ]
            )
            if entry.kind == "page":
                generated.extend(
                    [
                        f"o que posso fazer nessa {alias}",
                        f"como usar essa {alias}",
                        f"o que essa {alias} faz",
                    ]
                )
        return examples + generated
