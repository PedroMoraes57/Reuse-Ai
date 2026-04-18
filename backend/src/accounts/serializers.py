from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

from .gamification import build_game_profile_summary
from .models import UserProfile, get_or_create_profile


class UserSerializer(serializers.ModelSerializer):
    full_name = serializers.SerializerMethodField()
    avatar_url = serializers.SerializerMethodField()
    avatar_backup_url = serializers.SerializerMethodField()
    email_verified = serializers.SerializerMethodField()
    game_profile = serializers.SerializerMethodField()
    display_name_updated_at = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "full_name",
            "avatar_url",
            "avatar_backup_url",
            "email_verified",
            "game_profile",
            "display_name_updated_at",
        ]

    def get_full_name(self, obj: User) -> str:
        return obj.get_full_name().strip()

    def get_avatar_url(self, obj: User) -> str | None:
        profile = get_or_create_profile(obj)
        if not profile.avatar:
            return None
        return profile.avatar.url

    def get_avatar_backup_url(self, obj: User) -> str | None:
        profile = get_or_create_profile(obj)
        if not profile.avatar_backup:
            return None
        return profile.avatar_backup.url

    def get_email_verified(self, obj: User) -> bool:
        profile = get_or_create_profile(obj)
        return bool(profile.email_verified)

    def get_game_profile(self, obj: User) -> dict[str, object]:
        profile = get_or_create_profile(obj)
        return build_game_profile_summary(profile)

    def get_display_name_updated_at(self, obj: User) -> str | None:
        profile = get_or_create_profile(obj)
        if profile.display_name_updated_at is None:
            return None
        return profile.display_name_updated_at.isoformat()


class RegisterSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(required=True)
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    password_confirmation = serializers.CharField(write_only=True, trim_whitespace=False)
    avatar = serializers.ImageField(write_only=True, required=False, allow_null=True)

    class Meta:
        model = User
        fields = [
            "username",
            "email",
            "first_name",
            "last_name",
            "password",
            "password_confirmation",
            "avatar",
        ]

    def validate_username(self, value: str) -> str:
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("Este nome de usuário já está em uso.")
        return value

    def validate_email(self, value: str) -> str:
        normalized_email = value.strip().lower()
        if User.objects.filter(email__iexact=normalized_email).exists():
            raise serializers.ValidationError("Este e-mail já está vinculado a outra conta.")
        return normalized_email

    def validate(self, attrs):
        password = attrs.get("password", "")
        password_confirmation = attrs.get("password_confirmation", "")

        if password != password_confirmation:
            raise serializers.ValidationError(
                {"password_confirmation": "As senhas informadas não coincidem."}
            )

        candidate_user = User(
            username=attrs.get("username", ""),
            email=attrs.get("email", ""),
            first_name=attrs.get("first_name", ""),
            last_name=attrs.get("last_name", ""),
        )
        try:
            validate_password(password=password, user=candidate_user)
        except DjangoValidationError as error:
            raise serializers.ValidationError({"password": list(error.messages)}) from error

        return attrs

    def create(self, validated_data):
        avatar = validated_data.pop("avatar", None)
        validated_data.pop("password_confirmation", None)
        password = validated_data.pop("password")
        user = User(**validated_data)
        user.email = user.email.strip().lower()
        user.is_active = False
        user.set_password(password)
        user.save()

        profile = get_or_create_profile(user)
        if avatar is not None:
            profile.avatar = avatar
            profile.save()

        return user


class ResendVerificationSerializer(serializers.Serializer):
    email = serializers.EmailField()


class GoogleAuthSerializer(serializers.Serializer):
    credential = serializers.CharField(trim_whitespace=True)


class UpdateUsernameSerializer(serializers.Serializer):
    username = serializers.CharField(min_length=3, max_length=150, trim_whitespace=True)

    def validate_username(self, value: str) -> str:
        import re
        stripped = value.strip()
        if not re.match(r'^[a-zA-Z0-9._-]+$', stripped):
            raise serializers.ValidationError(
                "O nome de usuário só pode conter letras, números, pontos, hifens e underscores."
            )
        if User.objects.filter(username__iexact=stripped).exclude(pk=self.context.get('user_pk')).exists():
            raise serializers.ValidationError("Este nome de usuário já está em uso.")
        return stripped


class RequestPasswordResetSerializer(serializers.Serializer):
    email = serializers.EmailField()


class ConfirmPasswordResetSerializer(serializers.Serializer):
    uid = serializers.CharField()
    token = serializers.CharField()
    password = serializers.CharField(write_only=True, trim_whitespace=False)
    password_confirmation = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate(self, attrs):
        if attrs["password"] != attrs["password_confirmation"]:
            raise serializers.ValidationError(
                {"password_confirmation": "As senhas informadas não coincidem."}
            )
        try:
            validate_password(password=attrs["password"])
        except DjangoValidationError as error:
            raise serializers.ValidationError({"password": list(error.messages)}) from error
        return attrs
