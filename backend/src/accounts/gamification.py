from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta
import random
import re
from typing import Any
import unicodedata

from django.contrib.auth.models import User
from django.db import transaction
from django.db.models import Exists, OuterRef, Q, Sum
from django.db.models.functions import Coalesce
from django.utils import timezone

from .models import (
    AnalysisRecord,
    MissionClaim,
    SustainabilityBattle,
    UserNotification,
    UserProfile,
    XpEvent,
    get_or_create_profile,
)
from reuse_ai.presentation import format_material_label, normalize_pt_br_text, sentence_case_pt_br

BASE_ANALYSIS_XP = 10
FIRST_DAILY_ANALYSIS_XP = 15
NEW_MATERIAL_XP = 20
QUIZ_CORRECT_XP = 5
BATTLE_COMPLETION_XP = 6
BATTLE_WINNER_BONUS_XP = 4
BATTLE_TIE_BONUS_XP = 2
BATTLE_QUESTION_COUNT = 6
BATTLE_TIEBREAKER_QUESTION_COUNT = 2
BATTLE_PRIMARY_POINTS = 10
BATTLE_STEAL_POINTS = 5

BATTLE_QUESTION_BANK = [
    {
        "id": "battle_recycle_clean",
        "prompt": "Antes de reciclar uma embalagem, o mais indicado é:",
        "options": [
            {"id": "a", "label": "Lavar ou esvaziar para evitar contaminação"},
            {"id": "b", "label": "Misturar com lixo orgânico para economizar espaço"},
            {"id": "c", "label": "Queimar se estiver muito suja"},
            {"id": "d", "label": "Enviar direto para o vaso sanitário"},
        ],
        "correct_option_id": "a",
        "correct_label": "Lavar ou esvaziar para evitar contaminação",
    },
    {
        "id": "battle_glass_route",
        "prompt": "Garrafas e frascos de vidro sem contaminação devem ir, em geral, para:",
        "options": [
            {"id": "a", "label": "Coleta seletiva de recicláveis"},
            {"id": "b", "label": "Lixo comum sem separação"},
            {"id": "c", "label": "Descarga do banheiro"},
            {"id": "d", "label": "Compostagem doméstica"},
        ],
        "correct_option_id": "a",
        "correct_label": "Coleta seletiva de recicláveis",
    },
    {
        "id": "battle_electronics",
        "prompt": "Eletrônicos pequenos, como mouse ou celular antigo, costumam exigir:",
        "options": [
            {"id": "a", "label": "Logística reversa ou ecoponto"},
            {"id": "b", "label": "Reciclagem de papel"},
            {"id": "c", "label": "Descarte em vaso sanitário"},
            {"id": "d", "label": "Mistura com resíduos orgânicos"},
        ],
        "correct_option_id": "a",
        "correct_label": "Logística reversa ou ecoponto",
    },
    {
        "id": "battle_plastic_lid",
        "prompt": "Quando uma garrafa PET ainda está com tampa, a melhor prática é:",
        "options": [
            {"id": "a", "label": "Separar os itens conforme a orientação local"},
            {"id": "b", "label": "Jogar tudo no lixo comum"},
            {"id": "c", "label": "Misturar com restos de comida"},
            {"id": "d", "label": "Guardar indefinidamente em casa"},
        ],
        "correct_option_id": "a",
        "correct_label": "Separar os itens conforme a orientação local",
    },
    {
        "id": "battle_reuse_priority",
        "prompt": "Na lógica da sustentabilidade, antes de reciclar vale considerar:",
        "options": [
            {"id": "a", "label": "Redução e reuso sempre que possível"},
            {"id": "b", "label": "Descartar mais rápido"},
            {"id": "c", "label": "Misturar materiais para ganhar tempo"},
            {"id": "d", "label": "Ignorar a durabilidade do item"},
        ],
        "correct_option_id": "a",
        "correct_label": "Redução e reuso sempre que possível",
    },
    {
        "id": "battle_battery",
        "prompt": "Pilhas e baterias usadas devem seguir, em geral, para:",
        "options": [
            {"id": "a", "label": "Pontos de coleta específicos ou logística reversa"},
            {"id": "b", "label": "Lixeira de papel"},
            {"id": "c", "label": "Lixeira de orgânicos"},
            {"id": "d", "label": "Qualquer rio ou área aberta"},
        ],
        "correct_option_id": "a",
        "correct_label": "Pontos de coleta específicos ou logística reversa",
    },
    {
        "id": "battle_food_soiled_paper",
        "prompt": "Papel muito engordurado ou contaminado por comida geralmente vai para:",
        "options": [
            {"id": "a", "label": "Rejeito ou tratamento específico, não reciclável comum"},
            {"id": "b", "label": "Reciclagem de papel seco"},
            {"id": "c", "label": "Logística reversa de eletrônicos"},
            {"id": "d", "label": "Vidro reciclável"},
        ],
        "correct_option_id": "a",
        "correct_label": "Rejeito ou tratamento específico, não reciclável comum",
    },
    {
        "id": "battle_compost",
        "prompt": "Resíduos orgânicos como cascas de frutas podem seguir para:",
        "options": [
            {"id": "a", "label": "Compostagem, quando houver essa opção"},
            {"id": "b", "label": "Lixeira de vidro"},
            {"id": "c", "label": "Reciclagem de metal"},
            {"id": "d", "label": "Logística reversa de pilhas"},
        ],
        "correct_option_id": "a",
        "correct_label": "Compostagem, quando houver essa opção",
    },
    {
        "id": "battle_cooking_oil",
        "prompt": "Óleo de cozinha usado deve ser descartado, em geral, em:",
        "options": [
            {"id": "a", "label": "Pontos de coleta específicos, nunca no ralo"},
            {"id": "b", "label": "Pia da cozinha com água quente"},
            {"id": "c", "label": "Vaso sanitário para diluir mais rápido"},
            {"id": "d", "label": "Lixeira de papel"},
        ],
        "correct_option_id": "a",
        "correct_label": "Pontos de coleta específicos, nunca no ralo",
    },
    {
        "id": "battle_medicine",
        "prompt": "Medicamentos vencidos e suas embalagens exigem, em geral:",
        "options": [
            {"id": "a", "label": "Devolução em pontos de coleta ou farmácias participantes"},
            {"id": "b", "label": "Mistura com recicláveis comuns"},
            {"id": "c", "label": "Descarte no lixo orgânico"},
            {"id": "d", "label": "Descarga no vaso sanitário"},
        ],
        "correct_option_id": "a",
        "correct_label": "Devolução em pontos de coleta ou farmácias participantes",
    },
    {
        "id": "battle_donation",
        "prompt": "Roupas em bom estado, antes de irem para descarte, podem seguir para:",
        "options": [
            {"id": "a", "label": "Doação, reuso ou bazares solidários"},
            {"id": "b", "label": "Queima controlada em casa"},
            {"id": "c", "label": "Mistura com entulho"},
            {"id": "d", "label": "Lixeira de vidro"},
        ],
        "correct_option_id": "a",
        "correct_label": "Doação, reuso ou bazares solidários",
    },
    {
        "id": "battle_aerosol",
        "prompt": "Uma lata de aerossol completamente vazia deve seguir, em geral, para:",
        "options": [
            {"id": "a", "label": "Orientação local da coleta seletiva ou de metal"},
            {"id": "b", "label": "Lixeira de orgânicos"},
            {"id": "c", "label": "Descarga do banheiro"},
            {"id": "d", "label": "Mistura com papel úmido"},
        ],
        "correct_option_id": "a",
        "correct_label": "Orientação local da coleta seletiva ou de metal",
    },
    {
        "id": "battle_cardboard",
        "prompt": "Caixas de papelão secas e limpas normalmente devem ir para:",
        "options": [
            {"id": "a", "label": "Coleta seletiva de papel e papelão"},
            {"id": "b", "label": "Lixo comum sem separação"},
            {"id": "c", "label": "Vaso sanitário"},
            {"id": "d", "label": "Coleta exclusiva de vidro"},
        ],
        "correct_option_id": "a",
        "correct_label": "Coleta seletiva de papel e papelão",
    },
    {
        "id": "battle_lamp",
        "prompt": "Lâmpadas fluorescentes costumam exigir:",
        "options": [
            {"id": "a", "label": "Logística reversa ou ponto de coleta específico"},
            {"id": "b", "label": "Reciclagem comum de papel"},
            {"id": "c", "label": "Compostagem doméstica"},
            {"id": "d", "label": "Descarte direto no lixo orgânico"},
        ],
        "correct_option_id": "a",
        "correct_label": "Logística reversa ou ponto de coleta específico",
    },
    {
        "id": "battle_tetra_pak",
        "prompt": "Embalagens longa-vida, depois de esvaziadas, devem ser:",
        "options": [
            {"id": "a", "label": "Encaminhadas conforme a coleta seletiva local"},
            {"id": "b", "label": "Misturadas com restos de comida"},
            {"id": "c", "label": "Lavadas e descartadas no vaso sanitário"},
            {"id": "d", "label": "Queimadas para reduzir volume"},
        ],
        "correct_option_id": "a",
        "correct_label": "Encaminhadas conforme a coleta seletiva local",
    },
    {
        "id": "battle_mirror_glass",
        "prompt": "Espelhos e vidros temperados não costumam seguir a mesma rota do vidro comum. Em geral, exigem:",
        "options": [
            {"id": "a", "label": "Orientação específica do município ou ecoponto"},
            {"id": "b", "label": "Coleta seletiva comum de papel"},
            {"id": "c", "label": "Compostagem em casa"},
            {"id": "d", "label": "Mistura com resíduos orgânicos"},
        ],
        "correct_option_id": "a",
        "correct_label": "Orientação específica do município ou ecoponto",
    },
]

