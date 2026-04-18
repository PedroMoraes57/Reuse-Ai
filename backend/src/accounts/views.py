import logging
import re
from typing import Any

from django.contrib.auth import authenticate
from django.conf import settings
from django.contrib.auth.models import User
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.encoding import force_str
from django.utils.http import urlsafe_base64_decode
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2 import id_token as google_id_token
from rest_framework import status
from rest_framework.authtoken.models import Token
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .emails import send_email_verification, send_password_reset_email
from .gamification import (
    _score_battle_answers,
    build_battle_questions,
    build_game_profile_summary,
    build_missions_state,
    build_public_battle_questions,
    build_ranked_profiles,
    build_recent_events,
    submit_battle_answers,
    submit_quiz_answers,
)
from .models import (
    Friendship,
    SustainabilityBattle,
    UserNotification,
    UserProfile,
    get_or_create_profile,
)
from .serializers import (
    ConfirmPasswordResetSerializer,
    GoogleAuthSerializer,
    RegisterSerializer,
    RequestPasswordResetSerializer,
    ResendVerificationSerializer,
    UpdateUsernameSerializer,
    UserSerializer,
)
from .tokens import email_verification_token_generator, password_reset_token_generator

logger = logging.getLogger(__name__)

TRANSIENT_NOTIFICATION_KINDS = {
    UserNotification.KIND_FRIEND_ACCEPTED,
    UserNotification.KIND_BATTLE_ACCEPTED,
    UserNotification.KIND_BATTLE_DECLINED,
    UserNotification.KIND_BATTLE_TURN,
    UserNotification.KIND_BATTLE_STEAL,
    UserNotification.KIND_BATTLE_COMPLETED,
}


def build_user_display_name(user: User) -> str:
    full_name = user.get_full_name().strip()
    return full_name or user.username


def build_avatar_url(user: User, request=None) -> str | None:
    profile = get_or_create_profile(user)
    if not profile.avatar:
        return None
    return profile.avatar.url


def serialize_leaderboard_entry(profile: UserProfile, rank: int) -> dict[str, Any]:
    weekly_xp = int(getattr(profile, "weekly_xp", 0) or 0)
    avatar_url = profile.avatar.url if profile.avatar else None

    return {
        "rank": rank,
        "user_id": profile.user_id,
        "username": profile.user.username,
        "display_name": build_user_display_name(profile.user),
        "avatar_url": avatar_url,
        "weekly_xp": weekly_xp,
        "xp_total": profile.xp_total,
        "level": profile.level,
        "level_title": build_game_profile_summary(profile)["level_title"],
        "total_analyses": profile.total_analyses,
        "current_streak": profile.current_streak,
    }


def serialize_user_card(user: User) -> dict[str, Any]:
    profile = get_or_create_profile(user)
    return {
        "id": user.id,
        "username": user.username,
        "display_name": build_user_display_name(user),
        "full_name": user.get_full_name().strip(),
        "avatar_url": build_avatar_url(user),
        "game_profile": build_game_profile_summary(profile),
    }


def get_friendship_between(user: User, other_user: User) -> Friendship | None:
    return (
        Friendship.objects.select_related("requester", "addressee")
        .filter(
            Q(requester=user, addressee=other_user)
            | Q(requester=other_user, addressee=user)
        )
        .order_by("-created_at")
        .first()
    )


def build_relationship_payload(viewer: User, target_user: User) -> dict[str, Any]:
    if not viewer.is_authenticated:
        return {
            "status": "anonymous",
            "friendship_id": None,
            "requested_by": None,
            "can_add_friend": False,
            "can_challenge": False,
        }

    if viewer.id == target_user.id:
        return {
            "status": "self",
            "friendship_id": None,
            "requested_by": None,
            "can_add_friend": False,
            "can_challenge": False,
        }

    friendship = get_friendship_between(viewer, target_user)
    if friendship is None or friendship.status == Friendship.STATUS_DECLINED:
        status_value = "none"
    elif friendship.status == Friendship.STATUS_ACCEPTED:
        status_value = "friends"
    elif friendship.requester_id == viewer.id:
        status_value = "outgoing_request"
    else:
        status_value = "incoming_request"

    return {
        "status": status_value,
        "friendship_id": friendship.id if friendship else None,
        "requested_by": friendship.requester.username if friendship else None,
        "can_add_friend": status_value == "none",
        "can_challenge": status_value == "friends",
    }


def count_user_friends(user: User) -> int:
    return Friendship.objects.filter(
        Q(requester=user) | Q(addressee=user),
        status=Friendship.STATUS_ACCEPTED,
    ).count()


def serialize_friendship_item(friendship: Friendship, viewer: User) -> dict[str, Any]:
    other_user = friendship.addressee if friendship.requester_id == viewer.id else friendship.requester
    return {
        "id": friendship.id,
        "status": friendship.status,
        "created_at": friendship.created_at.isoformat(),
        "responded_at": friendship.responded_at.isoformat() if friendship.responded_at else None,
        "user": serialize_user_card(other_user),
    }


def create_notification(
    *,
    user: User,
    kind: str,
    title: str,
    message: str,
    battle: SustainabilityBattle | None = None,
    friendship: Friendship | None = None,
    data: dict[str, Any] | None = None,
) -> UserNotification:
    return UserNotification.objects.create(
        user=user,
        kind=kind,
        title=title,
        message=message,
        battle=battle,
        friendship=friendship,
        data=data or {},
    )


