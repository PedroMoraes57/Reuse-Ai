from __future__ import annotations

import re

PT_BR_WORD_REPLACEMENTS = {
    "analise": "análise",
    "analises": "análises",
    "confianca": "confiança",
    "descricao": "descrição",
    "eletrico": "elétrico",
    "eletricos": "elétricos",
    "eletronico": "eletrônico",
    "eletronicos": "eletrônicos",
    "eletroquimico": "eletroquímico",
    "eletroquimicos": "eletroquímicos",
    "logistica": "logística",
    "metalico": "metálico",
    "metalicos": "metálicos",
    "nao": "não",
    "organico": "orgânico",
    "organicos": "orgânicos",
    "papelao": "papelão",
    "plastico": "plástico",
    "plasticos": "plásticos",
    "preparacao": "preparação",
    "quimico": "químico",
    "quimicos": "químicos",
    "relampago": "relâmpago",
}

_REPLACEMENT_PATTERN = re.compile(
    r"\b(" + "|".join(sorted(map(re.escape, PT_BR_WORD_REPLACEMENTS), key=len, reverse=True)) + r")\b",
    flags=re.IGNORECASE,
)


def _preserve_case(original: str, replacement: str) -> str:
    if original.isupper():
        return replacement.upper()
    if original[:1].isupper():
        return replacement[:1].upper() + replacement[1:]
    return replacement


def normalize_pt_br_text(value: str | None) -> str:
    text = re.sub(r"\s+", " ", str(value or "").strip())
    if not text:
        return ""

    return _REPLACEMENT_PATTERN.sub(
        lambda match: _preserve_case(
            match.group(0),
            PT_BR_WORD_REPLACEMENTS[match.group(0).casefold()],
        ),
        text,
    )


def sentence_case_pt_br(value: str | None) -> str:
    text = normalize_pt_br_text(value)
    if not text:
        return ""
    return text[:1].upper() + text[1:]


def format_material_label(value: str | None) -> str:
    return sentence_case_pt_br(value)