ITEM_DISTRACTORS = [
    "Garrafa PET",
    "Lata de alumínio",
    "Caixa de papelão",
    "Pilha",
    "Lâmpada",
    "Casca de banana",
    "Sacola plástica",
    "Celular antigo",
]

MATERIAL_DISTRACTORS = [
    "Plástico",
    "Papel",
    "Metal",
    "Vidro",
    "Orgânico",
    "Tecido",
    "Madeira",
    "Multimaterial",
]

DESTINATION_OPTIONS = [
    "Coleta seletiva ou ponto de recicláveis",
    "Ecoponto ou logística reversa",
    "Rejeito ou lixo comum",
    "Doação, reuso ou reaproveitamento",
    "Orgânicos ou compostagem",
    "Separação antes do descarte",
]

_RANDOM = random.SystemRandom()

RECYCLE_STREAMS = {
    "recyclable_plastic",
    "recyclable_metal",
    "recyclable_glass",
    "recyclable_paper",
    "plastic_film",
    "recyclable_plastic_special",
    "small_paper_fragments",
}

REVERSE_LOGISTICS_STREAMS = {
    "hazardous_battery",
    "hazardous_lamp",
    "hazardous_medicine",
    "hazardous_paint",
    "e_waste",
    "bulky_e_waste",
    "automotive_waste",
    "bulky_wood",
}

LEVEL_TITLES = {
    1: "Recém-chegado",
    2: "Observador Verde",
    3: "Coletor Consciente",
    4: "Aprendiz da Reciclagem",
    5: "Rastreador Sustentável",
    6: "Agente Circular",
    7: "Guardião dos Materiais",
    8: "Especialista em Descarte",
    9: "Protetor Ambiental",
    10: "Mestre da Triagem",
    11: "Mentor Sustentável",
    12: "Sentinela Ecológico",
    13: "Comandante da Reciclagem",
    14: "Arquiteto Circular",
    15: "Lenda Verde",
    16: "Embaixador da Sustentabilidade",
    17: "Curador dos Recursos",
    18: "Oráculo da Reutilização",
    19: "Titã da Economia Circular",
    20: "Guardião Circular Supremo",
}


@dataclass(frozen=True)
class MissionDefinition:
    key: str
    title: str
    description: str
    target: int
    xp_reward: int
    metric: str


