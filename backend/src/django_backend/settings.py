import os
from email.utils import formataddr, parseaddr
from pathlib import Path

from dotenv import load_dotenv

# BASE_DIR points to backend/src
BASE_DIR = Path(__file__).resolve().parent.parent
PROJECT_DIR = BASE_DIR.parent
load_dotenv(PROJECT_DIR / ".env")

SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY") or os.environ.get("SECRET_KEY", "dev-secret")

DEBUG = os.environ.get("DJANGO_DEBUG", os.environ.get("DEBUG", "True")).lower() in {
    "1",
    "true",
    "yes",
    "on",
}

ALLOWED_HOSTS = ['*']

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework.authtoken',
    'corsheaders',
    'accounts',
    # 'reuse_ai' is a local package used by the analyze view (not a Django app)
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'django_backend.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.debug',
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'django_backend.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': str(BASE_DIR.parent / 'db.sqlite3'),
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator",
    },
    {
        "NAME": "django.contrib.auth.password_validation.MinimumLengthValidator",
        "OPTIONS": {"min_length": 8},
    },
    {
        "NAME": "django.contrib.auth.password_validation.CommonPasswordValidator",
    },
]

LANGUAGE_CODE = 'pt-br'

TIME_ZONE = 'America/Sao_Paulo'

USE_I18N = True

USE_TZ = True

STATIC_URL = '/static/'
MEDIA_URL = "/media/"
MEDIA_ROOT = PROJECT_DIR / "media"
MEDIA_ROOT.mkdir(parents=True, exist_ok=True)

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://127.0.0.1:5173")

if os.environ.get("DJANGO_TRUST_PROXY_HEADERS", "False").lower() in {"1", "true", "yes", "on"}:
    USE_X_FORWARDED_HOST = True
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
EMAIL_BRAND_NAME = os.environ.get("EMAIL_BRAND_NAME", "Reuse.AI")
EMAIL_BRAND_LOGO_PATH = os.environ.get(
    "EMAIL_BRAND_LOGO_PATH",
    str(PROJECT_DIR.parent / "frontend" / "src" / "assets" / "logo.png"),
)
GOOGLE_OAUTH_CLIENT_ID = os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "").strip()

EMAIL_HOST = os.environ.get("EMAIL_HOST", "")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "587"))
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "").strip()
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "").strip()
EMAIL_USE_TLS = os.environ.get("EMAIL_USE_TLS", "True").lower() in {"1", "true", "yes", "on"}
EMAIL_USE_SSL = os.environ.get("EMAIL_USE_SSL", "False").lower() in {"1", "true", "yes", "on"}
EMAIL_TIMEOUT = int(os.environ.get("EMAIL_TIMEOUT", "20"))
EMAIL_BACKEND = os.environ.get(
    "DJANGO_EMAIL_BACKEND",
    "django.core.mail.backends.smtp.EmailBackend"
    if EMAIL_HOST and EMAIL_HOST_USER and EMAIL_HOST_PASSWORD
    else "django.core.mail.backends.filebased.EmailBackend",
)
EMAIL_FILE_PATH = str(PROJECT_DIR / "artifacts" / "emails")
Path(EMAIL_FILE_PATH).mkdir(parents=True, exist_ok=True)
DEFAULT_FROM_NAME = os.environ.get("DEFAULT_FROM_NAME", EMAIL_BRAND_NAME).strip()


def normalize_email_address(raw_value: str, fallback: str) -> str:
    candidate = (raw_value or "").strip()
    _, parsed_email = parseaddr(candidate)
    return parsed_email or candidate or fallback


def build_sender_address(raw_value: str, display_name: str, fallback_email: str) -> str:
    candidate = (raw_value or "").strip()
    parsed_name, parsed_email = parseaddr(candidate)
    sender_email = parsed_email or candidate or fallback_email
    sender_name = display_name.strip() or parsed_name
    return formataddr((sender_name, sender_email)) if sender_name else sender_email


SUPPORT_EMAIL = normalize_email_address(
    os.environ.get("SUPPORT_EMAIL", EMAIL_HOST_USER or "suporte@reuse.ai"),
    EMAIL_HOST_USER or "suporte@reuse.ai",
)
DEFAULT_FROM_EMAIL = build_sender_address(
    os.environ.get("DEFAULT_FROM_EMAIL", EMAIL_HOST_USER or "noreply@reuse.ai"),
    DEFAULT_FROM_NAME,
    EMAIL_HOST_USER or "noreply@reuse.ai",
)
EXPOSE_DEBUG_VERIFICATION_LINK = os.environ.get(
    "DJANGO_EXPOSE_VERIFICATION_LINK",
    "False",
).lower() in {"1", "true", "yes", "on"}

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework.authentication.TokenAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
}

from corsheaders.defaults import default_headers

_extra_cors = [
    origin.strip()
    for origin in os.environ.get("EXTRA_CORS_ORIGINS", "").split(",")
    if origin.strip()
]

CORS_ALLOWED_ORIGINS = list({
    FRONTEND_URL,
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    *_extra_cors,
})

CORS_ALLOW_HEADERS = list(default_headers) + [
    'authorization',
]

CORS_ALLOW_ALL_ORIGINS = False
CSRF_TRUSTED_ORIGINS = [origin for origin in CORS_ALLOWED_ORIGINS if origin.startswith("http")]
