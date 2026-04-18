from __future__ import annotations

from email.mime.image import MIMEImage
from pathlib import Path

from django.conf import settings
from django.contrib.auth.models import User
from django.core.mail import EmailMultiAlternatives
from django.template.loader import render_to_string
from django.utils.encoding import force_bytes
from django.utils.http import urlsafe_base64_encode

from .tokens import email_verification_token_generator, password_reset_token_generator


def build_email_verification_link(user: User) -> str:
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = email_verification_token_generator.make_token(user)
    frontend_url = settings.FRONTEND_URL.rstrip("/")
    return f"{frontend_url}/verificar-email?uid={uid}&token={token}"


def attach_inline_logo(message: EmailMultiAlternatives) -> None:
    logo_path = Path(settings.EMAIL_BRAND_LOGO_PATH)
    if not logo_path.exists():
        return

    mime_image = MIMEImage(logo_path.read_bytes(), _subtype=logo_path.suffix.lstrip(".") or "png")
    mime_image.add_header("Content-ID", "<reuseai-logo>")
    mime_image.add_header("Content-Disposition", "inline", filename=logo_path.name)
    message.attach(mime_image)


def send_email_verification(user: User) -> str | None:
    if not user.email:
        return None

    verification_link = build_email_verification_link(user)
    context = {
        "username": user.first_name.strip() or user.username,
        "brand_name": settings.EMAIL_BRAND_NAME,
        "support_email": settings.SUPPORT_EMAIL,
        "verification_link": verification_link,
        "logo_cid": "reuseai-logo",
    }
    subject = "Confirme seu e-mail e ative sua conta na Reuse.AI"
    text_body = render_to_string("accounts/emails/verification_email.txt", context).replace("&amp;", "&")
    html_body = render_to_string("accounts/emails/verification_email.html", context)

    message = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[user.email],
    )
    message.attach_alternative(html_body, "text/html")
    attach_inline_logo(message)
    message.send(fail_silently=False)
    return verification_link


def build_password_reset_link(user: User) -> str:
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = password_reset_token_generator.make_token(user)
    frontend_url = settings.FRONTEND_URL.rstrip("/")
    return f"{frontend_url}/recuperar-senha?uid={uid}&token={token}"


def send_password_reset_email(user: User) -> str:
    reset_link = build_password_reset_link(user)
    context = {
        "username": user.first_name.strip() or user.username,
        "brand_name": settings.EMAIL_BRAND_NAME,
        "support_email": settings.SUPPORT_EMAIL,
        "reset_link": reset_link,
        "logo_cid": "reuseai-logo",
    }
    subject = "Recupere o acesso à sua conta na Reuse.AI"
    text_body = render_to_string("accounts/emails/password_reset_email.txt", context).replace("&amp;", "&")
    html_body = render_to_string("accounts/emails/password_reset_email.html", context)

    message = EmailMultiAlternatives(
        subject=subject,
        body=text_body,
        from_email=settings.DEFAULT_FROM_EMAIL,
        to=[user.email],
    )
    message.attach_alternative(html_body, "text/html")
    attach_inline_logo(message)
    message.send(fail_silently=False)
    return reset_link