MISSION_DEFINITIONS = (
    MissionDefinition(
        key="week_analyses_5",
        title="Ritmo Verde",
        description="Conclua 5 análises com confiança nesta semana.",
        target=5,
        xp_reward=25,
        metric="analyses",
    ),
    MissionDefinition(
        key="week_materials_3",
        title="Explorador Circular",
        description="Descubra 3 materiais diferentes nesta semana.",
        target=3,
        xp_reward=30,
        metric="materials",
    ),
    MissionDefinition(
        key="week_metal_1",
        title="Liga Sustentável",
        description="Realize a análise de 1 item de metal nesta semana.",
        target=1,
        xp_reward=20,
        metric="metal_analyses",
    ),
    MissionDefinition(
        key="week_plastic_2",
        title="Caça ao Plástico",
        description="Realize a análise de 2 itens de plástico nesta semana.",
        target=2,
        xp_reward=20,
        metric="plastic_analyses",
    ),
    MissionDefinition(
        key="week_glass_1",
        title="Olhar de Vidro",
        description="Realize a análise de 1 item de vidro nesta semana.",
        target=1,
        xp_reward=20,
        metric="glass_analyses",
    ),
    MissionDefinition(
        key="week_paper_2",
        title="Fibra Inteligente",
        description="Realize a análise de 2 itens de papel nesta semana.",
        target=2,
        xp_reward=20,
        metric="paper_analyses",
    ),
    MissionDefinition(
        key="week_hazardous_1",
        title="Descarte Crítico",
        description="Identifique 1 item com descarte especial nesta semana.",
        target=1,
        xp_reward=35,
        metric="hazardous_analyses",
    ),
    MissionDefinition(
        key="week_reusable_2",
        title="Segunda Vida",
        description="Analise 2 itens que possam ser reutilizados nesta semana.",
        target=2,
        xp_reward=30,
        metric="reusable_analyses",
    ),
    MissionDefinition(
        key="week_recyclable_4",
        title="Rota da Reciclagem",
        description="Conclua 4 análises com destino de coleta seletiva nesta semana.",
        target=4,
        xp_reward=30,
        metric="recyclable_routes",
    ),
    MissionDefinition(
        key="week_reverse_logistics_1",
        title="Logística Reversa",
        description="Identifique 1 item que deva ir para ecoponto ou logística reversa nesta semana.",
        target=1,
        xp_reward=35,
        metric="reverse_logistics_routes",
    ),
)


def xp_for_level(level: int) -> int:
    normalized_level = max(level, 1)
    return 100 * (normalized_level - 1) * normalized_level // 2


def level_from_xp(xp_total: int) -> int:
    level = 1
    while xp_total >= xp_for_level(level + 1):
        level += 1
    return level


def level_title(level: int) -> str:
    normalized_level = max(level, 1)
    if normalized_level in LEVEL_TITLES:
        return LEVEL_TITLES[normalized_level]
    return f"Ascendente Circular {normalized_level}"


def build_game_profile_summary(profile: UserProfile) -> dict[str, Any]:
    current_level = max(profile.level, 1)
    current_level_floor = xp_for_level(current_level)
    next_level_floor = xp_for_level(current_level + 1)
    progress_in_level = profile.xp_total - current_level_floor
    level_span = max(next_level_floor - current_level_floor, 1)
    progress_percent = round((progress_in_level / level_span) * 100, 1)

    return {
        "xp_total": profile.xp_total,
        "level": current_level,
        "level_title": level_title(current_level),
        "current_streak": profile.current_streak,
        "longest_streak": profile.longest_streak,
        "total_analyses": profile.total_analyses,
        "unique_materials": profile.unique_materials,
        "analysis_xp_total": profile.analysis_xp_total,
        "quiz_xp_total": profile.quiz_xp_total,
        "current_level_floor": current_level_floor,
        "next_level_floor": next_level_floor,
        "progress_to_next_level": progress_in_level,
        "progress_percent": progress_percent,
        "xp_to_next_level": max(next_level_floor - profile.xp_total, 0),
    }


def current_week_window(anchor: date | None = None) -> tuple[date, date]:
    today = anchor or timezone.localdate()
    week_start = today - timedelta(days=today.weekday())
    week_end = week_start + timedelta(days=6)
    return week_start, week_end


def _normalized_set(values: list[str]) -> set[str]:
    return {value.strip().lower() for value in values if value and value.strip()}


def _normalize_material_token(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value)
    without_accents = "".join(
        character for character in normalized if not unicodedata.combining(character)
    )
    collapsed = re.sub(r"[^a-z0-9]+", " ", without_accents.lower())
    return re.sub(r"\s+", " ", collapsed).strip()


def _split_material_labels(material: str | None) -> list[str]:
    raw_value = str(material or "").strip()
    if not raw_value:
        return []

    parts = re.split(r"\s*(?:,|/|;|\||\+|&)\s*|\s+e\s+", raw_value, flags=re.IGNORECASE)
    labels: list[str] = []
    seen: set[str] = set()
    for part in parts:
        label = re.sub(r"\s+", " ", part).strip(" .,-")
        if not label:
            continue
        normalized = _normalize_material_token(label)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        labels.append(label)
    return labels


def _material_key_set(material: str | None) -> set[str]:
    return {
        _normalize_material_token(label)
        for label in _split_material_labels(material)
        if _normalize_material_token(label)
    }


def _collect_material_keys(materials: list[str]) -> set[str]:
    keys: set[str] = set()
    for material in materials:
        keys.update(_material_key_set(material))
    return keys


def _label_key(value: str) -> str:
    return normalize_pt_br_text(value).strip().casefold()


def _merge_unique_options(correct_label: str, incoming: list[str], fallback: list[str]) -> list[dict[str, str]]:
    labels: list[str] = []
    used: set[str] = set()
    for candidate in [correct_label, *incoming, *fallback]:
        normalized = sentence_case_pt_br(candidate)
        if not normalized:
            continue
        key = _label_key(normalized)
        if key in used:
            continue
        used.add(key)
        labels.append(normalized)
        if len(labels) == 4:
            break

    _RANDOM.shuffle(labels)

    return [
        {"id": f"option_{index + 1}", "label": label}
        for index, label in enumerate(labels)
    ]


def _destination_category(disposal_stream: str) -> str:
    if disposal_stream.startswith("recyclable_") or disposal_stream in {
        "plastic_film",
        "recyclable_plastic_special",
        "small_paper_fragments",
    }:
        return "Coleta seletiva ou ponto de recicláveis"
    if disposal_stream in {
        "hazardous_battery",
        "hazardous_lamp",
        "hazardous_medicine",
        "hazardous_paint",
        "e_waste",
        "bulky_e_waste",
        "automotive_waste",
        "bulky_wood",
    }:
        return "Ecoponto ou logística reversa"
    if disposal_stream in {
        "landfill_non_recyclable",
        "food_soiled_paper",
        "sanitary_waste",
        "flexible_multilayer_non_recyclable",
        "rubble_ceramic",
    }:
        return "Rejeito ou lixo comum"
    if disposal_stream in {
        "fresh_produce_reuse",
        "bulky_reuse",
        "donation_textile",
        "donation_footwear",
    }:
        return "Doação, reuso ou reaproveitamento"
    if disposal_stream in {
        "organic_compost",
        "organic_common",
        "wood_bamboo_small",
    }:
        return "Orgânicos ou compostagem"
    if disposal_stream in {"mixed_packaging_special"}:
        return "Separação antes do descarte"
    return "Coleta seletiva ou ponto de recicláveis"


