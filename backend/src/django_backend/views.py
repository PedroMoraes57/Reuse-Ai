from __future__ import annotations

from io import BytesIO

import torch
from PIL import Image
from rest_framework import status
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.gamification import build_public_quiz_payload, record_analysis_outcome
from reuse_ai.config import load_project_config
from reuse_ai.disposal_points import (
    DEFAULT_NOMINATIM_URL,
    DEFAULT_OVERPASS_URL,
    NearbyDisposalPointFinder,
    SearchLocationContext,
)
from reuse_ai.location import LocationResolver
from reuse_ai.predictor import ReusePredictor


_predictor: ReusePredictor | None = None
_disposal_point_finder: NearbyDisposalPointFinder | None = None
_location_resolver: LocationResolver | None = None


def get_predictor() -> ReusePredictor:
    global _predictor
    if _predictor is None:
        _predictor = ReusePredictor()
    return _predictor


def get_disposal_point_finder() -> NearbyDisposalPointFinder:
    global _disposal_point_finder
    if _disposal_point_finder is None:
        config = load_project_config()
        disposal_points_config = config.get("disposal_points", {})
        configured_urls = disposal_points_config.get("overpass_urls")
        _disposal_point_finder = NearbyDisposalPointFinder(
            overpass_url=str(
                disposal_points_config.get("overpass_url") or DEFAULT_OVERPASS_URL
            ),
            overpass_urls=(
                [str(url) for url in configured_urls if str(url).strip()]
                if isinstance(configured_urls, list)
                else None
            ),
            nominatim_url=str(
                disposal_points_config.get("nominatim_url") or DEFAULT_NOMINATIM_URL
            ),
            catalog_path=config.get("paths", {}).get("disposal_points_catalog"),
            request_timeout_seconds=int(disposal_points_config.get("request_timeout_seconds", 12)),
            cache_ttl_seconds=int(disposal_points_config.get("cache_ttl_seconds", 900)),
            max_results=int(disposal_points_config.get("max_results", 6)),
        )
    return _disposal_point_finder


def get_location_resolver() -> LocationResolver:
    global _location_resolver
    if _location_resolver is None:
        config = load_project_config()
        location_config = config.get("location", {})
        _location_resolver = LocationResolver(
            user_agent=str(location_config.get("geocoder_user_agent") or "reuse-ai-backend"),
            timeout_seconds=int(location_config.get("geocoder_timeout_seconds", 5)),
        )
    return _location_resolver


def parse_float(value: str | None) -> float | None:
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def parse_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


class HealthView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        return Response(
            {
                "status": "ok",
                "backend": "django",
                "model_ready": _predictor is not None,
                "cuda_available": torch.cuda.is_available(),
                "torch_cuda_version": torch.version.cuda,
            }
        )


class AnalyzeView(APIView):
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]

    def post(self, request):
        files = request.FILES.getlist("files")
        if not files:
            return Response(
                {"detail": "Nenhuma imagem foi enviada para análise."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        images = []
        for file_obj in files:
            try:
                image = Image.open(BytesIO(file_obj.read())).convert("RGB")
            except Exception as error:
                return Response(
                    {"detail": f"Erro ao ler a imagem enviada: {error}"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            images.append(image)

        try:
            predictor = get_predictor()
            result = predictor.predict(
                images=images,
                latitude=parse_float(request.data.get("latitude")),
                longitude=parse_float(request.data.get("longitude")),
                country_code=parse_text(request.data.get("country_code")),
                state=parse_text(request.data.get("state")),
                state_code=parse_text(request.data.get("state_code")),
                city=parse_text(request.data.get("city")),
            )
        except (FileNotFoundError, RuntimeError) as error:
            return Response({"detail": str(error)}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        except Exception as error:
            return Response(
                {"detail": f"Erro interno ao executar a análise: {error}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

        game_update = record_analysis_outcome(request.user, result)
        analysis = game_update.pop("analysis")
        result["analysis_id"] = analysis.id
        result["game_update"] = game_update
        result["quiz"] = build_public_quiz_payload(analysis)

        return Response(result)


class NearbyDisposalPointsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        latitude = parse_float(request.query_params.get("latitude"))
        longitude = parse_float(request.query_params.get("longitude"))
        disposal_stream = parse_text(request.query_params.get("disposal_stream"))
        city = parse_text(request.query_params.get("city"))
        state = parse_text(request.query_params.get("state"))
        state_code = parse_text(request.query_params.get("state_code"))
        country_code = parse_text(request.query_params.get("country_code"))

        if latitude is None or longitude is None:
            return Response(
                {"detail": "Informe latitude e longitude para buscar pontos próximos."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not disposal_stream:
            return Response(
                {"detail": "Informe o fluxo de descarte para buscar pontos próximos."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        resolved_location = get_location_resolver().resolve(
            latitude=latitude,
            longitude=longitude,
            country_code=country_code,
            state=state,
            state_code=state_code,
            city=city,
        )

        payload = get_disposal_point_finder().find_nearby(
            disposal_stream=disposal_stream,
            latitude=latitude,
            longitude=longitude,
            location_context=SearchLocationContext(
                city=resolved_location.city,
                state=resolved_location.state_name,
                state_code=resolved_location.state_code,
                country_code=resolved_location.country_code,
            ),
        )
        payload["user_location"] = {
            "latitude": round(latitude, 6),
            "longitude": round(longitude, 6),
        }
        payload["search_location"] = {
            "city": resolved_location.city,
            "state": resolved_location.state_name,
            "state_code": resolved_location.state_code,
            "country_code": resolved_location.country_code,
        }
        return Response(payload)
