from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass
from typing import Any

import httpx


@dataclass(frozen=True)
class LLMChatReply:
    response_type: str
    answer: str
    action: str | None
    quick_replies: list[str]
    alert: str | None = None
    warning: str | None = None


class BaseChatbotLLM:
    def generate_reply(
        self,
        *,
        message: str,
        conversation_context: list[dict[str, str]],
        system_prompt: str,
        context_blocks: list[str],
    ) -> LLMChatReply:
        raise NotImplementedError

    def _build_input_messages(
        self,
        *,
        message: str,
        conversation_context: list[dict[str, str]],
        context_blocks: list[str],
    ) -> list[dict[str, str]]:
        input_messages: list[dict[str, str]] = []
        for entry in conversation_context[-8:]:
            role = entry.get("role")
            text = entry.get("text")
            if role not in {"user", "assistant"}:
                continue
            if not isinstance(text, str) or not text.strip():
                continue
            input_messages.append({"role": role, "content": text.strip()})

        user_context = ""
        if context_blocks:
            user_context = "\n\n".join(context_blocks).strip()

        user_message = message.strip()
        if user_context:
            user_message = (
                f"PERGUNTA DO USUARIO:\n{user_message}\n\n"
                f"CONTEXTO RECUPERADO DA REUSE.AI:\n{user_context}"
            )

        input_messages.append({"role": "user", "content": user_message})
        return input_messages

    def _reply_from_json_text(self, content_text: str) -> LLMChatReply:
        parsed = json.loads(content_text)

        answer = self._normalize_required_text(
            parsed.get("answer"),
            fallback="Posso te ajudar com essa duvida.",
        )
        action = self._normalize_optional_text(parsed.get("action"))
        if action and self._is_duplicate_support_text(answer, action):
            action = None

        quick_replies = self._normalize_quick_replies(parsed.get("quick_replies"))
        alert = self._normalize_optional_text(parsed.get("alert"))
        warning = self._normalize_optional_text(parsed.get("analysis_warning"))

        if alert and self._looks_like_low_signal_meta_text(alert):
            alert = None
        if warning and self._looks_like_low_signal_meta_text(warning):
            warning = None

        return LLMChatReply(
            response_type=str(parsed.get("response_type", "explanation")).strip() or "explanation",
            answer=answer,
            action=action,
            alert=alert,
            warning=warning,
            quick_replies=quick_replies or [
                "Como analisar uma imagem?",
                "Onde descartar pilhas?",
                "Como funciona o ranking?",
            ],
        )

    def _response_schema(self) -> dict[str, Any]:
        return {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "response_type": {
                    "type": "string",
                    "enum": ["decision", "explanation", "alert", "clarification"],
                },
                "answer": {"type": "string"},
                "action": {"type": ["string", "null"]},
                "alert": {"type": ["string", "null"]},
                "analysis_warning": {"type": ["string", "null"]},
                "quick_replies": {
                    "type": "array",
                    "minItems": 2,
                    "maxItems": 4,
                    "items": {"type": "string"},
                },
            },
            "required": [
                "response_type",
                "answer",
                "action",
                "alert",
                "analysis_warning",
                "quick_replies",
            ],
        }

    def _normalize_optional_text(self, value: Any) -> str | None:
        if value is None:
            return None
        text = self._compact_text(str(value))
        if text and self._looks_like_internal_token(text):
            return None
        return text or None

    def _normalize_required_text(self, value: Any, *, fallback: str) -> str:
        text = self._compact_text("" if value is None else str(value))
        if not text:
            return fallback
        if self._looks_like_internal_token(text):
            return fallback
        return text

    def _normalize_quick_replies(self, value: Any) -> list[str]:
        if not isinstance(value, list):
            return []
        cleaned: list[str] = []
        seen: set[str] = set()
        for item in value:
            text = self._normalize_optional_text(item)
            if not text:
                continue
            if self._looks_like_internal_token(text):
                continue
            if len(text) > 90:
                continue
            key = text.casefold()
            if key in seen:
                continue
            seen.add(key)
            cleaned.append(text)
            if len(cleaned) >= 4:
                break
        return cleaned

    def _compact_text(self, text: str) -> str:
        compacted = re.sub(r"\s+", " ", text).strip()
        if compacted.lower() in {"null", "none", "n/a", "na"}:
            return ""
        return compacted

    def _looks_like_internal_token(self, text: str) -> bool:
        normalized = text.strip()
        if not normalized:
            return False
        if "_" in normalized and " " not in normalized:
            return True
        if re.fullmatch(r"[a-z0-9]+(?:[_-][a-z0-9]+){1,6}", normalized.lower()):
            return True
        return False

    def _looks_like_low_signal_meta_text(self, text: str) -> bool:
        normalized = text.casefold()
        patterns = (
            "nao ha informacoes",
            "não há informações",
            "nao tenho informacoes",
            "não tenho informações",
            "no contexto para responder",
            "no contexto para ajudar",
            "posso ajudar com alguma outra coisa",
            "analise da ia pode ter algumas limitacoes",
            "análise da ia pode ter algumas limitações",
        )
        return any(pattern in normalized for pattern in patterns)

    def _is_duplicate_support_text(self, answer: str, action: str) -> bool:
        return answer.casefold() == action.casefold()