def _build_quiz_questions(result: dict[str, Any]) -> list[dict[str, Any]]:
    best_match = result.get("best_match") or {}
    top_predictions = result.get("top_predictions") or []
    item_name = sentence_case_pt_br(best_match.get("display_name_pt") or "Item identificado")
    material = format_material_label(best_match.get("material") or "material misto")
    material_labels = _split_material_labels(material)
    destination = sentence_case_pt_br(
        _destination_category(str(best_match.get("disposal_stream") or "").strip())
    )

    item_options = _merge_unique_options(
        item_name,
        [str(prediction.get("display_name_pt") or "").strip() for prediction in top_predictions],
        ITEM_DISTRACTORS,
    )
    material_options = _merge_unique_options(
        material,
        [],
        MATERIAL_DISTRACTORS,
    )
    destination_options = _merge_unique_options(
        destination,
        [],
        DESTINATION_OPTIONS,
    )

    def correct_option_id(options: list[dict[str, str]], label: str) -> str:
        for option in options:
            if _label_key(option["label"]) == _label_key(label):
                return option["id"]
        return options[0]["id"]

    return [
        {
            "id": "identified_item",
            "prompt": "Qual item apareceu como melhor correspondência na análise?",
            "options": item_options,
            "correct_option_id": correct_option_id(item_options, item_name),
            "correct_label": item_name,
        },
        {
            "id": "material_type",
            "prompt": (
                "Quais materiais apareceram no resultado?"
                if len(material_labels) > 1
                else "Qual material apareceu no resultado?"
            ),
            "options": material_options,
            "correct_option_id": correct_option_id(material_options, material),
            "correct_label": material,
        },
        {
            "id": "destination_route",
            "prompt": "Qual destino resume melhor a orientação exibida?",
            "options": destination_options,
            "correct_option_id": correct_option_id(destination_options, destination),
            "correct_label": destination,
        },
    ]


def build_public_quiz_payload(analysis: AnalysisRecord) -> dict[str, Any] | None:
    if analysis.uncertain_prediction or not analysis.quiz_questions:
        return None

    return {
        "analysis_id": analysis.id,
        "title": "Desafio relâmpago",
        "description": "Opcional: responda 3 perguntas simples sobre o item que você acabou de analisar e ganhe XP extra.",
        "xp_per_correct_answer": QUIZ_CORRECT_XP,
        "questions": [
            {
                "id": question["id"],
                "prompt": question["prompt"],
                "options": question["options"],
            }
            for question in analysis.quiz_questions
        ],
    }


def _create_notification(
    *,
    user: User,
    kind: str,
    title: str,
    message: str,
    battle: SustainabilityBattle | None = None,
    friendship=None,
    data: dict[str, Any] | None = None,
) -> UserNotification:
    return UserNotification.objects.create(
        user=user,
        friendship=friendship,
        battle=battle,
        kind=kind,
        title=title,
        message=message,
        data=data or {},
    )


def _build_battle_question_entry(
    *,
    question: dict[str, Any],
    assigned_user: User,
    steal_user: User,
    is_tiebreak: bool = False,
    tiebreak_index: int = 0,
) -> dict[str, Any]:
    options = [dict(option) for option in question["options"]]
    _RANDOM.shuffle(options)
    return {
        "id": question["id"],
        "prompt": question["prompt"],
        "options": options,
        "correct_option_id": question["correct_option_id"],
        "correct_label": question["correct_label"],
        "turn_user_id": assigned_user.id,
        "turn_username": assigned_user.username,
        "steal_user_id": steal_user.id,
        "steal_username": steal_user.username,
        "primary_answer_user_id": None,
        "primary_answer_option_id": "",
        "primary_answer_label": "",
        "primary_is_correct": None,
        "steal_answer_user_id": None,
        "steal_answer_option_id": "",
        "steal_answer_label": "",
        "steal_is_correct": None,
        "points_awarded_user_id": None,
        "points_awarded": 0,
        "resolved": False,
        "is_tiebreak": is_tiebreak,
        "tiebreak_index": tiebreak_index,
    }


def _select_battle_questions(
    *,
    count: int,
    exclude_ids: set[str] | None = None,
) -> list[dict[str, Any]]:
    blocked_ids = exclude_ids or set()
    available_questions = [
        question
        for question in BATTLE_QUESTION_BANK
        if str(question["id"]) not in blocked_ids
    ]
    if not available_questions:
        return []

    return _RANDOM.sample(
        available_questions,
        k=min(count, len(available_questions)),
    )


def build_battle_questions(
    challenger: User,
    opponent: User,
    count: int = BATTLE_QUESTION_COUNT,
) -> list[dict[str, Any]]:
    selected_questions = _select_battle_questions(
        count=count,
    )
    turn_order = [challenger, opponent]
    questions: list[dict[str, Any]] = []

    for index, question in enumerate(selected_questions):
        assigned_user = turn_order[index % len(turn_order)]
        steal_user = opponent if assigned_user.id == challenger.id else challenger
        questions.append(
            _build_battle_question_entry(
                question=question,
                assigned_user=assigned_user,
                steal_user=steal_user,
            )
        )

    return questions


def _question_option_label(question: dict[str, Any], option_id: str) -> str:
    for option in question.get("options", []):
        if option.get("id") == option_id:
            return str(option.get("label") or "")
    return ""


def _battle_current_question(battle: SustainabilityBattle) -> dict[str, Any] | None:
    if battle.question_cursor >= len(battle.questions):
        return None
    question = battle.questions[battle.question_cursor]
    return question if isinstance(question, dict) else None


def _battle_add_points(battle: SustainabilityBattle, user_id: int, points: int) -> None:
    if user_id == battle.challenger_id:
        battle.challenger_score += points
    elif user_id == battle.opponent_id:
        battle.opponent_score += points


def _build_tiebreak_questions(battle: SustainabilityBattle) -> list[dict[str, Any]]:
    used_ids = {
        str(question.get("id"))
        for question in battle.questions
        if isinstance(question, dict) and question.get("id")
    }
    selected_questions = _select_battle_questions(
        count=BATTLE_TIEBREAKER_QUESTION_COUNT,
        exclude_ids=used_ids,
    )
    if len(selected_questions) < BATTLE_TIEBREAKER_QUESTION_COUNT:
        return []

    turn_order = [battle.challenger, battle.opponent]
    tiebreak_questions: list[dict[str, Any]] = []
    for index, question in enumerate(selected_questions):
        assigned_user = turn_order[index % len(turn_order)]
        steal_user = (
            battle.opponent
            if assigned_user.id == battle.challenger_id
            else battle.challenger
        )
        tiebreak_questions.append(
            _build_battle_question_entry(
                question=question,
                assigned_user=assigned_user,
                steal_user=steal_user,
                is_tiebreak=True,
                tiebreak_index=index + 1,
            )
        )

    return tiebreak_questions


