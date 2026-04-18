from __future__ import annotations

from django.contrib.auth.tokens import PasswordResetTokenGenerator as DjangoPasswordResetTokenGenerator


class EmailVerificationTokenGenerator(DjangoPasswordResetTokenGenerator):
    def _make_hash_value(self, user, timestamp) -> str:
        profile = getattr(user, "profile", None)
        verified_at = ""
        if profile is not None and profile.email_verified_at is not None:
            verified_at = profile.email_verified_at.replace(microsecond=0, tzinfo=None).isoformat()

        return f"{user.pk}{user.password}{user.email}{user.is_active}{verified_at}{timestamp}"


class PasswordResetTokenGenerator(DjangoPasswordResetTokenGenerator):
    """Token invalidated only when the password changes, not on login."""

    def _make_hash_value(self, user, timestamp) -> str:
        return f"{user.pk}{user.password}{timestamp}"


email_verification_token_generator = EmailVerificationTokenGenerator()
password_reset_token_generator = PasswordResetTokenGenerator()
