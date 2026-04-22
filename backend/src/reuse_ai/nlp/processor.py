from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Any

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity


_STOPWORDS_PT = {
    "a",
    "ao",
    "aos",
    "as",
    "com",
    "como",
    "da",
    "das",
    "de",
    "do",
    "dos",
    "e",
    "ela",
    "ele",
    "em",
    "entre",
    "era",
    "essa",
    "esse",
    "esta",
    "este",
    "eu",
    "foi",
    "ha",
    "isso",
    "isto",
    "ja",
    "la",
    "mais",
    "mas",
    "me",
    "mesmo",
    "minha",
    "meu",
    "na",
    "nas",
    "nao",
    "nem",
    "no",
    "nos",
    "num",
    "numa",
    "o",
    "os",
    "ou",
    "para",
    "pela",
    "pelas",
    "pelo",
    "pelos",
    "por",
    "pra",
    "que",
    "qual",
    "quando",
    "se",
    "sem",
    "ser",
    "seu",
    "sua",
    "suas",
    "seus",
    "ta",
    "te",
    "tem",
    "tenho",
    "to",
    "um",
    "uma",
    "umas",
    "uns",
    "vai",
    "voce",
    "voces",
}


def _normalize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value.casefold())
    ascii_only = normalized.encode("ascii", "ignore").decode("ascii")
    ascii_only = re.sub(r"[^a-z0-9\s]", " ", ascii_only)
    return re.sub(r"\s+", " ", ascii_only).strip()


def _tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text)


def _stem_pt(token: str) -> str:
    stem = token.strip()
    for suffix, replacement in (
        ("mente", ""),
        ("amento", ""),
        ("imentos", "iment"),
        ("imentos", "iment"),
        ("idades", "idad"),
        ("idade", "idad"),
        ("coes", "cao"),
        ("coes", "cao"),
        ("cao", "ca"),
        ("oes", "ao"),
        ("aes", "ao"),
        ("istas", "ist"),
        ("ista", "ist"),
        ("ismos", "ism"),
        ("ismo", "ism"),
        ("logias", "log"),
        ("logia", "log"),
        ("ezas", "ez"),
        ("eza", "ez"),
        ("icas", "ic"),
        ("icos", "ic"),
        ("ica", "ic"),
        ("ico", "ic"),
        ("ivas", "iv"),
        ("ivos", "iv"),
        ("iva", "iv"),
        ("ivo", "iv"),
        ("adoras", "ador"),
        ("adores", "ador"),
        ("adora", "ador"),
        ("ador", "ador"),
        ("antes", "ant"),
        ("ante", "ant"),
        ("s", ""),
    ):
        if len(stem) - len(suffix) >= 3 and stem.endswith(suffix):
            stem = stem[: -len(suffix)] + replacement
            break
    return stem


def _token_similarity(left: str, right: str) -> float:
    if left == right:
        return 1.0
    if len(left) >= 4 and len(right) >= 4 and (left in right or right in left):
        return 0.95
    return SequenceMatcher(None, left, right).ratio()


@dataclass(frozen=True)
class ProcessedText:
    original: str
    normalized: str
    tokens: tuple[str, ...]
    filtered_tokens: tuple[str, ...]
    stems: tuple[str, ...]
    expanded_tokens: tuple[str, ...]
    search_text: str


@dataclass(frozen=True)
class IntentCandidate:
    intent_id: str
    label: str
    examples: tuple[str, ...]
    metadata: dict[str, Any]
    search_text: str
    vocabulary: tuple[str, ...]


@dataclass(frozen=True)
class IntentMatch:
    candidate: IntentCandidate
    score: float
    semantic_score: float
    lexical_score: float
    fuzzy_score: float