def _battle_advance_state(battle: SustainabilityBattle, *, now) -> dict[int, int]:
    if (
        battle.question_cursor + 1 >= len(battle.questions)
        and len(battle.questions) == BATTLE_QUESTION_COUNT
        and battle.challenger_score == battle.opponent_score
    ):
        tiebreak_questions = _build_tiebreak_questions(battle)
        if tiebreak_questions:
            battle.questions = [dict(item) for item in battle.questions] + tiebreak_questions

    if battle.question_cursor + 1 < len(battle.questions):
        battle.question_cursor += 1
        battle.current_phase = SustainabilityBattle.PHASE_PRIMARY
        next_question = _battle_current_question(battle)
        if next_question is not None:
            next_turn_user_id = int(next_question["turn_user_id"])
            battle.current_turn_user_id = next_turn_user_id
            next_turn_user = (
                battle.challenger
                if next_turn_user_id == battle.challenger_id
                else battle.opponent
            )
            opponent = (
                battle.opponent
                if next_turn_user_id == battle.challenger_id
                else battle.challenger
            )
            is_tiebreak = bool(next_question.get("is_tiebreak"))
            _create_notification(
                user=next_turn_user,
                kind=UserNotification.KIND_BATTLE_TURN,
                title="Sua vez na batalha" if not is_tiebreak else "Sua vez no desempate",
                message=(
                    (
                        "O desempate começou. "
                        f"Agora é sua vez de responder à pergunta decisiva contra @{opponent.username}."
                    )
                    if is_tiebreak
                    else (
                        f"Agora é sua vez de responder à pergunta {battle.question_cursor + 1} "
                        f"contra @{opponent.username}."
                    )
                ),
                battle=battle,
                data={"battle_id": battle.id, "question_index": battle.question_cursor},
            )
        battle.save(
            update_fields=[
                "question_cursor",
                "current_phase",
                "current_turn_user",
                "updated_at",
            ]
        )
        return {}

    battle.status = SustainabilityBattle.STATUS_COMPLETED
    battle.current_phase = SustainabilityBattle.PHASE_COMPLETED
    battle.current_turn_user = None
    battle.completed_at = now
    battle.challenger_completed_at = now
    battle.opponent_completed_at = now
    if battle.challenger_score > battle.opponent_score:
        battle.winner = battle.challenger
    elif battle.opponent_score > battle.challenger_score:
        battle.winner = battle.opponent
    else:
        battle.winner = None
    battle.save(
        update_fields=[
            "status",
            "current_phase",
            "current_turn_user",
            "completed_at",
            "challenger_completed_at",
            "opponent_completed_at",
            "winner",
            "updated_at",
        ]
    )

    xp_by_user = _award_battle_completion_xp(battle)

    if battle.winner_id is None:
        if len(battle.questions) > BATTLE_QUESTION_COUNT:
            challenger_message = (
                f"A batalha contra @{battle.opponent.username} terminou empatada em "
                f"{battle.challenger_score} x {battle.opponent_score}, mesmo após o desempate."
            )
            opponent_message = (
                f"A batalha contra @{battle.challenger.username} terminou empatada em "
                f"{battle.opponent_score} x {battle.challenger_score}, mesmo após o desempate."
            )
        else:
            challenger_message = (
                f"A batalha contra @{battle.opponent.username} terminou empatada em "
                f"{battle.challenger_score} x {battle.opponent_score}."
            )
            opponent_message = (
                f"A batalha contra @{battle.challenger.username} terminou empatada em "
                f"{battle.opponent_score} x {battle.challenger_score}."
            )
    else:
        challenger_message = (
            f"Placar final: {battle.challenger_score} x {battle.opponent_score}. "
            f"{'Você venceu.' if battle.winner_id == battle.challenger_id else f'@{battle.opponent.username} venceu.'}"
        )
        opponent_message = (
            f"Placar final: {battle.opponent_score} x {battle.challenger_score}. "
            f"{'Você venceu.' if battle.winner_id == battle.opponent_id else f'@{battle.challenger.username} venceu.'}"
        )

    _create_notification(
        user=battle.challenger,
        kind=UserNotification.KIND_BATTLE_COMPLETED,
        title="Resultado da batalha disponível",
        message=challenger_message,
        battle=battle,
        data={"battle_id": battle.id, "winner_user_id": battle.winner_id},
    )
    _create_notification(
        user=battle.opponent,
        kind=UserNotification.KIND_BATTLE_COMPLETED,
        title="Resultado da batalha disponível",
        message=opponent_message,
        battle=battle,
        data={"battle_id": battle.id, "winner_user_id": battle.winner_id},
    )
    return xp_by_user


def build_public_battle_questions(
    questions: list[dict[str, Any]],
    *,
    reveal_correct: bool = False,
) -> list[dict[str, Any]]:
    serialized_questions: list[dict[str, Any]] = []
    for index, question in enumerate(questions):
        serialized_questions.append(
            {
                "id": question["id"],
                "index": index,
                "prompt": question["prompt"],
                "options": question["options"],
                "turn_user_id": question["turn_user_id"],
                "turn_username": question["turn_username"],
                "steal_user_id": question["steal_user_id"],
                "steal_username": question["steal_username"],
                "primary_answer_user_id": question.get("primary_answer_user_id"),
                "primary_answer_label": question.get("primary_answer_label") or "",
                "primary_is_correct": question.get("primary_is_correct"),
                "steal_answer_user_id": question.get("steal_answer_user_id"),
                "steal_answer_label": question.get("steal_answer_label") or "",
                "steal_is_correct": question.get("steal_is_correct"),
                "points_awarded_user_id": question.get("points_awarded_user_id"),
                "points_awarded": question.get("points_awarded", 0),
                "resolved": bool(question.get("resolved")),
                "is_tiebreak": bool(question.get("is_tiebreak")),
                "tiebreak_index": int(question.get("tiebreak_index") or 0),
                "correct_label": question["correct_label"] if reveal_correct else "",
            }
        )
    return serialized_questions


