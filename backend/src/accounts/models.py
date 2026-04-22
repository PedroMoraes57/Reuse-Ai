from __future__ import annotations

from django.contrib.auth.models import User
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver


class UserProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    avatar = models.ImageField(upload_to="avatars/", blank=True, null=True)
    avatar_backup = models.ImageField(upload_to="avatars/", blank=True, null=True)
    google_sub = models.CharField(max_length=255, blank=True, null=True, unique=True)
    email_verified = models.BooleanField(default=False)
    email_verified_at = models.DateTimeField(blank=True, null=True)
    xp_total = models.PositiveIntegerField(default=0)
    level = models.PositiveIntegerField(default=1)
    total_analyses = models.PositiveIntegerField(default=0)
    unique_materials = models.PositiveIntegerField(default=0)
    current_streak = models.PositiveIntegerField(default=0)
    longest_streak = models.PositiveIntegerField(default=0)
    analysis_xp_total = models.PositiveIntegerField(default=0)
    quiz_xp_total = models.PositiveIntegerField(default=0)
    display_name_updated_at = models.DateTimeField(blank=True, null=True)
    last_activity_on = models.DateField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"UserProfile<{self.user.username}>"


class AnalysisRecord(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="analysis_records")
    class_id = models.CharField(max_length=120, blank=True)
    item_name = models.CharField(max_length=255)
    material = models.CharField(max_length=120, blank=True)
    disposal_stream = models.CharField(max_length=120, blank=True)
    recommendation = models.TextField(blank=True)
    dropoff = models.TextField(blank=True)
    preparation = models.TextField(blank=True)
    hazardous = models.BooleanField(default=False)
    reusable = models.BooleanField(default=False)
    uncertain_prediction = models.BooleanField(default=False)
    confidence = models.FloatField(default=0.0)
    xp_awarded = models.PositiveIntegerField(default=0)
    quiz_questions = models.JSONField(default=list, blank=True)
    quiz_completed = models.BooleanField(default=False)
    quiz_score = models.PositiveSmallIntegerField(default=0)
    quiz_xp_awarded = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"AnalysisRecord<{self.user.username}:{self.item_name}>"


class XpEvent(models.Model):
    SOURCE_ANALYSIS = "analysis"
    SOURCE_DAILY_BONUS = "daily_bonus"
    SOURCE_DISCOVERY = "discovery_bonus"
    SOURCE_MISSION = "mission"
    SOURCE_QUIZ = "quiz"
    SOURCE_BATTLE = "battle"

    SOURCE_CHOICES = [
        (SOURCE_ANALYSIS, "Análise"),
        (SOURCE_DAILY_BONUS, "Bônus diário"),
        (SOURCE_DISCOVERY, "Descoberta"),
        (SOURCE_MISSION, "Missão"),
        (SOURCE_QUIZ, "Quiz"),
        (SOURCE_BATTLE, "Batalha"),
    ]

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="xp_events")
    analysis = models.ForeignKey(
        AnalysisRecord,
        on_delete=models.SET_NULL,
        related_name="xp_events",
        blank=True,
        null=True,
    )
    source = models.CharField(max_length=40, choices=SOURCE_CHOICES)
    amount = models.PositiveIntegerField()
    title = models.CharField(max_length=140)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"XpEvent<{self.user.username}:{self.source}:{self.amount}>"


class MissionClaim(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="mission_claims")
    mission_key = models.CharField(max_length=80)
    week_start = models.DateField()
    claimed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-claimed_at",)
        constraints = [
            models.UniqueConstraint(
                fields=("user", "mission_key", "week_start"),
                name="unique_mission_claim_per_week",
            )
        ]

    def __str__(self) -> str:
        return f"MissionClaim<{self.user.username}:{self.mission_key}:{self.week_start}>"


class Friendship(models.Model):
    STATUS_PENDING = "pending"
    STATUS_ACCEPTED = "accepted"
    STATUS_DECLINED = "declined"

    STATUS_CHOICES = [
        (STATUS_PENDING, "Pendente"),
        (STATUS_ACCEPTED, "Aceita"),
        (STATUS_DECLINED, "Recusada"),
    ]

    requester = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="sent_friend_requests",
    )
    addressee = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="received_friend_requests",
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    created_at = models.DateTimeField(auto_now_add=True)
    responded_at = models.DateTimeField(blank=True, null=True)

    class Meta:
        ordering = ("-created_at",)
        constraints = [
            models.UniqueConstraint(
                fields=("requester", "addressee"),
                name="unique_friend_request_direction",
            ),
            models.CheckConstraint(
                condition=~models.Q(requester=models.F("addressee")),
                name="friendship_no_self_request",
            ),
        ]

    def __str__(self) -> str:
        return (
            f"Friendship<{self.requester.username}->{self.addressee.username}:{self.status}>"
        )