class OpenAIChatbotLLM(BaseChatbotLLM):
    def __init__(
        self,
        api_key: str,
        model: str,
        base_url: str = "https://api.openai.com/v1",
        timeout_seconds: float = 30.0,
    ) -> None:
        self.api_key = api_key.strip()
        self.model = model.strip()
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    def generate_reply(
        self,
        *,
        message: str,
        conversation_context: list[dict[str, str]],
        system_prompt: str,
        context_blocks: list[str],
    ) -> LLMChatReply:
        payload = {
            "model": self.model,
            "instructions": system_prompt,
            "input": self._build_input_messages(
                message=message,
                conversation_context=conversation_context,
                context_blocks=context_blocks,
            ),
            "temperature": 0.5,
            "max_output_tokens": 700,
            "store": False,
            "truncation": "auto",
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": "assistant_reply",
                    "strict": True,
                    "schema": self._response_schema(),
                }
            },
        }

        with httpx.Client(timeout=self.timeout_seconds) as client:
            response = client.post(
                f"{self.base_url}/responses",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )

        response.raise_for_status()
        data = response.json()
        content_text = self._extract_output_text(data)
        return self._reply_from_json_text(content_text)

    def _extract_output_text(self, payload: dict[str, Any]) -> str:
        for item in payload.get("output", []):
            if item.get("type") != "message":
                continue
            for content in item.get("content", []):
                if content.get("type") == "output_text" and isinstance(content.get("text"), str):
                    return content["text"]
        raise ValueError("A resposta da API OpenAI nao trouxe texto estruturado.")


class OllamaChatbotLLM(BaseChatbotLLM):
    def __init__(
        self,
        model: str,
        base_url: str = "http://localhost:11434/api",
        timeout_seconds: float = 60.0,
        api_key: str | None = None,
    ) -> None:
        self.model = model.strip()
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds
        self.api_key = (api_key or "").strip() or None

    def generate_reply(
        self,
        *,
        message: str,
        conversation_context: list[dict[str, str]],
        system_prompt: str,
        context_blocks: list[str],
    ) -> LLMChatReply:
        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system_prompt},
                *self._build_input_messages(
                    message=message,
                    conversation_context=conversation_context,
                    context_blocks=context_blocks,
                ),
            ],
            "stream": False,
            "format": self._response_schema(),
        }

        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        with httpx.Client(timeout=self.timeout_seconds) as client:
            response = client.post(
                f"{self.base_url}/chat",
                headers=headers,
                json=payload,
            )

        response.raise_for_status()
        data = response.json()
        content_text = (
            data.get("message", {}).get("content")
            if isinstance(data.get("message"), dict)
            else None
        )
        if not isinstance(content_text, str) or not content_text.strip():
            raise ValueError("A resposta da API Ollama nao trouxe conteudo estruturado.")
        return self._reply_from_json_text(content_text)


def build_chatbot_llm_from_env() -> BaseChatbotLLM | None:
    provider = os.environ.get("CHATBOT_LLM_PROVIDER", "").strip().lower()

    ollama_model = os.environ.get("OLLAMA_MODEL", "").strip()
    openai_api_key = os.environ.get("OPENAI_API_KEY", "").strip()

    if provider == "ollama" or (not provider and ollama_model):
        if not ollama_model:
            return None
        return OllamaChatbotLLM(
            model=ollama_model,
            base_url=os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434/api").strip()
            or "http://localhost:11434/api",
            timeout_seconds=float(os.environ.get("OLLAMA_TIMEOUT_SECONDS", "60").strip() or "60"),
            api_key=os.environ.get("OLLAMA_API_KEY", "").strip() or None,
        )

    if provider == "openai" or (not provider and openai_api_key):
        if not openai_api_key:
            return None
        return OpenAIChatbotLLM(
            api_key=openai_api_key,
            model=os.environ.get("OPENAI_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini",
            base_url=os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1").strip()
            or "https://api.openai.com/v1",
            timeout_seconds=float(os.environ.get("OPENAI_TIMEOUT_SECONDS", "30").strip() or "30"),
        )

    return None