def _score_battle_answers(
    questions: list[dict[str, Any]],
    viewer_id: int,
    *,
    reveal_correct: bool = False,
) -> tuple[int, list[dict[str, Any]]]:
    score = 0
    results: list[dict[str, Any]] = []

    for question in questions:
        if int(question.get("points_awarded_user_id") or 0) == viewer_id:
            score += int(question.get("points_awarded") or 0)
        results.append(
            {
                "question_id": question["id"],
                "primary_answer_user_id": question.get("primary_answer_user_id"),
                "primary_answer_label": question.get("primary_answer_label") or "",
                "primary_is_correct": question.get("primary_is_correct"),
                "steal_answer_user_id": question.get("steal_answer_user_id"),
                "steal_answer_label": question.get("steal_answer_label") or "",
                "steal_is_correct": question.get("steal_is_correct"),
                "points_awarded_user_id": question.get("points_awarded_user_id"),
                "points_awarded": question.get("points_awarded", 0),
                "is_tiebreak": bool(question.get("is_tiebreak")),
                "tiebreak_index": int(question.get("tiebreak_index") or 0),
                "correct_label": question["correct_label"] if reveal_correct else "",
                "resolved": bool(question.get("resolved")),
            }
        )

    return score, results


def _grant_battle_xp(user: User, amount: int, title: str) -> int:
    if amount <= 0:
        return 0

    profile = get_or_create_profile(user)
    profile.xp_total += amount
    profile.quiz_xp_total += amount
    profile.level = level_from_xp(profile.xp_total)
    profile.save(update_fields=["xp_total", "quiz_xp_total", "level", "updated_at"])
    XpEvent.objects.create(
        user=user,
        source=XpEvent.SOURCE_BATTLE,
        amount=amount,
        title=title,
    )
    return amount


def _award_battle_completion_xp(battle: SustainabilityBattle) -> dict[int, int]:
    if battle.xp_awarded:
        return {}

    awarded: dict[int, int] = {
        battle.challenger_id: 0,
        battle.opponent_id: 0,
    }
    awarded[battle.challenger_id] += _grant_battle_xp(
        battle.challenger,
        BATTLE_COMPLETION_XP,
        f"Batalha concluída contra @{battle.opponent.username}",
    )
    awarded[battle.opponent_id] += _grant_battle_xp(
        battle.opponent,
        BATTLE_COMPLETION_XP,
        f"Batalha concluída contra @{battle.challenger.username}",
    )

    if battle.winner_id is None:
        awarded[battle.challenger_id] += _grant_battle_xp(
            battle.challenger,
            BATTLE_TIE_BONUS_XP,
            "Empate em batalha sustentável",
        )
        awarded[battle.opponent_id] += _grant_battle_xp(
            battle.opponent,
            BATTLE_TIE_BONUS_XP,
            "Empate em batalha sustentável",
        )
    else:
        opponent = battle.opponent if battle.winner_id == battle.challenger_id else battle.challenger
        awarded[battle.winner_id] += _grant_battle_xp(
            battle.winner,
            BATTLE_WINNER_BONUS_XP,
            f"Vitória em batalha contra @{opponent.username}",
        )

    battle.xp_awarded = True
    battle.save(update_fields=["xp_awarded", "updated_at"])
    return awarded


@transaction.atomic
def submit_battle_answers(
    *,
    battle: SustainabilityBattle,
    user: User,
    question_id: str,
    option_id: str,
) -> dict[str, Any]:
    if battle.status != SustainabilityBattle.STATUS_ACTIVE:
        raise ValueError("Esta batalha não está pronta para receber respostas.")
    if battle.current_turn_user_id != user.id:
        raise ValueError("Ainda não é sua vez de responder.")

    question = _battle_current_question(battle)
    if question is None:
        raise ValueError("Não encontramos a pergunta atual desta batalha.")
    if str(question.get("id")) != str(question_id):
        raise ValueError("A pergunta enviada não corresponde ao turno atual.")
    if question.get("resolved"):
        raise ValueError("Esta pergunta já foi concluída.")

    chosen_option_id = str(option_id or "").strip()
    if not chosen_option_id:
        raise ValueError("Escolha uma alternativa para responder.")

    now = timezone.now()
    opponent = battle.opponent if user.id == battle.challenger_id else battle.challenger
    option_label = _question_option_label(question, chosen_option_id)
    is_correct = chosen_option_id == question["correct_option_id"]
    xp_by_user: dict[int, int] = {}
    points_gained = 0

    if battle.current_phase == SustainabilityBattle.PHASE_PRIMARY:
        if int(question["turn_user_id"]) != user.id:
            raise ValueError("Esta pergunta principal pertence ao outro usuário.")

        question["primary_answer_user_id"] = user.id
        question["primary_answer_option_id"] = chosen_option_id
        question["primary_answer_label"] = option_label
        question["primary_is_correct"] = is_correct

        if is_correct:
            question["points_awarded_user_id"] = user.id
            question["points_awarded"] = BATTLE_PRIMARY_POINTS
            question["resolved"] = True
            points_gained = BATTLE_PRIMARY_POINTS
            _battle_add_points(battle, user.id, BATTLE_PRIMARY_POINTS)
            xp_by_user = _battle_advance_state(battle, now=now)
        else:
            battle.current_phase = SustainabilityBattle.PHASE_STEAL
            battle.current_turn_user = opponent
            battle.questions = [dict(item) for item in battle.questions]
            battle.save(
                update_fields=[
                    "questions",
                    "current_phase",
                    "current_turn_user",
                    "challenger_score",
                    "opponent_score",
                    "updated_at",
                ]
            )
            _create_notification(
                user=opponent,
                kind=UserNotification.KIND_BATTLE_STEAL,
                title="Chance de roubar pontos",
                message=(
                    f"@{user.username} errou a pergunta {battle.question_cursor + 1}. "
                    "Agora você pode tentar roubar metade da pontuação."
                ),
                battle=battle,
                data={"battle_id": battle.id, "question_index": battle.question_cursor},
            )
            return {
                "battle_id": battle.id,
                "status": battle.status,
                "winner_user_id": battle.winner_id,
                "xp_gained": 0,
                "points_gained": 0,
                "answer_correct": False,
            }
    else:
        if int(question["steal_user_id"]) != user.id:
            raise ValueError("A chance de roubo pertence ao outro usuário.")

        question["steal_answer_user_id"] = user.id
        question["steal_answer_option_id"] = chosen_option_id
        question["steal_answer_label"] = option_label
        question["steal_is_correct"] = is_correct
        question["resolved"] = True

        if is_correct:
            question["points_awarded_user_id"] = user.id
            question["points_awarded"] = BATTLE_STEAL_POINTS
            points_gained = BATTLE_STEAL_POINTS
            _battle_add_points(battle, user.id, BATTLE_STEAL_POINTS)

        xp_by_user = _battle_advance_state(battle, now=now)

    battle.questions = [dict(item) for item in battle.questions]
    battle.save(
        update_fields=[
            "questions",
            "challenger_score",
            "opponent_score",
            "updated_at",
        ]
    )

    return {
        "battle_id": battle.id,
        "status": battle.status,
        "winner_user_id": battle.winner_id,
        "xp_gained": xp_by_user.get(user.id, 0),
        "points_gained": points_gained,
        "answer_correct": is_correct,
    }


