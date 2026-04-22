from __future__ import annotations

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from reuse_ai.chatbot import RecyclingChatbotService


_chatbot_service: RecyclingChatbotService | None = None


def get_chatbot_service() -> RecyclingChatbotService:
    global _chatbot_service
    if _chatbot_service is None:
        _chatbot_service = RecyclingChatbotService()
    return _chatbot_service


class ChatbotView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        payload = request.data if isinstance(request.data, dict) else {}
        message = payload.get("message", "")
        analysis_context = payload.get("analysis_context")
        conversation_context = payload.get("conversation_context")

        if not isinstance(message, str):
            return Response(
                {"detail": "Campo 'message' invalido."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if analysis_context is not None and not isinstance(analysis_context, dict):
            return Response(
                {"detail": "Campo 'analysis_context' invalido."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if conversation_context is not None and not isinstance(conversation_context, list):
            return Response(
                {"detail": "Campo 'conversation_context' invalido."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        sanitized_context: list[dict[str, str]] = []
        if isinstance(conversation_context, list):
            for entry in conversation_context[:8]:
                if not isinstance(entry, dict):
                    continue
                role = entry.get("role", "user")
                text = entry.get("text", "")
                if isinstance(role, str) and isinstance(text, str) and text.strip():
                    sanitized_context.append({"role": role, "text": text})

        reply = get_chatbot_service().reply(
            message=message,
            analysis_context=analysis_context,
            conversation_context=sanitized_context,
        )
        return Response(reply, status=status.HTTP_200_OK)
