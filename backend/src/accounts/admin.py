from django.contrib import admin
from .models import (
    AnalysisRecord,
    Friendship,
    MissionClaim,
    SustainabilityBattle,
    UserNotification,
    UserProfile,
    XpEvent,
)


@admin.register(UserProfile)
class UserProfileAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "xp_total",
        "level",
        "total_analyses",
        "current_streak",
        "email_verified",
        "email_verified_at",
        "created_at",
    )
    search_fields = ("user__username", "user__email")


@admin.register(AnalysisRecord)
class AnalysisRecordAdmin(admin.ModelAdmin):
    list_display = (
        "user",
        "item_name",
        "material",
        "xp_awarded",
        "quiz_completed",
        "quiz_xp_awarded",
        "created_at",
    )
    list_filter = ("quiz_completed", "uncertain_prediction", "hazardous", "reusable")
    search_fields = ("user__username", "item_name", "material", "class_id")


@admin.register(XpEvent)
class XpEventAdmin(admin.ModelAdmin):
    list_display = ("user", "source", "amount", "title", "created_at")
    list_filter = ("source",)
    search_fields = ("user__username", "title")


@admin.register(MissionClaim)
class MissionClaimAdmin(admin.ModelAdmin):
    list_display = ("user", "mission_key", "week_start", "claimed_at")
    search_fields = ("user__username", "mission_key")


@admin.register(Friendship)
class FriendshipAdmin(admin.ModelAdmin):
    list_display = ("requester", "addressee", "status", "created_at", "responded_at")
    list_filter = ("status",)
    search_fields = ("requester__username", "addressee__username")


@admin.register(SustainabilityBattle)
class SustainabilityBattleAdmin(admin.ModelAdmin):
    list_display = (
        "challenger",
        "opponent",
        "status",
        "challenger_score",
        "opponent_score",
        "winner",
        "created_at",
    )
    list_filter = ("status", "xp_awarded")
    search_fields = ("challenger__username", "opponent__username", "title")


@admin.register(UserNotification)
class UserNotificationAdmin(admin.ModelAdmin):
    list_display = ("user", "kind", "title", "read_at", "created_at")
    list_filter = ("kind", "read_at")
    search_fields = ("user__username", "title", "message")