def _serialize_award(amount: int, label: str) -> dict[str, Any]:
    return {"amount": amount, "label": label}


def _serialize_mission(definition: MissionDefinition, progress: int, claimed: bool) -> dict[str, Any]:
    completed = progress >= definition.target
    return {
        "key": definition.key,
        "title": definition.title,
        "description": definition.description,
        "target": definition.target,
        "progress": min(progress, definition.target),
        "completed": completed,
        "claimed": claimed,
        "xp_reward": definition.xp_reward,
    }


def _build_weekly_metrics(weekly_records: list[dict[str, Any]]) -> dict[str, int]:
    analyses_count = len(weekly_records)
    materials_count = len(_collect_material_keys([record["material"] for record in weekly_records]))

    metal_analyses = sum(1 for record in weekly_records if "metal" in _material_key_set(record["material"]))
    plastic_analyses = sum(1 for record in weekly_records if "plastico" in _material_key_set(record["material"]))
    glass_analyses = sum(1 for record in weekly_records if "vidro" in _material_key_set(record["material"]))
    paper_analyses = sum(1 for record in weekly_records if "papel" in _material_key_set(record["material"]))
    hazardous_analyses = sum(1 for record in weekly_records if bool(record["hazardous"]))
    reusable_analyses = sum(1 for record in weekly_records if bool(record["reusable"]))
    recyclable_routes = sum(
        1
        for record in weekly_records
        if str(record["disposal_stream"] or "").strip() in RECYCLE_STREAMS
        or str(record["disposal_stream"] or "").strip().startswith("recyclable_")
    )
    reverse_logistics_routes = sum(
        1
        for record in weekly_records
        if str(record["disposal_stream"] or "").strip() in REVERSE_LOGISTICS_STREAMS
    )
    special_separation_routes = sum(
        1
        for record in weekly_records
        if str(record["disposal_stream"] or "").strip() == "mixed_packaging_special"
    )

    return {
        "analyses": analyses_count,
        "materials": materials_count,
        "metal_analyses": metal_analyses,
        "plastic_analyses": plastic_analyses,
        "glass_analyses": glass_analyses,
        "paper_analyses": paper_analyses,
        "hazardous_analyses": hazardous_analyses,
        "reusable_analyses": reusable_analyses,
        "recyclable_routes": recyclable_routes,
        "reverse_logistics_routes": reverse_logistics_routes,
        "special_separation_routes": special_separation_routes,
    }


def build_missions_state(user: User, anchor: date | None = None) -> list[dict[str, Any]]:
    week_start, week_end = current_week_window(anchor)
    weekly_records = list(
        AnalysisRecord.objects.filter(
            user=user,
            created_at__date__range=(week_start, week_end),
            uncertain_prediction=False,
        ).values("material", "hazardous", "reusable", "disposal_stream")
    )
    metrics = _build_weekly_metrics(weekly_records)
    claimed_keys = set(
        MissionClaim.objects.filter(user=user, week_start=week_start).values_list("mission_key", flat=True)
    )

    missions: list[dict[str, Any]] = []
    for definition in MISSION_DEFINITIONS:
        progress = metrics.get(definition.metric, 0)
        missions.append(_serialize_mission(definition, progress, definition.key in claimed_keys))
    return missions


def build_recent_events(user: User, limit: int = 6) -> list[dict[str, Any]]:
    return [
        {
            "id": event.id,
            "source": event.source,
            "title": event.title,
            "amount": event.amount,
            "created_at": event.created_at.isoformat(),
        }
        for event in user.xp_events.all()[:limit]
    ]


def build_leaderboard(limit: int = 10) -> tuple[list[UserProfile], date, date]:
    week_start, week_end = current_week_window()
    has_confident_analyses = AnalysisRecord.objects.filter(
        user_id=OuterRef("user_id"),
        uncertain_prediction=False,
    )
    leaderboard = list(
        UserProfile.objects.select_related("user")
        .annotate(
            weekly_xp=Coalesce(
                Sum(
                    "user__xp_events__amount",
                    filter=Q(user__xp_events__created_at__date__range=(week_start, week_end))
                    & (
                        Q(user__xp_events__analysis__isnull=True)
                        | Q(user__xp_events__analysis__uncertain_prediction=False)
                    ),
                ),
                0,
            ),
            ranking_xp_total=Coalesce(
                Sum(
                    "user__xp_events__amount",
                    filter=Q(user__xp_events__analysis__isnull=True)
                    | Q(user__xp_events__analysis__uncertain_prediction=False),
                ),
                0,
            ),
            has_confident_analyses=Exists(has_confident_analyses),
        )
        .filter(Q(ranking_xp_total__gt=0) | Q(has_confident_analyses=True))
        .order_by("-weekly_xp", "-ranking_xp_total", "user__username")
    )
    return leaderboard[:limit], week_start, week_end


def build_ranked_profiles() -> tuple[list[UserProfile], date, date]:
    week_start, week_end = current_week_window()
    has_confident_analyses = AnalysisRecord.objects.filter(
        user_id=OuterRef("user_id"),
        uncertain_prediction=False,
    )
    leaderboard = list(
        UserProfile.objects.select_related("user")
        .annotate(
            weekly_xp=Coalesce(
                Sum(
                    "user__xp_events__amount",
                    filter=Q(user__xp_events__created_at__date__range=(week_start, week_end))
                    & (
                        Q(user__xp_events__analysis__isnull=True)
                        | Q(user__xp_events__analysis__uncertain_prediction=False)
                    ),
                ),
                0,
            ),
            ranking_xp_total=Coalesce(
                Sum(
                    "user__xp_events__amount",
                    filter=Q(user__xp_events__analysis__isnull=True)
                    | Q(user__xp_events__analysis__uncertain_prediction=False),
                ),
                0,
            ),
            has_confident_analyses=Exists(has_confident_analyses),
        )
        .filter(Q(ranking_xp_total__gt=0) | Q(has_confident_analyses=True))
        .order_by("-weekly_xp", "-ranking_xp_total", "user__username")
    )
    return leaderboard, week_start, week_end


