from __future__ import annotations

from typing import Any

from django.db import transaction
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import AssistantChatMessage, AssistantChatSession
from reuse_ai.chatbot import RecyclingChatbotService


_chatbot_service: RecyclingChatbotService | None = None


def get_chatbot_service() -> RecyclingChatbotService:
    global _chatbot_service
    if _chatbot_service is None:
        _chatbot_service = RecyclingChatbotService()
    return _chatbot_service


def session_queryset_for_user(user):
    return AssistantChatSession.objects.filter(user=user).prefetch_related("messages")


def sanitize_conversation_context(entries: Any) -> list[dict[str, str]]:
    sanitized: list[dict[str, str]] = []
    if not isinstance(entries, list):
        return sanitized
    for entry in entries[:8]:
        if not isinstance(entry, dict):
            continue
        role = entry.get("role", "user")
        text = entry.get("text", "")
        if isinstance(role, str) and isinstance(text, str) and text.strip():
            sanitized.append({"role": role, "text": text.strip()})
    return sanitized


def sanitize_page_context(page_context: Any) -> dict[str, str] | None:
    if not isinstance(page_context, dict):
        return None
    page_id = page_context.get("id")
    pathname = page_context.get("pathname")
    label = page_context.get("label")
    if not isinstance(page_id, str) or not page_id.strip():
        return None
    sanitized = {"id": page_id.strip()}
    if isinstance(pathname, str) and pathname.strip():
        sanitized["pathname"] = pathname.strip()
    if isinstance(label, str) and label.strip():
        sanitized["label"] = label.strip()
    return sanitized


def build_conversation_from_session(session: AssistantChatSession) -> list[dict[str, str]]:
    recent_messages = list(session.messages.all())[-8:]
    return [
        {"role": message.role, "text": message.text}
        for message in recent_messages
        if message.text.strip()
    ]


def build_session_title(message: str) -> str:
    compact = " ".join(message.strip().split())
    if len(compact) <= 80:
        return compact
    return compact[:77].rstrip() + "..."


def build_preview(text: str) -> str:
    compact = " ".join(text.strip().split())
    if len(compact) <= 220:
        return compact
    return compact[:217].rstrip() + "..."


def serialize_session(session: AssistantChatSession) -> dict[str, Any]:
    return {
        "id": session.id,
        "title": session.title or "Nova conversa",
        "last_message_preview": session.last_message_preview,
        "started_from_route": session.started_from_route or None,
        "created_at": session.created_at.isoformat(),
        "updated_at": session.updated_at.isoformat(),
        "closed_at": session.closed_at.isoformat() if session.closed_at else None,
        "read_only": session.closed_at is not None,
        "is_active": session.closed_at is None,
        "message_count": session.messages.count(),
    }


def serialize_message(message: AssistantChatMessage) -> dict[str, Any]:
    metadata = message.message_metadata or {}
    payload = {
        "id": message.id,
        "role": message.role,
        "text": message.text,
        "created_at": message.created_at.isoformat(),
    }
    if message.role == AssistantChatMessage.ROLE_ASSISTANT:
        payload.update(
            {
                "response_type": message.response_type or "explanation",
                "action": message.action or None,
                "alert": message.alert or None,
                "analysis_warning": message.analysis_warning or None,
                "quick_replies": list(message.quick_replies or []),
                "map_request": metadata.get("map_request"),
            }
        )
    return payload


class ChatbotView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        payload = request.data if isinstance(request.data, dict) else {}
        message = payload.get("message", "")
        analysis_context = payload.get("analysis_context")
        conversation_context = payload.get("conversation_context")
        page_context = payload.get("page_context")
        session_id = payload.get("session_id")

        if not isinstance(message, str) or not message.strip():
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

        if page_context is not None and not isinstance(page_context, dict):
            return Response(
                {"detail": "Campo 'page_context' invalido."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if session_id is not None and not isinstance(session_id, int):
            return Response(
                {"detail": "Campo 'session_id' invalido."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        sanitized_page_context = sanitize_page_context(page_context)
        fallback_context = sanitize_conversation_context(conversation_context)

        with transaction.atomic():
            if session_id is None:
                session = AssistantChatSession.objects.create(
                    user=request.user,
                    title=build_session_title(message),
                    started_from_route=(sanitized_page_context or {}).get("id", ""),
                )
            else:
                session = session_queryset_for_user(request.user).filter(id=session_id).first()
                if session is None:
                    return Response(
                        {"detail": "Conversa nao encontrada."},
                        status=status.HTTP_404_NOT_FOUND,
                    )
                if session.closed_at is not None:
                    return Response(
                        {"detail": "Essa conversa esta fechada e disponivel apenas para leitura."},
                        status=status.HTTP_409_CONFLICT,
                    )

            server_context = build_conversation_from_session(session)
            if not server_context:
                server_context = fallback_context

            AssistantChatMessage.objects.create(
                session=session,
                role=AssistantChatMessage.ROLE_USER,
                text=message.strip(),
            )

            reply = get_chatbot_service().reply(
                message=message.strip(),
                analysis_context=analysis_context,
                conversation_context=server_context,
                page_context=sanitized_page_context,
            )

            AssistantChatMessage.objects.create(
                session=session,
                role=AssistantChatMessage.ROLE_ASSISTANT,
                text=str(reply.get("answer", "")).strip(),
                response_type=str(reply.get("response_type", "")).strip(),
                action=str(reply.get("action", "")).strip() if reply.get("action") else "",
                alert=str(reply.get("alert", "")).strip() if reply.get("alert") else "",
                analysis_warning=(
                    str(reply.get("analysis_warning", "")).strip()
                    if reply.get("analysis_warning")
                    else ""
                ),
                quick_replies=list(reply.get("quick_replies", []) or []),
                message_metadata={
                    "map_request": reply.get("map_request"),
                },
            )

            session.last_message_preview = build_preview(str(reply.get("answer", "")).strip() or message)
            if not session.title:
                session.title = build_session_title(message)
            if sanitized_page_context and not session.started_from_route:
                session.started_from_route = sanitized_page_context.get("id", "")
            session.save(
                update_fields=[
                    "title",
                    "last_message_preview",
                    "started_from_route",
                    "updated_at",
                ]
            )

        response_payload = dict(reply)
        response_payload["session"] = serialize_session(session)
        return Response(response_payload, status=status.HTTP_200_OK)


class ChatbotSessionListView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        sessions = list(session_queryset_for_user(request.user)[:30])
        return Response(
            {"sessions": [serialize_session(session) for session in sessions]},
            status=status.HTTP_200_OK,
        )


class ChatbotSessionDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, session_id: int):
        session = session_queryset_for_user(request.user).filter(id=session_id).first()
        if session is None:
            return Response(
                {"detail": "Conversa nao encontrada."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            {
                "session": serialize_session(session),
                "messages": [serialize_message(message) for message in session.messages.all()],
            },
            status=status.HTTP_200_OK,
        )


class ChatbotSessionCloseView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, session_id: int):
        session = session_queryset_for_user(request.user).filter(id=session_id).first()
        if session is None:
            return Response(
                {"detail": "Conversa nao encontrada."},
                status=status.HTTP_404_NOT_FOUND,
            )

        if session.closed_at is None:
            session.closed_at = timezone.now()
            session.save(update_fields=["closed_at", "updated_at"])

        return Response(
            {"session": serialize_session(session)},
            status=status.HTTP_200_OK,
        )