class SustainabilityBattle(models.Model):
    STATUS_PENDING = "pending"
    STATUS_ACTIVE = "active"
    STATUS_DECLINED = "declined"
    STATUS_COMPLETED = "completed"
    STATUS_CANCELLED = "cancelled"

    STATUS_CHOICES = [
        (STATUS_PENDING, "Pendente"),
        (STATUS_ACTIVE, "Ativa"),
        (STATUS_DECLINED, "Recusada"),
        (STATUS_COMPLETED, "Concluida"),
        (STATUS_CANCELLED, "Cancelada"),
    ]

    PHASE_PRIMARY = "primary"
    PHASE_STEAL = "steal"
    PHASE_COMPLETED = "completed"

    PHASE_CHOICES = [
        (PHASE_PRIMARY, "Resposta principal"),
        (PHASE_STEAL, "Resposta de roubo"),
        (PHASE_COMPLETED, "Concluida"),
    ]

    challenger = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="sent_battles",
    )
    opponent = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="received_battles",
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default=STATUS_PENDING)
    title = models.CharField(max_length=160, default="Desafio Verde")
    questions = models.JSONField(default=list, blank=True)
    challenger_answers = models.JSONField(default=dict, blank=True)
    opponent_answers = models.JSONField(default=dict, blank=True)
    challenger_score = models.PositiveSmallIntegerField(default=0)
    opponent_score = models.PositiveSmallIntegerField(default=0)
    question_cursor = models.PositiveSmallIntegerField(default=0)
    current_phase = models.CharField(
        max_length=20,
        choices=PHASE_CHOICES,
        default=PHASE_PRIMARY,
    )
    current_turn_user = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        related_name="current_turn_battles",
        blank=True,
        null=True,
    )
    challenger_completed_at = models.DateTimeField(blank=True, null=True)
    opponent_completed_at = models.DateTimeField(blank=True, null=True)
    started_at = models.DateTimeField(blank=True, null=True)
    completed_at = models.DateTimeField(blank=True, null=True)
    winner = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        related_name="won_battles",
        blank=True,
        null=True,
    )
    xp_awarded = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)
        constraints = [
            models.CheckConstraint(
                condition=~models.Q(challenger=models.F("opponent")),
                name="battle_no_self_challenge",
            ),
        ]

    def __str__(self) -> str:
        return (
            f"SustainabilityBattle<{self.challenger.username} vs {self.opponent.username}:{self.status}>"
        )


class UserNotification(models.Model):
    KIND_FRIEND_REQUEST = "friend_request"
    KIND_FRIEND_ACCEPTED = "friend_accepted"
    KIND_BATTLE_INVITE = "battle_invite"
    KIND_BATTLE_ACCEPTED = "battle_accepted"
    KIND_BATTLE_DECLINED = "battle_declined"
    KIND_BATTLE_TURN = "battle_turn"
    KIND_BATTLE_STEAL = "battle_steal"
    KIND_BATTLE_COMPLETED = "battle_completed"

    KIND_CHOICES = [
        (KIND_FRIEND_REQUEST, "Pedido de amizade"),
        (KIND_FRIEND_ACCEPTED, "Amizade aceita"),
        (KIND_BATTLE_INVITE, "Convite de batalha"),
        (KIND_BATTLE_ACCEPTED, "Batalha aceita"),
        (KIND_BATTLE_DECLINED, "Batalha recusada"),
        (KIND_BATTLE_TURN, "Seu turno"),
        (KIND_BATTLE_STEAL, "Chance de roubar pontos"),
        (KIND_BATTLE_COMPLETED, "Batalha concluida"),
    ]

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="notifications",
    )
    friendship = models.ForeignKey(
        Friendship,
        on_delete=models.CASCADE,
        related_name="notifications",
        blank=True,
        null=True,
    )
    battle = models.ForeignKey(
        SustainabilityBattle,
        on_delete=models.CASCADE,
        related_name="notifications",
        blank=True,
        null=True,
    )
    kind = models.CharField(max_length=40, choices=KIND_CHOICES)
    title = models.CharField(max_length=160)
    message = models.TextField(blank=True)
    data = models.JSONField(default=dict, blank=True)
    read_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)

    def __str__(self) -> str:
        return f"UserNotification<{self.user.username}:{self.kind}>"


class AssistantChatSession(models.Model):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="assistant_chat_sessions",
    )
    title = models.CharField(max_length=160, blank=True)
    last_message_preview = models.CharField(max_length=240, blank=True)
    started_from_route = models.CharField(max_length=80, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    closed_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-updated_at",)

    def __str__(self) -> str:
        status = "closed" if self.closed_at else "active"
        return f"AssistantChatSession<{self.user.username}:{self.id}:{status}>"


class AssistantChatMessage(models.Model):
    ROLE_USER = "user"
    ROLE_ASSISTANT = "assistant"

    ROLE_CHOICES = [
        (ROLE_USER, "Usuário"),
        (ROLE_ASSISTANT, "Assistente"),
    ]

    session = models.ForeignKey(
        AssistantChatSession,
        on_delete=models.CASCADE,
        related_name="messages",
    )
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    text = models.TextField()
    response_type = models.CharField(max_length=40, blank=True)
    action = models.TextField(blank=True)
    alert = models.TextField(blank=True)
    analysis_warning = models.TextField(blank=True)
    quick_replies = models.JSONField(default=list, blank=True)
    message_metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("created_at", "id")

    def __str__(self) -> str:
        return f"AssistantChatMessage<{self.session_id}:{self.role}>"


def get_or_create_profile(user: User) -> UserProfile:
    profile, _ = UserProfile.objects.get_or_create(
        user=user,
        defaults={"email_verified": user.is_active},
    )
    return profile


@receiver(post_save, sender=User)
def ensure_user_profile(sender, instance: User, created: bool, **kwargs) -> None:
    if created:
        UserProfile.objects.create(user=instance, email_verified=instance.is_active)
        return

    UserProfile.objects.get_or_create(
        user=instance,
        defaults={"email_verified": instance.is_active},
    )
