from __future__ import annotations

import re
from pathlib import Path
from typing import Any

from reuse_ai.chatbot_knowledge import ChatbotKnowledgeBase
from reuse_ai.chatbot_llm import build_chatbot_llm_from_env
from reuse_ai.chatbot_responder import ChatResponseGenerator
from reuse_ai.config import load_project_config
from reuse_ai.nlp import IntentMatch, PortugueseTextPreprocessor, SemanticIntentEngine


class RecyclingChatbotService:
    _AMBIGUOUS_PACKAGING_TOKENS = {
        "caixa",
        "embalagem",
        "pacote",
        "pacot",
        "saco",
        "sacola",
        "pote",
        "frasco",
        "recipiente",
    }
    _MATERIAL_HINTS = (
        "papelao",
        "papel",
        "cartao",
        "plastico",
        "metal",
        "metalizado",
        "isopor",
        "vidro",
        "longa vida",
        "aluminio",
        "tetra pak",
        "tetrapak",
    )
    _GENERIC_ITEM_TOKENS = {
        "caixa",
        "embalagem",
        "pacote",
        "pacot",
        "saco",
        "sacola",
        "pote",
        "garrafa",
        "lata",
        "frasco",
        "papel",
        "plastico",
        "cartao",
        "carton",
        "coisa",
        "item",
    }
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
    _PAGE_CONTEXT_HINTS = (
        "aqui",
        "essa pagina",
        "nesta pagina",
        "nessa pagina",
        "essa tela",
        "nesta tela",
        "nessa tela",
        "essa funcao",
        "essa funcionalidade",
        "o que posso fazer",
        "como usar isso",
        "como funciona isso",
    )
    _MAP_REQUEST_HINTS = (
        "onde",
        "aonde",
        "perto",
        "proximo",
        "mais perto",
        "ecoponto",
        "ponto de coleta",
        "ponto de descarte",
        "mapa",
        "local",
        "lugar",
    )
    _ANALYSIS_REFERENCE_HINTS = (
        "isso",
        "isto",
        "esse item",
        "este item",
        "essa embalagem",
        "esse material",
        "esse lixo",
        "esse residuo",
        "essa analise",
        "essa foto",
    )
    _SYSTEM_TERMS = {
        "pagina",
        "tela",
        "funcao",
        "funcionalidade",
        "menu",
        "perfil",
        "conta",
        "cadastro",
        "login",
        "ranking",
        "xp",
        "missao",
        "amigos",
        "amizade",
        "batalha",
        "quiz",
        "classificar",
        "analise",
        "foto",
        "avatar",
        "site",
        "sistema",
        "plataforma",
        "localizacao",
        "mapa",
    }
    _DOMAIN_TERMS = {
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
        "acessibil",
        "teclado",
        "contraste",
        "legibil",
        "imagem",
        "alt",
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
        self.knowledge_base = ChatbotKnowledgeBase(
            catalog_path=catalog_path or paths["class_catalog"],
            rules_path=rules_path or paths["disposal_rules"],
            topics_path=topics_path or paths["chat_topics"],
            system_path=system_path or paths["chat_system_knowledge"],
        )
        self.preprocessor = PortugueseTextPreprocessor(
            synonyms=self.knowledge_base.build_synonyms()
        )
        self.entity_engine = SemanticIntentEngine(self.preprocessor)
        self.entity_engine.fit(self.knowledge_base.build_intent_definitions())
        self.mode_engine = SemanticIntentEngine(self.preprocessor)
        self.mode_engine.fit(self._mode_definitions())
        self.conversation_engine = SemanticIntentEngine(self.preprocessor)
        self.conversation_engine.fit(self._conversation_definitions())
        self.item_candidates_by_class_id = {
            candidate.metadata["class_id"]: candidate
            for candidate in self.entity_engine.candidates
            if candidate.metadata.get("kind") == "item"
        }
        self.item_alias_tokens = self._build_item_alias_tokens()
        self.responder = ChatResponseGenerator(self.knowledge_base)
        self.llm = build_chatbot_llm_from_env()

    def reply(
        self,
        message: str,
        analysis_context: dict[str, Any] | None = None,
        conversation_context: list[dict[str, str]] | None = None,
        page_context: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        processed_question = self.preprocessor.process(message)
        normalized_question = processed_question.normalized
        conversation_text = self._conversation_text(conversation_context)
        current_route_id = self._page_context_route_id(page_context)
        conversation_match = self.conversation_engine.best(message, threshold=0.24)
        mode_match = self.mode_engine.best(message, threshold=0.24)
        item_matches = self._extract_item_matches(message, processed_question)
        explicit_item_positions = self._detect_explicit_item_positions(processed_question.expanded_tokens)
        confident_item_matches = self._confident_item_matches(
            item_matches,
            explicit_item_positions=explicit_item_positions,
        )
        user_item_mentions = self._extract_user_item_mentions(
            message,
            processed_question=processed_question,
        )

        if conversation_match and self._should_prefer_local_conversation(
            normalized_question=normalized_question,
            conversation_text=conversation_text,
            item_matches=confident_item_matches,
        ):
            return self._finalize_reply(
                self.responder.conversation_response(
                    conversation_id=conversation_match.candidate.metadata["conversation_id"],
                    route_id=current_route_id,
                ),
                normalized_question=normalized_question,
                mode_match=mode_match,
                confident_item_matches=confident_item_matches,
                analysis_context=analysis_context,
            )

        if self._should_force_item_clarification(
            normalized_question=normalized_question,
            conversation_text=conversation_text,
            user_item_mentions=user_item_mentions,
            confident_item_matches=confident_item_matches,
        ):
            return self._finalize_reply(
                self.responder.ambiguous_item_clarification(user_item_mentions),
                normalized_question=normalized_question,
                mode_match=mode_match,
                confident_item_matches=confident_item_matches,
                analysis_context=analysis_context,
            )

        if len(confident_item_matches) > 1:
            return self._finalize_reply(
                self.responder.generate_multi_item_response(
                    item_matches=confident_item_matches,
                    mode_match=mode_match,
                    analysis_context=analysis_context,
                ),
                normalized_question=normalized_question,
                mode_match=mode_match,
                confident_item_matches=confident_item_matches,
                analysis_context=analysis_context,
            )

        llm_reply = self._llm_reply(
            message=message,
            analysis_context=analysis_context,
            conversation_context=conversation_context or [],
            page_context=page_context,
        )
        if llm_reply is not None:
            if self._should_request_item_clarification(
                llm_answer=llm_reply.get("answer", ""),
                user_item_mentions=user_item_mentions,
                confident_item_matches=confident_item_matches,
            ):
                return self._finalize_reply(
                    self.responder.ambiguous_item_clarification(user_item_mentions),
                    normalized_question=normalized_question,
                    mode_match=mode_match,
                    confident_item_matches=confident_item_matches,
                    analysis_context=analysis_context,
                )
            return self._finalize_reply(
                llm_reply,
                normalized_question=normalized_question,
                mode_match=mode_match,
                confident_item_matches=confident_item_matches,
                analysis_context=analysis_context,
            )

        entity_match = self.entity_engine.best(message, threshold=0.29)
        fallback_rank = self.entity_engine.rank(message, top_k=3)
        best_context_item = self._analysis_context_class_id(analysis_context)

        if (
            entity_match
            and entity_match.candidate.metadata.get("kind") == "item"
            and entity_match.candidate.metadata.get("class_id") not in explicit_item_positions
            and not self._is_high_confidence_item_match(entity_match)
        ):
            entity_match = None

        if mode_match and mode_match.candidate.metadata["mode_id"] == "system" and best_context_item:
            return self._finalize_reply(
                self.responder.system_explanation(best_context_item, analysis_context or {}),
                normalized_question=normalized_question,
                mode_match=mode_match,
                confident_item_matches=confident_item_matches,
                analysis_context=analysis_context,
            )

        if (
            not entity_match
            and current_route_id
            and self._looks_like_page_context_question(normalized_question)
        ):
            page_response = self.responder.response_for_page_context(current_route_id)
            if page_response:
                return self._finalize_reply(
                    page_response,
                    normalized_question=normalized_question,
                    mode_match=mode_match,
                    confident_item_matches=confident_item_matches,
                    analysis_context=analysis_context,
                )

        if not confident_item_matches and not entity_match and conversation_text and self._looks_like_follow_up(normalized_question):
            entity_match = self.entity_engine.best(
                f"{message} {conversation_text}",
                threshold=0.27,
            )

        if confident_item_matches:
            entity_match = confident_item_matches[0]

        if not entity_match and best_context_item and self._should_use_analysis_context(normalized_question):
            return self._finalize_reply(
                self.responder.generate_from_context(
                    class_id=best_context_item,
                    mode_id=mode_match.candidate.metadata["mode_id"] if mode_match else "action",
                    analysis_context=analysis_context,
                ),
                normalized_question=normalized_question,
                mode_match=mode_match,
                confident_item_matches=confident_item_matches,
                analysis_context=analysis_context,
            )

        if entity_match:
            return self._finalize_reply(
                self.responder.generate_from_match(
                    entity_match=entity_match,
                    mode_match=mode_match,
                    analysis_context=analysis_context,
                ),
                normalized_question=normalized_question,
                mode_match=mode_match,
                confident_item_matches=confident_item_matches,
                analysis_context=analysis_context,
            )

        if conversation_match:
            return self._finalize_reply(
                self.responder.conversation_response(
                    conversation_id=conversation_match.candidate.metadata["conversation_id"],
                    route_id=current_route_id,
                ),
                normalized_question=normalized_question,
                mode_match=mode_match,
                confident_item_matches=confident_item_matches,
                analysis_context=analysis_context,
            )

        suggestions = [match.candidate.label for match in fallback_rank if match.score >= 0.18]
        return self._finalize_reply(
            self.responder.fallback(
                suggestions=suggestions,
                domain_detected=self._is_domain_question(normalized_question, conversation_text),
                system_detected=self._is_system_question(normalized_question, conversation_text),
                route_id=current_route_id,
            ),
            normalized_question=normalized_question,
            mode_match=mode_match,
            confident_item_matches=confident_item_matches,
            analysis_context=analysis_context,
        )

    def _finalize_reply(
        self,
        reply: dict[str, Any],
        *,
        normalized_question: str,
        mode_match: IntentMatch | None,
        confident_item_matches: list[IntentMatch],
        analysis_context: dict[str, Any] | None,
    ) -> dict[str, Any]:
        finalized = dict(reply)
        finalized["map_request"] = self._build_map_request(
            normalized_question=normalized_question,
            reply=finalized,
            mode_match=mode_match,
            confident_item_matches=confident_item_matches,
            analysis_context=analysis_context,
        )
        return finalized

    def _build_map_request(
        self,
        *,
        normalized_question: str,
        reply: dict[str, Any],
        mode_match: IntentMatch | None,
        confident_item_matches: list[IntentMatch],
        analysis_context: dict[str, Any] | None,
    ) -> dict[str, str] | None:
        if reply.get("response_type") == "clarification":
            return None
        if not self._wants_nearby_map(normalized_question, mode_match):
            return None
        if len(confident_item_matches) > 1:
            return None

        class_id: str | None = None
        item_label: str | None = None

        referenced_item = reply.get("referenced_item")
        if isinstance(referenced_item, dict):
            referenced_class_id = referenced_item.get("class_id")
            referenced_label = referenced_item.get("display_name_pt")
            if isinstance(referenced_class_id, str) and referenced_class_id.strip():
                class_id = referenced_class_id.strip()
            if isinstance(referenced_label, str) and referenced_label.strip():
                item_label = referenced_label.strip()

        if class_id is None and len(confident_item_matches) == 1:
            match = confident_item_matches[0]
            class_id = match.candidate.metadata.get("class_id")
            item_label = match.candidate.metadata.get("display_name_pt")

        if (
            class_id is None
            and analysis_context
            and self._looks_like_analysis_item_reference(normalized_question)
        ):
            class_id = self._analysis_context_class_id(analysis_context)
            analysis_label = analysis_context.get("best_match", {}).get("display_name_pt")
            if isinstance(analysis_label, str) and analysis_label.strip():
                item_label = analysis_label.strip()

        if not isinstance(class_id, str) or not class_id.strip():
            return None

        profile, _ = self.knowledge_base.build_item_payload(
            class_id=class_id,
            analysis_context=analysis_context,
        )
        label = item_label.strip() if isinstance(item_label, str) and item_label.strip() else profile.display_name_pt
        article = "da" if label[:1].lower() in {"a", "e", "i", "o", "u"} else "do"
        return {
            "kind": "nearby_disposal_points",
            "class_id": class_id,
            "item_label": label,
            "disposal_stream": profile.disposal_stream,
            "prompt": (
                f"Posso te mostrar no mapa pontos proximos para descarte {article} {label} "
                "com base na sua localizacao atual."
            ),
        }

    def _wants_nearby_map(
        self,
        normalized_question: str,
        mode_match: IntentMatch | None,
    ) -> bool:
        if mode_match and mode_match.candidate.metadata.get("mode_id") == "where":
            return True
        return any(hint in normalized_question for hint in self._MAP_REQUEST_HINTS)

    def _looks_like_analysis_item_reference(self, normalized_question: str) -> bool:
        if any(hint in normalized_question for hint in self._ANALYSIS_REFERENCE_HINTS):
            return True
        tokens = normalized_question.split()
        if len(tokens) <= 3 and any(token in {"onde", "aonde", "mapa", "perto"} for token in tokens):
            return True
        return False

    def _llm_reply(
        self,
        *,
        message: str,
        analysis_context: dict[str, Any] | None,
        conversation_context: list[dict[str, str]],
        page_context: dict[str, Any] | None,
    ) -> dict[str, Any] | None:
        if self.llm is None:
            return None

        try:
            context_blocks = self._build_llm_context_blocks(
                message=message,
                analysis_context=analysis_context,
                page_context=page_context,
            )
            llm_reply = self.llm.generate_reply(
                message=message,
                conversation_context=conversation_context,
                system_prompt=self._llm_system_prompt(),
                context_blocks=context_blocks,
            )
            return {
                "response_type": llm_reply.response_type,
                "answer": llm_reply.answer,
                "action": llm_reply.action,
                "alert": llm_reply.alert,
                "analysis_warning": llm_reply.warning,
                "quick_replies": llm_reply.quick_replies,
                "used_item_context": bool(analysis_context),
                "referenced_item": self._llm_referenced_item(analysis_context),
            }
        except Exception:
            return None

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

    def _llm_referenced_item(
        self,
        analysis_context: dict[str, Any] | None,
    ) -> dict[str, str] | None:
        class_id = self._analysis_context_class_id(analysis_context)
        if not class_id:
            return None
        display_name = analysis_context.get("best_match", {}).get("display_name_pt")
        if not isinstance(display_name, str) or not display_name.strip():
            return None
        return {
            "class_id": class_id,
            "display_name_pt": display_name,
        }

    def _page_context_route_id(self, page_context: dict[str, Any] | None) -> str | None:
        if not page_context:
            return None
        route_id = page_context.get("id")
        return route_id if isinstance(route_id, str) and route_id.strip() else None

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

    def _looks_like_page_context_question(self, normalized_question: str) -> bool:
        if not normalized_question:
            return False
        return any(hint in normalized_question for hint in self._PAGE_CONTEXT_HINTS)

    def _extract_user_item_mentions(
        self,
        message: str,
        *,
        processed_question,
    ) -> list[str]:
        mentions: list[str] = []
        seen: set[str] = set()
        for segment in self._split_user_item_segments(processed_question.normalized):
            cleaned = self._clean_item_mention_segment(segment)
            if not cleaned:
                continue
            key = cleaned.casefold()
            if key in seen:
                continue
            seen.add(key)
            mentions.append(cleaned)
        return mentions

    def _clean_item_mention_segment(self, segment: str) -> str:
        cleaned = segment.strip(" ,;:.!?")
        prefix_patterns = (
            r"^(?:como(?: eu)?(?: posso)?(?: faco| faço)?(?: para)?(?: descartar)?\s+)",
            r"^(?:onde(?: eu)?(?: posso)?(?: descartar| jogar| levo)?\s+)",
            r"^(?:o que(?: eu)?(?: posso)?(?: faco| faço| fazer) com\s+)",
            r"^(?:oq(?: eu)?(?: posso)?(?: fzr| fazer| faco| faço) com\s+)",
            r"^(?:eu tenho\s+|tenho\s+|quero descartar\s+|preciso descartar\s+)",
            r"^(?:descartar\s+|jogar fora\s+|levar\s+)",
            r"^(?:uma\s+|um\s+|uns\s+|umas\s+|a\s+|o\s+|as\s+|os\s+)",
        )
        changed = True
        while changed and cleaned:
            changed = False
            for pattern in prefix_patterns:
                updated = re.sub(pattern, "", cleaned).strip(" ,;:.!?")
                if updated != cleaned:
                    cleaned = updated
                    changed = True
        cleaned = re.sub(r"\b(?:que|q) comprei\b.*$", "", cleaned).strip(" ,;:.!?")
        if len(cleaned.split()) < 1:
            return ""
        return cleaned

    def _split_user_item_segments(self, normalized_question: str) -> list[str]:
        if not normalized_question:
            return []
        segments = re.split(
            r"\s*(?:,|;|/|\bjunto com\b|\balem de\b|\bmais\b|\be uma\b|\be um\b|\be umas\b|\be uns\b)\s*",
            normalized_question,
        )
        return [segment.strip() for segment in segments if segment.strip()]

    def _should_prefer_local_conversation(
        self,
        *,
        normalized_question: str,
        conversation_text: str,
        item_matches: list[IntentMatch],
    ) -> bool:
        if not normalized_question:
            return False
        if item_matches:
            return False
        if len(normalized_question.split()) > 6:
            return False
        if self._is_domain_question(normalized_question, conversation_text):
            return False
        if self._is_system_question(normalized_question, conversation_text):
            return False
        return True

    def _should_request_item_clarification(
        self,
        *,
        llm_answer: str,
        user_item_mentions: list[str],
        confident_item_matches: list[IntentMatch],
    ) -> bool:
        if len(user_item_mentions) < 2:
            return False
        if len(confident_item_matches) >= len(user_item_mentions):
            return False
        return not self._answer_covers_all_item_mentions(llm_answer, user_item_mentions)

    def _should_force_item_clarification(
        self,
        *,
        normalized_question: str,
        conversation_text: str,
        user_item_mentions: list[str],
        confident_item_matches: list[IntentMatch],
    ) -> bool:
        if len(user_item_mentions) < 2:
            return False
        if len(confident_item_matches) >= len(user_item_mentions):
            return False
        if not self._is_domain_question(normalized_question, conversation_text):
            return False
        if self._question_contains_material_detail(normalized_question):
            return False
        return any(self._is_ambiguous_packaging_mention(mention) for mention in user_item_mentions)

    def _is_ambiguous_packaging_mention(self, mention: str) -> bool:
        tokens = self.preprocessor.process(mention).expanded_tokens
        if not tokens:
            return False
        return tokens[0] in self._AMBIGUOUS_PACKAGING_TOKENS

    def _question_contains_material_detail(self, normalized_question: str) -> bool:
        return any(hint in normalized_question for hint in self._MATERIAL_HINTS)

    def _answer_covers_all_item_mentions(
        self,
        answer: str,
        user_item_mentions: list[str],
    ) -> bool:
        answer_tokens = set(self.preprocessor.process(answer).expanded_tokens)
        for mention in user_item_mentions:
            mention_tokens = [
                token
                for token in self.preprocessor.process(mention).expanded_tokens
                if token not in self._GENERIC_ITEM_TOKENS
            ]
            if not mention_tokens:
                mention_tokens = list(self.preprocessor.process(mention).expanded_tokens)
            if not mention_tokens:
                continue
            if not any(token in answer_tokens for token in mention_tokens):
                return False
        return True

    def _is_domain_question(self, normalized_question: str, conversation_text: str) -> bool:
        combined = self.preprocessor.process(f"{normalized_question} {conversation_text}".strip())
        keywords = set(combined.expanded_tokens)
        return any(term in token or token in term for token in keywords for term in self._DOMAIN_TERMS)

    def _is_system_question(self, normalized_question: str, conversation_text: str) -> bool:
        combined = self.preprocessor.process(f"{normalized_question} {conversation_text}".strip())
        keywords = set(combined.expanded_tokens)
        return any(term in token or token in term for token in keywords for term in self._SYSTEM_TERMS)

    def _build_llm_context_blocks(
        self,
        *,
        message: str,
        analysis_context: dict[str, Any] | None,
        page_context: dict[str, Any] | None,
    ) -> list[str]:
        blocks: list[str] = []
        current_route_id = self._page_context_route_id(page_context)
        processed_message = self.preprocessor.process(message)
        user_item_mentions = self._extract_user_item_mentions(
            message,
            processed_question=processed_message,
        )

        if user_item_mentions:
            blocks.append(
                "[ITENS MENCIONADOS PELO USUARIO]\n"
                + "\n".join(f"- {item}" for item in user_item_mentions[:4])
            )

        if current_route_id:
            page_entry = self.knowledge_base.get_system_entry_for_route(current_route_id)
            if page_entry:
                blocks.append(
                    "\n".join(
                        [
                            f"[PAGINA ATUAL] {page_entry.label}",
                            f"Resumo: {page_entry.answer}",
                            f"Orientacao: {page_entry.action}",
                        ]
                    )
                )

        if analysis_context:
            best_match = analysis_context.get("best_match", {})
            display_name = best_match.get("display_name_pt")
            recommendation = best_match.get("recommendation")
            dropoff = best_match.get("dropoff")
            preparation = best_match.get("preparation")
            if isinstance(display_name, str) and display_name.strip():
                lines = [f"[ULTIMA ANALISE] Item: {display_name.strip()}"]
                if isinstance(recommendation, str) and recommendation.strip():
                    lines.append(f"Como descartar: {recommendation.strip()}")
                if isinstance(dropoff, str) and dropoff.strip():
                    lines.append(f"Destino: {dropoff.strip()}")
                if isinstance(preparation, str) and preparation.strip():
                    lines.append(f"Preparacao: {preparation.strip()}")
                blocks.append("\n".join(lines))

        explicit_item_positions = self._detect_explicit_item_positions(processed_message.expanded_tokens)
        item_matches = self._confident_item_matches(
            self._extract_item_matches(message, processed_message),
            explicit_item_positions=explicit_item_positions,
        )
        for match in item_matches[:4]:
            class_id = match.candidate.metadata["class_id"]
            profile, advisory = self.knowledge_base.build_item_payload(
                class_id,
                analysis_context=analysis_context,
            )
            blocks.append(
                "\n".join(
                    [
                        f"[ITEM RELEVANTE] {profile.display_name_pt}",
                        f"Descricao: {profile.description_pt}",
                        f"Recomendacao: {advisory['recommendation']}",
                        f"Preparacao: {advisory['preparation']}",
                        f"Destino: {advisory['dropoff']}",
                        f"Perigoso: {'sim' if profile.hazardous else 'nao'}",
                    ]
                )
            )

        ranked = self.entity_engine.rank(message, top_k=8)
        for match in ranked:
            metadata = match.candidate.metadata
            kind = metadata.get("kind")
            if kind == "topic":
                topic = self.knowledge_base.get_topic(metadata["topic_id"])
                blocks.append(
                    "\n".join(
                        [
                            f"[TEMA RELEVANTE] {metadata['topic_id']}",
                            f"Resumo: {topic.answer}",
                            f"Orientacao: {topic.action}",
                        ]
                    )
                )
            elif kind == "system":
                entry = self.knowledge_base.get_system_entry(metadata["entry_id"])
                blocks.append(
                    "\n".join(
                        [
                            f"[FUNCIONALIDADE RELEVANTE] {entry.label}",
                            f"Resumo: {entry.answer}",
                            f"Orientacao: {entry.action}",
                        ]
                    )
                )

        deduped: list[str] = []
        seen: set[str] = set()
        for block in blocks:
            key = block.strip()
            if not key or key in seen:
                continue
            seen.add(key)
            deduped.append(key)
        return deduped[:8]

    def _llm_system_prompt(self) -> str:
        return (
            "Voce e o assistente conversacional da Reuse.AI. "
            "Responda em portugues do Brasil, com tom natural, curto e util. "
            "Converse normalmente com o usuario, inclusive em cumprimentos como 'oi', 'tudo bem?', 'valeu' e perguntas abertas. "
            "Nao diga a frase 'Ainda nao encontrei uma correspondencia forte o bastante para responder com seguranca.'. "
            "Nao fale como se fosse um classificador por regras. "
            "Use o CONTEXTO RECUPERADO apenas como apoio factual sobre descarte, acessibilidade, sustentabilidade e funcionalidades do sistema. "
            "Se houver mais de um item na pergunta, responda cobrindo todos eles, separando por item de forma clara. "
            "Se faltar contexto para responder com certeza, faca uma pergunta de esclarecimento natural, sem soar robotico. "
            "Quando falar de descarte, priorize seguranca e praticidade. "
            "Sua saida DEVE ser JSON valido seguindo o schema. "
            "Em 'answer', responda de forma conversacional. "
            "Nunca responda so com uma introducao como 'otimo, vou te explicar' ou 'claro, vou ajudar'. "
            "O campo 'answer' precisa trazer a orientacao concreta principal e, quando houver mais de um item, cobrir todos eles. "
            "Em 'action', traga o proximo passo ou complemento util, ou use null quando nao houver complemento necessario. "
            "Em cumprimentos curtos e conversa social, responda de forma simples e acolhedora, sem burocracia. "
            "Nesses casos, use 'alert' como null e 'analysis_warning' como null. "
            "Se o item estiver ambiguo ou o nome nao deixar claro o material, faca uma pergunta curta de esclarecimento em vez de assumir o descarte. "
            "Se houver uma lista em [ITENS MENCIONADOS PELO USUARIO], voce deve considerar todos esses itens e nao responder apenas o primeiro. "
            "Nunca escreva placeholders, slugs, snake_case, status internos ou identificadores como 'esperando_proxima_pergunta'. "
            "Em 'quick_replies', sugira de 2 a 4 proximas perguntas curtas e relevantes."
        )

    def _confident_item_matches(
        self,
        item_matches: list[IntentMatch],
        *,
        explicit_item_positions: dict[str, int],
    ) -> list[IntentMatch]:
        confident: list[IntentMatch] = []
        seen: set[str] = set()
        for match in item_matches:
            class_id = match.candidate.metadata.get("class_id")
            if not isinstance(class_id, str) or class_id in seen:
                continue
            if class_id in explicit_item_positions or self._is_high_confidence_item_match(match):
                confident.append(match)
                seen.add(class_id)
        return confident

    def _is_high_confidence_item_match(self, match: IntentMatch) -> bool:
        return (
            match.score >= 0.72
            or (
                match.score >= 0.64
                and match.lexical_score >= 0.72
                and match.semantic_score >= 0.62
            )
        )

    def _build_item_alias_tokens(self) -> dict[str, tuple[tuple[str, ...], ...]]:
        alias_map = self.knowledge_base.build_item_alias_map()
        tokens_by_item: dict[str, tuple[tuple[str, ...], ...]] = {}
        for class_id, aliases in alias_map.items():
            seen: set[tuple[str, ...]] = set()
            alias_tokens: list[tuple[str, ...]] = []
            for alias in aliases:
                processed = self.preprocessor.process(alias)
                if not processed.expanded_tokens:
                    continue
                sequence = tuple(processed.expanded_tokens)
                if sequence in seen:
                    continue
                seen.add(sequence)
                alias_tokens.append(sequence)
            tokens_by_item[class_id] = tuple(alias_tokens)
        return tokens_by_item

    def _extract_item_matches(
        self,
        message: str,
        processed_question,
    ) -> list[IntentMatch]:
        matches_by_class: dict[str, IntentMatch] = {}
        positions = self._detect_explicit_item_positions(processed_question.expanded_tokens)

        def register(match: IntentMatch) -> None:
            if match.candidate.metadata.get("kind") != "item":
                return
            class_id = match.candidate.metadata["class_id"]
            previous = matches_by_class.get(class_id)
            if previous is None or match.score > previous.score:
                matches_by_class[class_id] = match

        for class_id in positions:
            synthetic_match = self._synthetic_item_match(class_id)
            if synthetic_match:
                register(synthetic_match)

        best_full_item = self._best_item_match(message, threshold=0.29)
        if best_full_item:
            register(best_full_item)

        for segment in self._split_message_segments(processed_question.normalized):
            segment_processed = self.preprocessor.process(segment)
            segment_positions = self._detect_explicit_item_positions(segment_processed.expanded_tokens)
            for class_id in segment_positions:
                ranked_for_class = self._rank_item_match_for_class(segment, class_id, threshold=0.18)
                if ranked_for_class:
                    register(ranked_for_class)
                    continue
                synthetic_match = self._synthetic_item_match(class_id)
                if synthetic_match:
                    register(synthetic_match)

            if not segment_positions:
                best_segment_item = self._best_item_match(segment, threshold=0.34)
                if best_segment_item:
                    register(best_segment_item)

        ordered_matches = list(matches_by_class.values())
        ordered_matches.sort(
            key=lambda match: (
                positions.get(match.candidate.metadata["class_id"], 10_000),
                -match.score,
            )
        )
        return ordered_matches

    def _best_item_match(self, text: str, threshold: float) -> IntentMatch | None:
        ranked = self.entity_engine.rank(text, top_k=8)
        for match in ranked:
            if match.candidate.metadata.get("kind") != "item":
                continue
            if match.score >= threshold:
                return match
        return None

    def _rank_item_match_for_class(
        self,
        text: str,
        class_id: str,
        threshold: float,
    ) -> IntentMatch | None:
        for match in self.entity_engine.rank(text, top_k=8):
            if match.candidate.metadata.get("kind") != "item":
                continue
            if match.candidate.metadata["class_id"] != class_id:
                continue
            return match if match.score >= threshold else None
        return None

    def _split_message_segments(self, normalized_question: str) -> list[str]:
        if not normalized_question:
            return []
        segments = re.split(
            r"\s*(?:,|;|/|\be\b|\bou\b|\bjunto com\b|\balem de\b|\bmais\b)\s*",
            normalized_question,
        )
        cleaned_segments = []
        for segment in segments:
            cleaned = segment.strip()
            if len(cleaned.split()) < 1:
                continue
            cleaned_segments.append(cleaned)
        return cleaned_segments

    def _detect_explicit_item_positions(
        self,
        expanded_tokens: tuple[str, ...],
    ) -> dict[str, int]:
        positions: dict[str, int] = {}
        for class_id, aliases in self.item_alias_tokens.items():
            best_position: int | None = None
            for alias_tokens in aliases:
                position = self._find_alias_position(expanded_tokens, alias_tokens)
                if position is None:
                    continue
                if best_position is None or position < best_position:
                    best_position = position
            if best_position is not None:
                positions[class_id] = best_position
        return positions

    def _find_alias_position(
        self,
        expanded_tokens: tuple[str, ...],
        alias_tokens: tuple[str, ...],
    ) -> int | None:
        if not alias_tokens:
            return None

        if len(alias_tokens) == 1:
            try:
                return expanded_tokens.index(alias_tokens[0])
            except ValueError:
                return None

        limit = len(expanded_tokens) - len(alias_tokens) + 1
        for index in range(max(limit, 0)):
            if expanded_tokens[index : index + len(alias_tokens)] == alias_tokens:
                return index
        return None

    def _synthetic_item_match(self, class_id: str) -> IntentMatch | None:
        candidate = self.item_candidates_by_class_id.get(class_id)
        if candidate is None:
            return None
        return IntentMatch(
            candidate=candidate,
            score=1.0,
            semantic_score=1.0,
            lexical_score=1.0,
            fuzzy_score=1.0,
        )

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

    def _conversation_definitions(self) -> list[dict[str, Any]]:
        return [
            {
                "intent_id": "conversation:greeting",
                "label": "cumprimento",
                "examples": (
                    "oi",
                    "ola",
                    "opa",
                    "e ai",
                    "tudo bem",
                    "como vai",
                    "bom dia",
                    "boa tarde",
                    "boa noite",
                    "salve",
                ),
                "metadata": {"conversation_id": "greeting"},
            },
            {
                "intent_id": "conversation:thanks",
                "label": "agradecimento",
                "examples": (
                    "obrigado",
                    "obrigada",
                    "valeu",
                    "muito obrigado",
                    "obg",
                    "vlw",
                ),
                "metadata": {"conversation_id": "thanks"},
            },
            {
                "intent_id": "conversation:goodbye",
                "label": "despedida",
                "examples": (
                    "tchau",
                    "ate mais",
                    "falou",
                    "ate logo",
                    "fui",
                ),
                "metadata": {"conversation_id": "goodbye"},
            },
            {
                "intent_id": "conversation:identity",
                "label": "identidade do assistente",
                "examples": (
                    "quem e voce",
                    "o que voce faz",
                    "como voce pode me ajudar",
                    "pra que voce serve",
                    "voce ajuda em que",
                ),
                "metadata": {"conversation_id": "identity"},
            },
        ]
