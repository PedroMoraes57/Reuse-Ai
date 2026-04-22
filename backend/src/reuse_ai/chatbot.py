from __future__ import annotations

from pathlib import Path
from typing import Any

from reuse_ai.chatbot_knowledge import ChatbotKnowledgeBase
from reuse_ai.chatbot_responder import ChatResponseGenerator
from reuse_ai.config import load_project_config
from reuse_ai.nlp import PortugueseTextPreprocessor, SemanticIntentEngine


class RecyclingChatbotService:
    _FOLLOW_UP_HINTS = (
        "e se",
        "e quando",
        "mas se",
        "mas pode",
        "mesmo assim",
        "nesse caso",
        "e ai",
        "se tiver",
        "se estiver",
    )

    def __init__(
        self,
        catalog_path: str | Path | None = None,
        rules_path: str | Path | None = None,
        topics_path: str | Path | None = None,
    ) -> None:
        config = load_project_config()
        paths = config["paths"]
        self.knowledge_base = ChatbotKnowledgeBase(
            catalog_path=catalog_path or paths["class_catalog"],
            rules_path=rules_path or paths["disposal_rules"],
            topics_path=topics_path or paths["chat_topics"],
        )
        self.preprocessor = PortugueseTextPreprocessor(
            synonyms=self.knowledge_base.build_synonyms()
        )
        self.entity_engine = SemanticIntentEngine(self.preprocessor)
        self.entity_engine.fit(self.knowledge_base.build_intent_definitions())
        self.mode_engine = SemanticIntentEngine(self.preprocessor)
        self.mode_engine.fit(self._mode_definitions())
        self.responder = ChatResponseGenerator(self.knowledge_base)

    def reply(
        self,
        message: str,
        analysis_context: dict[str, Any] | None = None,
        conversation_context: list[dict[str, str]] | None = None,
    ) -> dict[str, Any]:
        normalized_question = self.preprocessor.process(message).normalized
        conversation_text = self._conversation_text(conversation_context)
        mode_match = self.mode_engine.best(message, threshold=0.24)
        entity_match = self.entity_engine.best(message, threshold=0.29)
        fallback_rank = self.entity_engine.rank(message, top_k=3)
        best_context_item = self._analysis_context_class_id(analysis_context)

        if mode_match and mode_match.candidate.metadata["mode_id"] == "system" and best_context_item:
            return self.responder.system_explanation(best_context_item, analysis_context or {})

        if not entity_match and conversation_text and self._looks_like_follow_up(normalized_question):
            entity_match = self.entity_engine.best(
                f"{message} {conversation_text}",
                threshold=0.27,
            )

        if not entity_match and best_context_item and self._should_use_analysis_context(normalized_question):
            return self.responder.generate_from_context(
                class_id=best_context_item,
                mode_id=mode_match.candidate.metadata["mode_id"] if mode_match else "action",
                analysis_context=analysis_context,
            )

        if entity_match:
            return self.responder.generate_from_match(
                entity_match=entity_match,
                mode_match=mode_match,
                analysis_context=analysis_context,
            )

        suggestions = [match.candidate.label for match in fallback_rank if match.score >= 0.18]
        return self.responder.fallback(
            suggestions=suggestions,
            domain_detected=self._is_domain_question(normalized_question, conversation_text),
        )

    def _conversation_text(self, conversation_context: list[dict[str, str]] | None) -> str:
        if not conversation_context:
            return ""
        last_messages = []
        for message in conversation_context[-6:]:
            text = message.get("text", "")
            if isinstance(text, str) and text.strip():
                last_messages.append(text)
        return " ".join(last_messages).strip()

    def _analysis_context_class_id(self, analysis_context: dict[str, Any] | None) -> str | None:
        if not analysis_context:
            return None
        class_id = analysis_context.get("best_match", {}).get("class_id")
        return class_id if isinstance(class_id, str) else None

    def _should_use_analysis_context(self, normalized_question: str) -> bool:
        tokens = normalized_question.split()
        if len(tokens) <= 4:
            return True
        return any(hint in normalized_question for hint in self._FOLLOW_UP_HINTS) or any(
            pronoun in normalized_question
            for pronoun in ("isso", "isto", "esse item", "este item", "esse", "esse lixo")
        )

    def _looks_like_follow_up(self, normalized_question: str) -> bool:
        tokens = normalized_question.split()
        return len(tokens) <= 5 or any(hint in normalized_question for hint in self._FOLLOW_UP_HINTS)

    def _is_domain_question(self, normalized_question: str, conversation_text: str) -> bool:
        combined = self.preprocessor.process(f"{normalized_question} {conversation_text}".strip())
        keywords = set(combined.expanded_tokens)
        domain_terms = {
            "bateria",
            "descartar",
            "reciclar",
            "lixo",
            "lavar",
            "sustentavel",
            "reutilizar",
            "coleta",
            "oleo",
            "organico",
            "compostag",
        }
        return any(term in token or token in term for token in keywords for term in domain_terms)

    def _mode_definitions(self) -> list[dict[str, Any]]:
        return [
            {
                "intent_id": "mode:action",
                "label": "acao pratica",
                "examples": (
                    "o que eu faco com isso",
                    "como descartar",
                    "qual o jeito certo",
                    "pode reciclar",
                    "vai no lixo comum",
                ),
                "metadata": {"mode_id": "action"},
            },
            {
                "intent_id": "mode:where",
                "label": "onde descartar",
                "examples": (
                    "onde descartar",
                    "onde jogo",
                    "onde levo",
                    "qual ponto de coleta",
                    "aonde colocar",
                ),
                "metadata": {"mode_id": "where"},
            },
            {
                "intent_id": "mode:preparation",
                "label": "preparo antes do descarte",
                "examples": (
                    "precisa lavar",
                    "como preparar antes de descartar",
                    "precisa secar",
                    "tem que limpar",
                    "como higienizar",
                ),
                "metadata": {"mode_id": "preparation"},
            },
            {
                "intent_id": "mode:explanation",
                "label": "explicacao",
                "examples": (
                    "por que nao recicla",
                    "por que nao pode",
                    "qual a diferenca",
                    "por que esse item nao vai na reciclavel",
                    "como funciona isso",
                ),
                "metadata": {"mode_id": "explanation"},
            },
            {
                "intent_id": "mode:system",
                "label": "explicacao do sistema",
                "examples": (
                    "por que o sistema classificou assim",
                    "a ia acertou",
                    "por que deu esse resultado",
                    "o sistema decidiu certo",
                    "por que a analise deu isso",
                ),
                "metadata": {"mode_id": "system"},
            },
        ]