class PortugueseTextPreprocessor:
    def __init__(self, stopwords: set[str] | None = None, synonyms: dict[str, str] | None = None) -> None:
        self.stopwords = stopwords or set(_STOPWORDS_PT)
        self.synonyms = {self._normalize_token(key): self._normalize_token(value) for key, value in (synonyms or {}).items()}

    def process(self, text: str) -> ProcessedText:
        normalized = _normalize_text(text)
        tokens = _tokenize(normalized)
        filtered_tokens = [token for token in tokens if token not in self.stopwords]
        stemmed_tokens = [_stem_pt(token) for token in filtered_tokens]
        expanded_tokens = [self.synonyms.get(token, token) for token in stemmed_tokens]
        search_text = " ".join(expanded_tokens)
        return ProcessedText(
            original=text,
            normalized=normalized,
            tokens=tuple(tokens),
            filtered_tokens=tuple(filtered_tokens),
            stems=tuple(stemmed_tokens),
            expanded_tokens=tuple(expanded_tokens),
            search_text=search_text,
        )

    def prepare_document(self, texts: list[str] | tuple[str, ...]) -> tuple[str, tuple[str, ...]]:
        processed = [self.process(text) for text in texts if text.strip()]
        merged_tokens = [token for item in processed for token in item.expanded_tokens]
        merged_text = " ".join(item.search_text for item in processed if item.search_text).strip()
        return merged_text, tuple(dict.fromkeys(merged_tokens))

    def _normalize_token(self, token: str) -> str:
        normalized = _normalize_text(token)
        raw_tokens = _tokenize(normalized)
        if not raw_tokens:
            return normalized
        return _stem_pt(raw_tokens[0])


class SemanticIntentEngine:
    def __init__(self, preprocessor: PortugueseTextPreprocessor) -> None:
        self.preprocessor = preprocessor
        self.word_vectorizer = TfidfVectorizer(analyzer="word", ngram_range=(1, 2))
        self.char_vectorizer = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5))
        self.candidates: list[IntentCandidate] = []
        self._word_matrix = None
        self._char_matrix = None

    def fit(self, definitions: list[dict[str, Any]]) -> None:
        candidates: list[IntentCandidate] = []
        for definition in definitions:
            search_text, vocabulary = self.preprocessor.prepare_document(definition["examples"])
            candidates.append(
                IntentCandidate(
                    intent_id=definition["intent_id"],
                    label=definition["label"],
                    examples=tuple(definition["examples"]),
                    metadata=dict(definition.get("metadata", {})),
                    search_text=search_text,
                    vocabulary=vocabulary,
                )
            )

        self.candidates = candidates
        documents = [candidate.search_text or candidate.label for candidate in candidates]
        self._word_matrix = self.word_vectorizer.fit_transform(documents)
        self._char_matrix = self.char_vectorizer.fit_transform(documents)

    def rank(self, text: str, top_k: int = 5) -> list[IntentMatch]:
        if not self.candidates:
            return []

        processed = self.preprocessor.process(text)
        query_text = processed.search_text or processed.normalized
        word_query = self.word_vectorizer.transform([query_text])
        char_query = self.char_vectorizer.transform([query_text])

        word_scores = cosine_similarity(word_query, self._word_matrix)[0]
        char_scores = cosine_similarity(char_query, self._char_matrix)[0]

        matches: list[IntentMatch] = []
        for index, candidate in enumerate(self.candidates):
            semantic_score = float((word_scores[index] * 0.62) + (char_scores[index] * 0.38))
            lexical_score = self._lexical_score(processed.expanded_tokens, candidate.vocabulary)
            fuzzy_score = self._fuzzy_score(processed.normalized, candidate.examples)
            total_score = (semantic_score * 0.58) + (lexical_score * 0.24) + (fuzzy_score * 0.18)
            matches.append(
                IntentMatch(
                    candidate=candidate,
                    score=total_score,
                    semantic_score=semantic_score,
                    lexical_score=lexical_score,
                    fuzzy_score=fuzzy_score,
                )
            )

        matches.sort(key=lambda item: item.score, reverse=True)
        return matches[:top_k]

    def best(self, text: str, threshold: float = 0.28) -> IntentMatch | None:
        ranked = self.rank(text, top_k=1)
        if not ranked:
            return None
        return ranked[0] if ranked[0].score >= threshold else None

    def _lexical_score(self, query_tokens: tuple[str, ...], candidate_tokens: tuple[str, ...]) -> float:
        if not query_tokens or not candidate_tokens:
            return 0.0
        scores = []
        for query_token in query_tokens:
            token_score = max(_token_similarity(query_token, candidate_token) for candidate_token in candidate_tokens)
            scores.append(token_score)
        average = sum(scores) / len(scores)
        coverage = sum(score >= 0.86 for score in scores) / len(scores)
        return (average * 0.65) + (coverage * 0.35)

    def _fuzzy_score(self, normalized_text: str, examples: tuple[str, ...]) -> float:
        if not normalized_text:
            return 0.0
        best = 0.0
        for example in examples:
            candidate_text = _normalize_text(example)
            if not candidate_text:
                continue
            best = max(best, SequenceMatcher(None, normalized_text, candidate_text).ratio())
        return best