def serialize_notification(notification: UserNotification) -> dict[str, Any]:
    return {
        "id": notification.id,
        "kind": notification.kind,
        "title": notification.title,
        "message": notification.message,
        "created_at": notification.created_at.isoformat(),
        "read_at": notification.read_at.isoformat() if notification.read_at else None,
        "battle_id": notification.battle_id,
        "friendship_id": notification.friendship_id,
        "data": notification.data or {},
        "is_actionable": notification.kind
        in {
            UserNotification.KIND_FRIEND_REQUEST,
            UserNotification.KIND_BATTLE_INVITE,
        },
    }


def serialize_battle(
    battle: SustainabilityBattle,
    viewer: User,
    *,
    include_questions: bool = False,
) -> dict[str, Any]:
    opponent = battle.opponent if viewer.id == battle.challenger_id else battle.challenger
    is_challenger = viewer.id == battle.challenger_id
    my_score = battle.challenger_score if is_challenger else battle.opponent_score
    opponent_score = battle.opponent_score if is_challenger else battle.challenger_score
    resolved_questions = sum(
        1 for question in battle.questions if isinstance(question, dict) and question.get("resolved")
    )
    current_question_data = None
    if (
        battle.status == SustainabilityBattle.STATUS_ACTIVE
        and 0 <= battle.question_cursor < len(battle.questions)
    ):
        candidate_question = battle.questions[battle.question_cursor]
        if isinstance(candidate_question, dict):
            current_question_data = candidate_question
    current_question = None
    questions_payload: list[dict[str, Any]] = []
    if include_questions:
        questions_payload = build_public_battle_questions(
            battle.questions,
            reveal_correct=battle.status == SustainabilityBattle.STATUS_COMPLETED,
        )
        if (
            battle.status == SustainabilityBattle.STATUS_ACTIVE
            and 0 <= battle.question_cursor < len(questions_payload)
        ):
            current_question = questions_payload[battle.question_cursor]

    _, results = _score_battle_answers(
        battle.questions,
        viewer.id,
        reveal_correct=battle.status == SustainabilityBattle.STATUS_COMPLETED,
    )

    payload: dict[str, Any] = {
        "id": battle.id,
        "status": battle.status,
        "title": battle.title,
        "created_at": battle.created_at.isoformat(),
        "updated_at": battle.updated_at.isoformat(),
        "started_at": battle.started_at.isoformat() if battle.started_at else None,
        "completed_at": battle.completed_at.isoformat() if battle.completed_at else None,
        "question_count": len(battle.questions),
        "resolved_questions": resolved_questions,
        "current_question_index": battle.question_cursor,
        "current_phase": battle.current_phase,
        "current_turn_user_id": battle.current_turn_user_id,
        "current_turn_username": (
            battle.current_turn_user.username if battle.current_turn_user else None
        ),
        "current_question_is_tiebreak": bool(
            current_question_data and current_question_data.get("is_tiebreak")
        ),
        "is_challenger": is_challenger,
        "opponent": serialize_user_card(opponent),
        "my_score": my_score,
        "opponent_score": opponent_score,
        "winner_user_id": battle.winner_id,
        "can_respond_to_invite": (
            battle.status == SustainabilityBattle.STATUS_PENDING
            and battle.opponent_id == viewer.id
        ),
        "is_my_turn": battle.status == SustainabilityBattle.STATUS_ACTIVE
        and battle.current_turn_user_id == viewer.id,
        "can_submit_turn": (
            battle.status == SustainabilityBattle.STATUS_ACTIVE
            and battle.current_turn_user_id == viewer.id
        ),
        "results": results,
    }

    if include_questions:
        payload["questions"] = questions_payload
        payload["current_question"] = current_question

    return payload


def serialize_public_profile(viewer: User, target_user: User) -> dict[str, Any]:
    battles_played = SustainabilityBattle.objects.filter(
        Q(challenger=target_user) | Q(opponent=target_user),
        status=SustainabilityBattle.STATUS_COMPLETED,
    ).count()
    battles_won = SustainabilityBattle.objects.filter(winner=target_user).count()

    return {
        "user": serialize_user_card(target_user),
        "relationship": build_relationship_payload(viewer, target_user),
        "social": {
            "friends_count": count_user_friends(target_user),
            "battles_played": battles_played,
            "battles_won": battles_won,
        },
    }


def build_unique_username(email: str, first_name: str = "", last_name: str = "") -> str:
    candidates = [
        email.split("@")[0] if email else "",
        ".".join(part for part in [first_name.strip(), last_name.strip()] if part),
        first_name.strip(),
        "reuseai",
    ]

    for candidate in candidates:
        base_username = re.sub(r"[^a-z0-9._-]+", "_", candidate.lower()).strip("._-")
        if not base_username:
            continue

        base_username = base_username[:140]
        username = base_username
        suffix = 1

        while User.objects.filter(username__iexact=username).exists():
            suffix_text = f"_{suffix}"
            username = f"{base_username[:150 - len(suffix_text)]}{suffix_text}"
            suffix += 1

        return username

    return f"reuseai_{User.objects.count() + 1}"