@transaction.atomic
def record_analysis_outcome(user: User, result: dict[str, Any]) -> dict[str, Any]:
    profile = get_or_create_profile(user)
    previous_level = profile.level
    today = timezone.localdate()
    best_match = result.get("best_match") or {}
    top_predictions = result.get("top_predictions") or []
    class_id = str(best_match.get("class_id") or "").strip()
    if not class_id and top_predictions:
        class_id = str(top_predictions[0].get("class_id") or "").strip()
    item_name = str(best_match.get("display_name_pt") or "Item identificado").strip()
    material = format_material_label(best_match.get("material") or "")
    material_labels = _split_material_labels(material)
    material_keys = _material_key_set(material)
    disposal_stream = str(best_match.get("disposal_stream") or "").strip()
    is_uncertain = bool(result.get("uncertain_prediction"))

    had_confident_analysis_today = AnalysisRecord.objects.filter(
        user=user,
        created_at__date=today,
        uncertain_prediction=False,
    ).exists()
    previous_material_keys = _collect_material_keys(
        list(
            AnalysisRecord.objects.filter(user=user, uncertain_prediction=False)
            .values_list("material", flat=True)
        )
    )
    new_material_labels = [
        label
        for label in material_labels
        if _normalize_material_token(label) not in previous_material_keys
    ]

    analysis = AnalysisRecord.objects.create(
        user=user,
        class_id=class_id,
        item_name=item_name,
        material=material,
        disposal_stream=disposal_stream,
        recommendation=str(best_match.get("recommendation") or "").strip(),
        dropoff=str(best_match.get("dropoff") or "").strip(),
        preparation=str(best_match.get("preparation") or "").strip(),
        hazardous=bool(best_match.get("hazardous")),
        reusable=bool(best_match.get("reusable")),
        uncertain_prediction=is_uncertain,
        confidence=float(result.get("confidence") or 0.0),
        quiz_questions=[] if is_uncertain else _build_quiz_questions(result),
    )

    awards: list[dict[str, Any]] = []
    missions_completed: list[dict[str, Any]] = []

    def grant_xp(amount: int, source: str, title: str, *, track_as_quiz: bool = False) -> None:
        nonlocal profile
        if amount <= 0:
            return
        profile.xp_total += amount
        if track_as_quiz:
            profile.quiz_xp_total += amount
        else:
            profile.analysis_xp_total += amount
        awards.append(_serialize_award(amount, title))
        XpEvent.objects.create(
            user=user,
            analysis=analysis,
            source=source,
            amount=amount,
            title=title,
        )

    grant_xp(BASE_ANALYSIS_XP, XpEvent.SOURCE_ANALYSIS, "Análise concluída")

    if is_uncertain:
        profile.unique_materials = len(previous_material_keys)
    else:
        if not had_confident_analysis_today:
            grant_xp(FIRST_DAILY_ANALYSIS_XP, XpEvent.SOURCE_DAILY_BONUS, "Primeira análise do dia")

        if new_material_labels:
            profile.unique_materials = len(previous_material_keys | material_keys)
            grant_xp(
                NEW_MATERIAL_XP * len(new_material_labels),
                XpEvent.SOURCE_DISCOVERY,
                "Novo material descoberto"
                if len(new_material_labels) == 1
                else f"{len(new_material_labels)} novos materiais descobertos",
            )
        else:
            profile.unique_materials = len(previous_material_keys)

    if profile.last_activity_on == today - timedelta(days=1):
        profile.current_streak += 1
    elif profile.last_activity_on != today:
        profile.current_streak = 1

    profile.longest_streak = max(profile.longest_streak, profile.current_streak)
    profile.last_activity_on = today
    profile.total_analyses += 1

    if not is_uncertain:
        week_start, _ = current_week_window(today)
        missions_state = build_missions_state(user, today)
        for mission in missions_state:
            if not mission["completed"] or mission["claimed"]:
                continue
            definition = next(item for item in MISSION_DEFINITIONS if item.key == mission["key"])
            claim, created = MissionClaim.objects.get_or_create(
                user=user,
                mission_key=definition.key,
                week_start=week_start,
            )
            if not created:
                continue
            grant_xp(
                definition.xp_reward,
                XpEvent.SOURCE_MISSION,
                f"Missão concluída: {definition.title}",
            )
            missions_completed.append(
                {
                    "key": definition.key,
                    "title": definition.title,
                    "xp_reward": definition.xp_reward,
                    "claimed_at": claim.claimed_at.isoformat(),
                }
            )

    profile.level = level_from_xp(profile.xp_total)
    profile.save()

    analysis.xp_awarded = sum(award["amount"] for award in awards)
    analysis.save(update_fields=["xp_awarded"])

    return {
        "analysis": analysis,
        "profile": build_game_profile_summary(profile),
        "xp_gained": analysis.xp_awarded,
        "awards": awards,
        "missions_completed": missions_completed,
        "leveled_up": profile.level > previous_level,
    }


@transaction.atomic
def submit_quiz_answers(
    *,
    user: User,
    analysis_id: int,
    answers: dict[str, str],
) -> dict[str, Any]:
    analysis = (
        AnalysisRecord.objects.select_for_update()
        .filter(id=analysis_id, user=user)
        .first()
    )
    if analysis is None:
        raise ValueError("Não encontramos a análise informada para este usuário.")
    if analysis.quiz_completed:
        raise ValueError("Este quiz já foi respondido.")
    if not analysis.quiz_questions:
        raise ValueError("Não há quiz disponível para esta análise.")

    profile = get_or_create_profile(user)
    previous_level = profile.level
    results: list[dict[str, Any]] = []
    correct_answers = 0

    for question in analysis.quiz_questions:
        selected_option_id = str(answers.get(question["id"], "")).strip()
        is_correct = selected_option_id == question["correct_option_id"]
        if is_correct:
            correct_answers += 1
        results.append(
            {
                "question_id": question["id"],
                "selected_option_id": selected_option_id,
                "correct_option_id": question["correct_option_id"],
                "correct_label": question["correct_label"],
                "is_correct": is_correct,
            }
        )

    xp_gained = correct_answers * QUIZ_CORRECT_XP
    analysis.quiz_completed = True
    analysis.quiz_score = correct_answers
    analysis.quiz_xp_awarded = xp_gained
    analysis.save(update_fields=["quiz_completed", "quiz_score", "quiz_xp_awarded"])

    if xp_gained > 0:
        profile.xp_total += xp_gained
        profile.quiz_xp_total += xp_gained
        profile.level = level_from_xp(profile.xp_total)
        XpEvent.objects.create(
            user=user,
            analysis=analysis,
            source=XpEvent.SOURCE_QUIZ,
            amount=xp_gained,
            title=f"Quiz do item: {correct_answers} acertos",
        )
    profile.save()

    return {
        "analysis_id": analysis.id,
        "correct_answers": correct_answers,
        "total_questions": len(analysis.quiz_questions),
        "xp_gained": xp_gained,
        "leveled_up": profile.level > previous_level,
        "results": results,
        "profile": build_game_profile_summary(profile),
    }