def sync_google_user(google_payload: dict[str, object]) -> tuple[User, bool]:
    google_sub = str(google_payload.get("sub") or "").strip()
    email = str(google_payload.get("email") or "").strip().lower()
    email_verified = bool(google_payload.get("email_verified"))
    first_name = str(google_payload.get("given_name") or "").strip()
    last_name = str(google_payload.get("family_name") or "").strip()

    if not google_sub:
        raise ValueError("O Google não retornou um identificador de conta válido.")

    if not email:
        raise ValueError("O Google não retornou um endereço de e-mail válido.")

    if not email_verified:
        raise ValueError("A conta do Google informada ainda não possui e-mail verificado.")

    linked_profile = UserProfile.objects.select_related("user").filter(google_sub=google_sub).first()
    if linked_profile is not None:
        user = linked_profile.user
        created = False
        profile = linked_profile
    else:
        user = User.objects.filter(email__iexact=email).first()
        created = user is None

        if user is None:
            user = User(
                username=build_unique_username(email, first_name, last_name),
                email=email,
                first_name=first_name,
                last_name=last_name,
                is_active=True,
            )
            user.set_unusable_password()
            user.save()
        else:
            if user.email.strip().lower() != email:
                user.email = email
            user.is_active = True
            if first_name and not user.first_name:
                user.first_name = first_name
            if last_name and not user.last_name:
                user.last_name = last_name
            user.save()

        profile = get_or_create_profile(user)
        if profile.google_sub and profile.google_sub != google_sub:
            raise ValueError(
                "Esta conta já está vinculada a outro login do Google. Entre com o método original ou use outro e-mail."
            )
        profile.google_sub = google_sub

    user_updated_fields: list[str] = []
    if user.email.strip().lower() != email:
        user.email = email
        user_updated_fields.append("email")
    if not user.is_active:
        user.is_active = True
        user_updated_fields.append("is_active")
    if first_name and not user.first_name:
        user.first_name = first_name
        user_updated_fields.append("first_name")
    if last_name and not user.last_name:
        user.last_name = last_name
        user_updated_fields.append("last_name")
    if user_updated_fields:
        user.save(update_fields=user_updated_fields)

    profile_updated_fields: list[str] = []
    if profile.google_sub != google_sub:
        profile.google_sub = google_sub
        profile_updated_fields.append("google_sub")
    if not profile.email_verified:
        profile.email_verified = True
        profile_updated_fields.append("email_verified")
    if profile.email_verified_at is None:
        profile.email_verified_at = timezone.now()
        profile_updated_fields.append("email_verified_at")
    if profile_updated_fields:
        profile_updated_fields.append("updated_at")
        profile.save(update_fields=profile_updated_fields)

    return user, created


class RegisterView(APIView):
    permission_classes = [AllowAny]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        try:
            verification_link = send_email_verification(user)
        except Exception as error:
            logger.exception("Falha ao enviar e-mail de verificacao para %s", user.email)
            user.delete()
            return Response(
                {
                    "detail": "Não foi possível enviar o e-mail de verificação. Tente novamente.",
                },
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        return Response(
            {
                "detail": "Conta criada com sucesso. Enviamos um e-mail com o link de ativação para o endereço informado.",
                "verification_email_sent": True,
                "verification_link": (
                    verification_link if settings.EXPOSE_DEBUG_VERIFICATION_LINK else None
                ),
                "email": user.email,
                "user": UserSerializer(user, context={"request": request}).data,
            },
            status=status.HTTP_201_CREATED,
        )


class GoogleAuthView(APIView):
    permission_classes = [AllowAny]
    parser_classes = [FormParser, JSONParser]

    def post(self, request):
        if not settings.GOOGLE_OAUTH_CLIENT_ID:
            return Response(
                {
                    "detail": "O login com Google ainda não foi configurado no servidor.",
                },
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )

        serializer = GoogleAuthSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        credential = serializer.validated_data["credential"]

        try:
            payload = google_id_token.verify_oauth2_token(
                credential,
                GoogleRequest(),
                settings.GOOGLE_OAUTH_CLIENT_ID,
            )
        except ValueError:
            return Response(
                {"detail": "Não foi possível validar a autenticação do Google."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        issuer = str(payload.get("iss") or "")
        if issuer not in {"accounts.google.com", "https://accounts.google.com"}:
            return Response(
                {"detail": "O emissor do token Google é inválido."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user, created = sync_google_user(payload)
        except ValueError as error:
            return Response(
                {"detail": str(error)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        token, _ = Token.objects.get_or_create(user=user)
        return Response(
            {
                "token": token.key,
                "is_new_user": created,
                "user": UserSerializer(user, context={"request": request}).data,
            }
        )


class LoginView(APIView):
    permission_classes = [AllowAny]
    parser_classes = [FormParser, JSONParser]

    def post(self, request):
        identifier = (request.data.get("identifier") or request.data.get("username") or "").strip()
        password = request.data.get("password", "")

        if not identifier or not password:
            return Response(
                {"detail": "Informe usuário ou e-mail e também a senha."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        candidate_user = None
        if "@" in identifier:
            candidate_user = User.objects.filter(email__iexact=identifier).first()
        else:
            candidate_user = User.objects.filter(username__iexact=identifier).first()

        auth_username = candidate_user.username if candidate_user is not None else identifier
        user = authenticate(request, username=auth_username, password=password)

        if candidate_user is not None and not candidate_user.is_active and candidate_user.check_password(password):
            return Response(
                {
                    "detail": "Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada antes de entrar.",
                    "code": "email_not_verified",
                    "email": candidate_user.email,
                },
                status=status.HTTP_403_FORBIDDEN,
            )

        if not user:
            return Response(
                {"detail": "Usuário, e-mail ou senha inválidos."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        token, _ = Token.objects.get_or_create(user=user)
        return Response(
            {
                "token": token.key,
                "user": UserSerializer(user, context={"request": request}).data,
            }
        )


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.auth is not None:
            request.auth.delete()
        else:
            Token.objects.filter(user=request.user).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user, context={"request": request}).data)


class VerifyEmailView(APIView):
    permission_classes = [AllowAny]
    parser_classes = [FormParser, JSONParser]

    def post(self, request):
        return self._verify(request.data.get("uid"), request.data.get("token"))

    def get(self, request):
        return self._verify(request.query_params.get("uid"), request.query_params.get("token"))

    def _verify(self, uid: str | None, token: str | None):
        if not uid or not token:
            return Response(
                {"detail": "Link de verificação inválido ou incompleto."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            user_id = force_str(urlsafe_base64_decode(uid))
            user = User.objects.get(pk=user_id)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            return Response(
                {"detail": "Não foi possível localizar a conta para este link de verificação."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        profile = get_or_create_profile(user)
        if user.is_active and profile.email_verified:
            return Response({"detail": "Este e-mail já foi confirmado anteriormente."})

        if not email_verification_token_generator.check_token(user, token):
            return Response(
                {"detail": "O link de verificação é inválido ou já expirou."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.is_active = True
        user.save(update_fields=["is_active"])
        profile.email_verified = True
        profile.email_verified_at = timezone.now()
        profile.save(update_fields=["email_verified", "email_verified_at", "updated_at"])

        return Response(
            {
                "detail": "E-mail confirmado com sucesso. Sua conta está pronta para uso.",
                "user": UserSerializer(user, context={"request": self.request}).data,
            }
        )


class ResendVerificationView(APIView):
    permission_classes = [AllowAny]
    parser_classes = [FormParser, JSONParser]

    def post(self, request):
        serializer = ResendVerificationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        email = serializer.validated_data["email"].strip().lower()
        user = User.objects.filter(email__iexact=email).first()

        if user is None:
            return Response(
                {"detail": "Se existir uma conta com este e-mail, um novo link de verificação foi enviado."}
            )

        profile = get_or_create_profile(user)
        if user.is_active and profile.email_verified:
            return Response({"detail": "Este e-mail já foi confirmado. Você já pode entrar na plataforma."})

        try:
            send_email_verification(user)
        except Exception:
            logger.exception("Falha ao reenviar e-mail de verificacao para %s", user.email)
            return Response(
                {"detail": "Não foi possível reenviar o e-mail de verificação agora. Tente novamente."},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )
        return Response(
            {"detail": "Enviamos um novo e-mail de verificação para a sua caixa de entrada."}
        )


class UpdateUsernameView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [FormParser, JSONParser]

    def patch(self, request):
        user = request.user
        profile = get_or_create_profile(user)

        if profile.display_name_updated_at is not None:
            elapsed = timezone.now() - profile.display_name_updated_at
            cooldown = timezone.timedelta(hours=72)
            if elapsed < cooldown:
                remaining = cooldown - elapsed
                remaining_hours = int(remaining.total_seconds() // 3600)
                remaining_minutes = int((remaining.total_seconds() % 3600) // 60)
                return Response(
                    {
                        "detail": f"Você só pode alterar o nome de usuário a cada 72 horas. Aguarde mais {remaining_hours}h {remaining_minutes}min.",
                        "cooldown_remaining_seconds": int(remaining.total_seconds()),
                    },
                    status=status.HTTP_429_TOO_MANY_REQUESTS,
                )

        serializer = UpdateUsernameSerializer(data=request.data, context={"user_pk": user.pk})
        serializer.is_valid(raise_exception=True)

        user.username = serializer.validated_data["username"]
        user.save(update_fields=["username"])

        profile.display_name_updated_at = timezone.now()
        profile.save(update_fields=["display_name_updated_at", "updated_at"])

        return Response(UserSerializer(user, context={"request": request}).data)


class UpdateAvatarView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    _ALLOWED_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
    _MAX_SIZE = 5 * 1024 * 1024  # 5 MB

    def put(self, request):
        avatar_file = request.FILES.get("avatar")
        if not avatar_file:
            return Response({"detail": "Envie um arquivo de imagem."}, status=status.HTTP_400_BAD_REQUEST)

        if avatar_file.size > self._MAX_SIZE:
            return Response({"detail": "A imagem deve ter no máximo 5 MB."}, status=status.HTTP_400_BAD_REQUEST)

        if getattr(avatar_file, "content_type", None) not in self._ALLOWED_TYPES:
            return Response(
                {"detail": "Formato de imagem não suportado. Use JPEG, PNG, GIF ou WebP."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        profile = get_or_create_profile(request.user)

        # Delete old backup physical file before overwriting the reference
        if profile.avatar_backup:
            try:
                profile.avatar_backup.delete(save=False)
            except Exception:
                pass

        # Move current avatar → backup (copies the field reference/path)
        profile.avatar_backup = profile.avatar if profile.avatar else None

        # Assign new upload → current (Django saves physical file on profile.save())
        profile.avatar = avatar_file
        profile.save(update_fields=["avatar", "avatar_backup", "updated_at"])

        return Response(UserSerializer(request.user, context={"request": request}).data)

    def delete(self, request):
        profile = get_or_create_profile(request.user)

        if not profile.avatar_backup:
            return Response(
                {"detail": "Não há foto de backup para restaurar."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        current_avatar_name = profile.avatar.name if profile.avatar else None
        backup_name = profile.avatar_backup.name

        # Swap current ↔ backup so the user can alternate without losing the latest upload.
        profile.avatar = backup_name
        profile.avatar_backup = current_avatar_name
        profile.save(update_fields=["avatar", "avatar_backup", "updated_at"])

        return Response(UserSerializer(request.user, context={"request": request}).data)


class RequestPasswordResetView(APIView):
    permission_classes = [AllowAny]
    parser_classes = [FormParser, JSONParser]

    def post(self, request):
        serializer = RequestPasswordResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        email = serializer.validated_data["email"].strip().lower()
        user = User.objects.filter(email__iexact=email, is_active=True).first()

        if user is not None:
            try:
                send_password_reset_email(user)
            except Exception:
                logger.exception("Falha ao enviar e-mail de recuperação de senha para %s", user.email)
                return Response(
                    {"detail": "Não foi possível enviar o e-mail de recuperação. Tente novamente."},
                    status=status.HTTP_500_INTERNAL_SERVER_ERROR,
                )

        return Response(
            {"detail": "Se existir uma conta ativa com este e-mail, enviaremos o link de recuperação em breve."}
        )


class ConfirmPasswordResetView(APIView):
    permission_classes = [AllowAny]
    parser_classes = [FormParser, JSONParser]

    def post(self, request):
        serializer = ConfirmPasswordResetSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        uid = serializer.validated_data["uid"]
        token = serializer.validated_data["token"]
        password = serializer.validated_data["password"]

        try:
            user_id = force_str(urlsafe_base64_decode(uid))
            user = User.objects.get(pk=user_id, is_active=True)
        except (TypeError, ValueError, OverflowError, User.DoesNotExist):
            return Response(
                {"detail": "Link de recuperação inválido ou expirado."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not password_reset_token_generator.check_token(user, token):
            return Response(
                {"detail": "O link de recuperação é inválido ou já expirou."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(password)
        user.save(update_fields=["password"])
        Token.objects.filter(user=user).delete()

        return Response({"detail": "Senha atualizada com sucesso. Você já pode entrar com a nova senha."})


class GameOverviewView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        ranked_profiles, week_start, week_end = build_ranked_profiles()
        leaderboard = [
            serialize_leaderboard_entry(profile, rank)
            for rank, profile in enumerate(ranked_profiles[:10], start=1)
        ]

        response: dict[str, Any] = {
            "leaderboard": leaderboard,
            "period": {
                "label": "Semanal",
                "week_start": week_start.isoformat(),
                "week_end": week_end.isoformat(),
            },
            "community": {
                "players": len(ranked_profiles),
                "total_xp": sum(profile.xp_total for profile in ranked_profiles),
                "total_analyses": sum(profile.total_analyses for profile in ranked_profiles),
            },
            "missions_preview": [
                {
                    "key": mission["key"],
                    "title": mission["title"],
                    "description": mission["description"],
                    "target": mission["target"],
                    "xp_reward": mission["xp_reward"],
                }
                for mission in build_missions_state(request.user)
            ]
            if request.user.is_authenticated
            else [
                {
                    "key": "week_analyses_5",
                    "title": "Ritmo Verde",
                    "description": "Conclua 5 análises com confiança nesta semana.",
                    "target": 5,
                    "xp_reward": 25,
                },
                {
                    "key": "week_materials_3",
                    "title": "Explorador Circular",
                    "description": "Descubra 3 materiais diferentes nesta semana.",
                    "target": 3,
                    "xp_reward": 30,
                },
            ],
        }

        if request.user.is_authenticated:
            profile = get_or_create_profile(request.user)
            rank_position = next(
                (
                    rank
                    for rank, ranked_profile in enumerate(ranked_profiles, start=1)
                    if ranked_profile.user_id == request.user.id
                ),
                None,
            )
            response["me"] = {
                "user_id": request.user.id,
                "username": request.user.username,
                "display_name": build_user_display_name(request.user),
                "avatar_url": build_avatar_url(request.user, request),
                "rank": rank_position,
                "profile": build_game_profile_summary(profile),
                "missions": build_missions_state(request.user),
                "recent_events": build_recent_events(request.user),
            }

        return Response(response)


class PublicProfileView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, username: str):
        target_user = User.objects.filter(username__iexact=username).first()
        if target_user is None:
            return Response(
                {"detail": "Não encontramos este usuário."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(serialize_public_profile(request.user, target_user))


class SocialOverviewView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        friendships = list(
            Friendship.objects.select_related("requester", "addressee")
            .filter(Q(requester=request.user) | Q(addressee=request.user))
            .order_by("-created_at")
        )
        friends = [
            serialize_friendship_item(friendship, request.user)
            for friendship in friendships
            if friendship.status == Friendship.STATUS_ACCEPTED
        ]
        incoming_requests = [
            {
                "id": friendship.id,
                "created_at": friendship.created_at.isoformat(),
                "user": serialize_user_card(friendship.requester),
            }
            for friendship in friendships
            if friendship.status == Friendship.STATUS_PENDING
            and friendship.addressee_id == request.user.id
        ]
        outgoing_requests = [
            {
                "id": friendship.id,
                "created_at": friendship.created_at.isoformat(),
                "user": serialize_user_card(friendship.addressee),
            }
            for friendship in friendships
            if friendship.status == Friendship.STATUS_PENDING
            and friendship.requester_id == request.user.id
        ]

        battles = list(
            SustainabilityBattle.objects.select_related(
                "challenger",
                "opponent",
                "winner",
                "current_turn_user",
            )
            .filter(Q(challenger=request.user) | Q(opponent=request.user))
            .order_by("-created_at")
        )
        response = {
            "friends": friends,
            "incoming_requests": incoming_requests,
            "outgoing_requests": outgoing_requests,
            "battles": {
                "pending_received": [],
                "pending_sent": [],
                "active": [],
                "completed": [],
            },
        }

        for battle in battles:
            serialized = serialize_battle(battle, request.user)
            if battle.status == SustainabilityBattle.STATUS_PENDING:
                key = (
                    "pending_sent"
                    if battle.challenger_id == request.user.id
                    else "pending_received"
                )
                response["battles"][key].append(serialized)
            elif battle.status == SustainabilityBattle.STATUS_ACTIVE:
                response["battles"]["active"].append(serialized)
            elif battle.status == SustainabilityBattle.STATUS_COMPLETED:
                response["battles"]["completed"].append(serialized)

        response["battles"]["completed"] = response["battles"]["completed"][:8]
        return Response(response)


class NotificationsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        notifications = list(
            request.user.notifications.select_related("battle", "friendship")
            .exclude(
                kind=UserNotification.KIND_FRIEND_REQUEST,
                friendship__status__in=[
                    Friendship.STATUS_ACCEPTED,
                    Friendship.STATUS_DECLINED,
                ],
            )
            .exclude(
                kind=UserNotification.KIND_BATTLE_INVITE,
                battle__status__in=[
                    SustainabilityBattle.STATUS_ACTIVE,
                    SustainabilityBattle.STATUS_DECLINED,
                    SustainabilityBattle.STATUS_COMPLETED,
                    SustainabilityBattle.STATUS_CANCELLED,
                ],
            )
            .exclude(
                kind__in=TRANSIENT_NOTIFICATION_KINDS,
                read_at__isnull=False,
            )[:20]
        )
        unread_count = sum(1 for notification in notifications if notification.read_at is None)
        return Response(
            {
                "unread_count": unread_count,
                "notifications": [
                    serialize_notification(notification)
                    for notification in notifications
                ],
            }
        )


class NotificationReadView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [FormParser, JSONParser]

    def post(self, request):
        ids = request.data.get("ids")
        queryset = request.user.notifications.filter(read_at__isnull=True)
        if isinstance(ids, list):
            parsed_ids = [int(item) for item in ids if str(item).isdigit()]
            queryset = queryset.filter(id__in=parsed_ids)

        notifications_to_mark = list(queryset)
        if not notifications_to_mark:
            return Response({"marked_count": 0})

        now = timezone.now()
        ids_to_mark = [notification.id for notification in notifications_to_mark]
        marked_count = request.user.notifications.filter(id__in=ids_to_mark).update(read_at=now)
        return Response({"marked_count": marked_count})


class SocialUserSearchView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        query = str(request.query_params.get("q") or "").strip()
        if not query:
            return Response({"results": []})

        results = list(
            User.objects.filter(
                Q(username__icontains=query)
                | Q(first_name__icontains=query)
                | Q(last_name__icontains=query)
            )
            .exclude(pk=request.user.id)
            .order_by("username")[:8]
        )

        return Response(
            {
                "results": [
                    {
                        "user": serialize_user_card(user),
                        "relationship": build_relationship_payload(request.user, user),
                    }
                    for user in results
                ]
            }
        )


class FriendRequestCreateView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [FormParser, JSONParser]

    def post(self, request):
        username = str(request.data.get("username") or "").strip()
        if not username:
            return Response(
                {"detail": "Informe o username do usuário."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target_user = User.objects.filter(username__iexact=username).first()
        if target_user is None:
            return Response(
                {"detail": "Não encontramos este usuário para adicionar."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if target_user.id == request.user.id:
            return Response(
                {"detail": "Você não pode adicionar a si mesmo."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        friendship = get_friendship_between(request.user, target_user)
        now = timezone.now()

        if friendship is None:
            friendship = Friendship.objects.create(
                requester=request.user,
                addressee=target_user,
            )
            create_notification(
                user=target_user,
                kind=UserNotification.KIND_FRIEND_REQUEST,
                title="Novo pedido de amizade",
                message=f"@{request.user.username} quer adicionar você como amigo.",
                friendship=friendship,
                data={
                    "friendship_id": friendship.id,
                    "requester_username": request.user.username,
                },
            )
            return Response(
                {
                    "detail": f"Pedido de amizade enviado para @{target_user.username}.",
                    "relationship": build_relationship_payload(request.user, target_user),
                    "friendship": serialize_friendship_item(friendship, request.user),
                },
                status=status.HTTP_201_CREATED,
            )

        if friendship.status == Friendship.STATUS_ACCEPTED:
            return Response(
                {"detail": "Vocês já são amigos."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if (
            friendship.status == Friendship.STATUS_PENDING
            and friendship.requester_id == request.user.id
        ):
            return Response(
                {"detail": "O pedido de amizade já foi enviado."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if (
            friendship.status == Friendship.STATUS_PENDING
            and friendship.addressee_id == request.user.id
        ):
            friendship.status = Friendship.STATUS_ACCEPTED
            friendship.responded_at = now
            friendship.save(update_fields=["status", "responded_at"])
            create_notification(
                user=target_user,
                kind=UserNotification.KIND_FRIEND_ACCEPTED,
                title="Pedido de amizade aceito",
                message=f"@{request.user.username} aceitou sua amizade.",
                friendship=friendship,
                data={"friendship_id": friendship.id},
            )
            return Response(
                {
                    "detail": f"Agora você e @{target_user.username} são amigos.",
                    "relationship": build_relationship_payload(request.user, target_user),
                    "friendship": serialize_friendship_item(friendship, request.user),
                }
            )

        friendship.requester = request.user
        friendship.addressee = target_user
        friendship.status = Friendship.STATUS_PENDING
        friendship.responded_at = None
        friendship.created_at = now
        friendship.save(
            update_fields=[
                "requester",
                "addressee",
                "status",
                "responded_at",
                "created_at",
            ]
        )
        create_notification(
            user=target_user,
            kind=UserNotification.KIND_FRIEND_REQUEST,
            title="Novo pedido de amizade",
            message=f"@{request.user.username} reenviou um pedido de amizade.",
            friendship=friendship,
            data={
                "friendship_id": friendship.id,
                "requester_username": request.user.username,
            },
        )

        return Response(
            {
                "detail": f"Pedido de amizade reenviado para @{target_user.username}.",
                "relationship": build_relationship_payload(request.user, target_user),
                "friendship": serialize_friendship_item(friendship, request.user),
            }
        )


class FriendRequestActionView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [FormParser, JSONParser]

    def post(self, request, request_id: int):
        action = str(request.data.get("action") or "").strip().lower()
        if action not in {"accept", "decline"}:
            return Response(
                {"detail": "Acao invalida para o pedido de amizade."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        friendship = (
            Friendship.objects.select_related("requester", "addressee")
            .filter(id=request_id, status=Friendship.STATUS_PENDING)
            .first()
        )
        if friendship is None:
            return Response(
                {"detail": "Não encontramos este pedido pendente."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if friendship.addressee_id != request.user.id:
            return Response(
                {"detail": "Você não pode responder a este pedido."},
                status=status.HTTP_403_FORBIDDEN,
            )

        friendship.status = (
            Friendship.STATUS_ACCEPTED
            if action == "accept"
            else Friendship.STATUS_DECLINED
        )
        friendship.responded_at = timezone.now()
        friendship.save(update_fields=["status", "responded_at"])

        if action == "accept":
            create_notification(
                user=friendship.requester,
                kind=UserNotification.KIND_FRIEND_ACCEPTED,
                title="Pedido de amizade aceito",
                message=f"@{request.user.username} aceitou sua amizade.",
                friendship=friendship,
                data={"friendship_id": friendship.id},
            )

        return Response(
            {
                "detail": (
                    f"Pedido aceito. Agora você e @{friendship.requester.username} são amigos."
                    if action == "accept"
                    else "Pedido recusado."
                ),
                "relationship": build_relationship_payload(request.user, friendship.requester),
            }
        )


class BattleCreateView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [FormParser, JSONParser]

    def post(self, request):
        opponent_username = str(request.data.get("username") or "").strip()
        if not opponent_username:
            return Response(
                {"detail": "Informe o username do amigo desafiado."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        opponent = User.objects.filter(username__iexact=opponent_username).first()
        if opponent is None:
            return Response(
                {"detail": "Não encontramos este usuário para a batalha."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if opponent.id == request.user.id:
            return Response(
                {"detail": "Você não pode desafiar a si mesmo."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        friendship = get_friendship_between(request.user, opponent)
        if friendship is None or friendship.status != Friendship.STATUS_ACCEPTED:
            return Response(
                {"detail": "As batalhas só podem ser enviadas para amigos aceitos."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        existing_open_battle = SustainabilityBattle.objects.filter(
            Q(challenger=request.user, opponent=opponent)
            | Q(challenger=opponent, opponent=request.user),
            status__in=[
                SustainabilityBattle.STATUS_PENDING,
                SustainabilityBattle.STATUS_ACTIVE,
            ],
        ).first()
        if existing_open_battle is not None:
            return Response(
                {"detail": "Já existe uma batalha pendente ou ativa entre vocês."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        battle = SustainabilityBattle.objects.create(
            challenger=request.user,
            opponent=opponent,
            status=SustainabilityBattle.STATUS_PENDING,
            title=f"{request.user.username} vs {opponent.username}",
            questions=build_battle_questions(request.user, opponent),
        )
        create_notification(
            user=opponent,
            kind=UserNotification.KIND_BATTLE_INVITE,
            title="Novo convite de batalha",
            message=f"@{request.user.username} desafiou você para um quiz sustentável.",
            battle=battle,
            data={"battle_id": battle.id, "challenger_username": request.user.username},
        )
        return Response(
            {
                "detail": f"Desafio enviado para @{opponent.username}.",
                "battle": serialize_battle(battle, request.user),
            },
            status=status.HTTP_201_CREATED,
        )


class BattleActionView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [FormParser, JSONParser]

    def post(self, request, battle_id: int):
        action = str(request.data.get("action") or "").strip().lower()
        if action not in {"accept", "decline"}:
            return Response(
                {"detail": "Ação inválida para a batalha."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        battle = (
            SustainabilityBattle.objects.select_related(
                "challenger",
                "opponent",
                "winner",
                "current_turn_user",
            )
            .filter(id=battle_id, status=SustainabilityBattle.STATUS_PENDING)
            .first()
        )
        if battle is None:
            return Response(
                {"detail": "Não encontramos esta batalha pendente."},
                status=status.HTTP_404_NOT_FOUND,
            )
        if battle.opponent_id != request.user.id:
            return Response(
                {"detail": "Somente o amigo desafiado pode responder."},
                status=status.HTTP_403_FORBIDDEN,
            )

        battle.status = (
            SustainabilityBattle.STATUS_ACTIVE
            if action == "accept"
            else SustainabilityBattle.STATUS_DECLINED
        )
        update_fields = ["status", "updated_at"]
        if action == "accept":
            if not battle.questions:
                battle.questions = build_battle_questions(battle.challenger, battle.opponent)
            battle.started_at = timezone.now()
            battle.current_phase = SustainabilityBattle.PHASE_PRIMARY
            first_question = battle.questions[0] if battle.questions else None
            if isinstance(first_question, dict):
                first_turn_user_id = int(first_question["turn_user_id"])
                battle.current_turn_user = (
                    battle.challenger
                    if first_turn_user_id == battle.challenger_id
                    else battle.opponent
                )
            update_fields.extend(["questions", "started_at", "current_phase", "current_turn_user"])
            create_notification(
                user=battle.challenger,
                kind=UserNotification.KIND_BATTLE_ACCEPTED,
                title="Batalha aceita",
                message=(
                    f"@{request.user.username} aceitou sua batalha. "
                    "O quiz compartilhado já pode começar."
                ),
                battle=battle,
                data={"battle_id": battle.id},
            )
            if battle.current_turn_user_id == battle.challenger_id:
                create_notification(
                    user=battle.challenger,
                    kind=UserNotification.KIND_BATTLE_TURN,
                    title="Sua vez na batalha",
                    message=(
                        f"A batalha com @{battle.opponent.username} começou. "
                        "A primeira pergunta já está com você."
                    ),
                    battle=battle,
                    data={"battle_id": battle.id, "question_index": 0},
                )
        else:
            create_notification(
                user=battle.challenger,
                kind=UserNotification.KIND_BATTLE_DECLINED,
                title="Batalha recusada",
                message=f"@{request.user.username} recusou seu convite de batalha.",
                battle=battle,
                data={"battle_id": battle.id},
            )
        battle.save(update_fields=update_fields)

        return Response(
            {
                "detail": (
                    "Batalha aceita. O quiz compartilhado já está liberado."
                    if action == "accept"
                    else "Batalha recusada."
                ),
                "battle": serialize_battle(
                    battle,
                    request.user,
                    include_questions=action == "accept",
                ),
            }
        )


class BattleDetailView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, battle_id: int):
        battle = (
            SustainabilityBattle.objects.select_related(
                "challenger",
                "opponent",
                "winner",
                "current_turn_user",
            )
            .filter(id=battle_id)
            .filter(Q(challenger=request.user) | Q(opponent=request.user))
            .first()
        )
        if battle is None:
            return Response(
                {"detail": "Não encontramos esta batalha para o usuário atual."},
                status=status.HTTP_404_NOT_FOUND,
            )

        return Response(
            {
                "battle": serialize_battle(
                    battle,
                    request.user,
                    include_questions=battle.status
                    in {
                        SustainabilityBattle.STATUS_ACTIVE,
                        SustainabilityBattle.STATUS_COMPLETED,
                    },
                )
            }
        )


class BattleSubmitView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser]

    @transaction.atomic
    def post(self, request, battle_id: int):
        battle = (
            SustainabilityBattle.objects.select_for_update()
            .select_related("challenger", "opponent", "winner", "current_turn_user")
            .filter(id=battle_id)
            .filter(Q(challenger=request.user) | Q(opponent=request.user))
            .first()
        )
        if battle is None:
            return Response(
                {"detail": "Não encontramos esta batalha para responder."},
                status=status.HTTP_404_NOT_FOUND,
            )

        question_id = str(request.data.get("question_id") or "").strip()
        option_id = str(request.data.get("option_id") or "").strip()

        try:
            payload = submit_battle_answers(
                battle=battle,
                user=request.user,
                question_id=question_id,
                option_id=option_id,
            )
        except ValueError as error:
            return Response(
                {"detail": str(error)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        refreshed_battle = SustainabilityBattle.objects.select_related(
            "challenger",
            "opponent",
            "winner",
            "current_turn_user",
        ).get(id=battle.id)
        payload["battle"] = serialize_battle(
            refreshed_battle,
            request.user,
            include_questions=True,
        )
        payload["profile"] = build_game_profile_summary(get_or_create_profile(request.user))
        return Response(payload)


class SubmitQuizView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [JSONParser]

    def post(self, request):
        analysis_id = request.data.get("analysis_id")
        raw_answers = request.data.get("answers")

        if analysis_id in (None, ""):
            return Response(
                {"detail": "Informe a análise relacionada ao quiz."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        answers: dict[str, str] = {}
        if isinstance(raw_answers, dict):
            answers = {
                str(key): str(value)
                for key, value in raw_answers.items()
                if key not in (None, "") and value not in (None, "")
            }
        elif isinstance(raw_answers, list):
            for item in raw_answers:
                if not isinstance(item, dict):
                    continue
                question_id = item.get("question_id")
                option_id = item.get("option_id")
                if question_id in (None, "") or option_id in (None, ""):
                    continue
                answers[str(question_id)] = str(option_id)

        try:
            payload = submit_quiz_answers(
                user=request.user,
                analysis_id=int(analysis_id),
                answers=answers,
            )
        except ValueError as error:
            return Response(
                {"detail": str(error)},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(payload)
