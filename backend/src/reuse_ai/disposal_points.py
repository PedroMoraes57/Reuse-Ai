from __future__ import annotations

from dataclasses import dataclass
import logging
import math
from pathlib import Path
import threading
import time
import unicodedata
from typing import Any
from urllib.parse import quote

import requests

from reuse_ai.config import load_yaml


logger = logging.getLogger(__name__)

DEFAULT_OVERPASS_URL = "https://overpass-api.de/api/interpreter"
DEFAULT_OVERPASS_URLS = (
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
)
DEFAULT_PHOTON_URL = "https://photon.komoot.io/api/"
DEFAULT_NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"


@dataclass(frozen=True)
class SearchProfile:
    stream: str
    stream_label: str
    radius_meters: int
    max_results: int
    exact_tag_keys: tuple[str, ...]
    keyword_fragments: tuple[str, ...]
    selectors: tuple[str, ...]
    disclaimer: str


@dataclass(frozen=True)
class SearchLocationContext:
    city: str | None = None
    state: str | None = None
    state_code: str | None = None
    country_code: str | None = None


@dataclass(frozen=True)
class CatalogDisposalPoint:
    id: str
    name: str
    category_label: str
    country_code: str | None
    state_code: str | None
    city: str | None
    latitude: float
    longitude: float
    address: str | None
    accepted_streams: tuple[str, ...]
    acceptance_confidence: str
    acceptance_summary: str | None
    match_reasons: tuple[str, ...]
    source: str
    reference_url: str | None = None
    reference_label: str | None = None
    notes: str | None = None


def _normalize_text(value: str | None) -> str:
    text = str(value or "").strip().lower()
    normalized = unicodedata.normalize("NFKD", text)
    return "".join(character for character in normalized if not unicodedata.combining(character))


def _same_region_token(left: str | None, right: str | None) -> bool:
    normalized_left = _normalize_text(left)
    normalized_right = _normalize_text(right)
    return bool(normalized_left and normalized_left == normalized_right)


def _build_address(tags: dict[str, str]) -> str | None:
    address_parts = [
        tags.get("addr:street"),
        tags.get("addr:housenumber"),
        tags.get("addr:suburb"),
        tags.get("addr:city"),
    ]
    address = ", ".join(part.strip() for part in address_parts if part and part.strip())
    return address or None


def _build_osm_url(latitude: float, longitude: float) -> str:
    return f"https://www.openstreetmap.org/?mlat={latitude:.6f}&mlon={longitude:.6f}#map=18/{latitude:.6f}/{longitude:.6f}"


def _build_directions_url(
    origin_latitude: float,
    origin_longitude: float,
    destination_latitude: float,
    destination_longitude: float,
) -> str:
    route = quote(
        (
            f"{origin_latitude:.6f},{origin_longitude:.6f};"
            f"{destination_latitude:.6f},{destination_longitude:.6f}"
        ),
        safe=";,",
    )
    return f"https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route={route}"


def _build_bbox(latitude: float, longitude: float, radius_meters: int) -> str:
    latitude_delta = radius_meters / 111_320
    longitude_delta = radius_meters / max(111_320 * math.cos(math.radians(latitude)), 1e-6)
    min_longitude = longitude - longitude_delta
    min_latitude = latitude - latitude_delta
    max_longitude = longitude + longitude_delta
    max_latitude = latitude + latitude_delta
    return f"{min_longitude:.6f},{min_latitude:.6f},{max_longitude:.6f},{max_latitude:.6f}"


def _build_nominatim_viewbox(latitude: float, longitude: float, radius_meters: int) -> str:
    min_longitude, min_latitude, max_longitude, max_latitude = _build_bbox(
        latitude,
        longitude,
        radius_meters,
    ).split(",")
    return f"{min_longitude},{max_latitude},{max_longitude},{min_latitude}"


def _haversine_distance_meters(
    latitude_a: float,
    longitude_a: float,
    latitude_b: float,
    longitude_b: float,
) -> int:
    earth_radius_meters = 6_371_000
    lat_a = math.radians(latitude_a)
    lat_b = math.radians(latitude_b)
    delta_lat = math.radians(latitude_b - latitude_a)
    delta_lng = math.radians(longitude_b - longitude_a)
    haversine = (
        math.sin(delta_lat / 2) ** 2
        + math.cos(lat_a) * math.cos(lat_b) * math.sin(delta_lng / 2) ** 2
    )
    central_angle = 2 * math.atan2(math.sqrt(haversine), math.sqrt(1 - haversine))
    return int(round(earth_radius_meters * central_angle))


def _category_label(tags: dict[str, str], normalized_name: str) -> str:
    if tags.get("amenity") == "pharmacy":
        return "Farmácia"
    if "ecoponto" in normalized_name:
        return "Ecoponto"
    if tags.get("recycling_type") == "centre":
        return "Centro de reciclagem"
    if tags.get("recycling_type") == "container":
        return "Ponto de coleta"
    if tags.get("amenity") == "recycling":
        return "Ponto de reciclagem"
    return "Ponto relacionado"


def _confidence_label(score: int) -> str:
    if score >= 85:
        return "alta"
    if score >= 58:
        return "media"
    return "baixa"


def _acceptance_label(profile: SearchProfile, confidence: str) -> str:
    if confidence == "alta":
        return f"Boa chance de aceitar {profile.stream_label.lower()}."
    if confidence == "media":
        return f"Provavelmente relacionado a {profile.stream_label.lower()}; confirme antes de ir."
    return f"Ponto potencial para {profile.stream_label.lower()}; confira a aceitação no local."


def _build_match_reasons(
    profile: SearchProfile,
    tags: dict[str, str],
    normalized_text: str,
    keyword_hits: int,
) -> list[str]:
    reasons: list[str] = []

    if any(tags.get(tag_key) == "yes" for tag_key in profile.exact_tag_keys):
        reasons.append(f"O OpenStreetMap marca aceitação para {profile.stream_label.lower()}.")

    if "ecoponto" in normalized_text:
        reasons.append("O local aparece descrito como ecoponto.")

    if tags.get("amenity") == "recycling":
        reasons.append("O local está cadastrado como ponto de reciclagem.")

    if tags.get("amenity") == "pharmacy":
        reasons.append("O local está cadastrado como farmácia.")

    if keyword_hits > 0:
        reasons.append("O nome ou a descrição combinam com esse tipo de descarte.")

    if not reasons:
        reasons.append("O local apareceu em uma busca aberta por pontos próximos relacionados.")

    return reasons[:3]


def _fallback_signal_terms(profile: SearchProfile) -> tuple[str, ...]:
    if profile.stream in {"recyclable_metal", "automotive_waste"}:
        terms = [
            "ferro velho",
            "sucata",
            "sucatao",
            "reciclagem",
            "centro de reciclagem",
            "ecoponto",
        ]
    elif profile.stream == "hazardous_medicine":
        terms = [
            "farmacia",
            "drogaria",
            "medicamento",
            "ecoponto",
        ]
    elif profile.stream == "hazardous_battery":
        terms = [
            "papa pilha",
            "pilhas",
            "baterias",
            "ecoponto",
            "reciclagem",
        ]
    elif profile.stream == "hazardous_lamp":
        terms = [
            "lampada",
            "lâmpada",
            "ecoponto",
            "reciclagem",
        ]
    elif profile.stream in {"e_waste", "bulky_e_waste"}:
        terms = [
            "lixo eletronico",
            "eletroeletronico",
            "eletronicos",
            "ecoponto",
            "reciclagem",
        ]
    elif profile.stream == "organic_compost":
        terms = [
            "compostagem",
            "compost",
            "ecoponto",
        ]
    elif profile.stream in {"donation_textile", "donation_footwear", "bulky_reuse"}:
        terms = [
            "doacao",
            "doação",
            "bazar",
            "reuso",
            "ecoponto",
        ]
    else:
        terms = [
            "ecoponto",
            "reciclagem",
            "coleta seletiva",
            "cooperativa reciclagem",
            "cooperativa de coleta seletiva",
            "reciclaveis",
            "recicláveis",
            "centro de reciclagem",
        ]

    unique_terms: list[str] = []
    seen_terms: set[str] = set()
    for term in terms:
        normalized = _normalize_text(term)
        if not normalized or normalized in seen_terms:
            continue
        seen_terms.add(normalized)
        unique_terms.append(term)
    return tuple(unique_terms)


def _optional_text(value: Any) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _load_catalog_points(catalog_path: str | Path | None) -> tuple[CatalogDisposalPoint, ...]:
    if catalog_path is None:
        return ()

    try:
        payload = load_yaml(catalog_path)
    except FileNotFoundError:
        logger.warning("Catálogo local de pontos de descarte não encontrado em %s", catalog_path)
        return ()

    raw_points = payload.get("points", [])
    if not isinstance(raw_points, list):
        return ()

    loaded_points: list[CatalogDisposalPoint] = []
    for index, raw_point in enumerate(raw_points):
        if not isinstance(raw_point, dict):
            continue

        try:
            latitude = float(raw_point["latitude"])
            longitude = float(raw_point["longitude"])
        except (KeyError, TypeError, ValueError):
            logger.warning(
                "Ignorando ponto local sem latitude/longitude validas no indice %s",
                index,
            )
            continue

        accepted_streams = tuple(
            str(stream).strip()
            for stream in raw_point.get("accepted_streams", [])
            if str(stream).strip()
        )
        if not accepted_streams:
            logger.warning(
                "Ignorando ponto local sem fluxos aceitos no indice %s",
                index,
            )
            continue

        confidence = _normalize_text(raw_point.get("acceptance_confidence"))
        if confidence not in {"alta", "media", "baixa"}:
            confidence = "media"

        loaded_points.append(
            CatalogDisposalPoint(
                id=_optional_text(raw_point.get("id")) or f"catalog-{index + 1}",
                name=_optional_text(raw_point.get("name")) or "Ponto local",
                category_label=_optional_text(raw_point.get("category_label"))
                or "Ponto de descarte",
                country_code=_optional_text(raw_point.get("country_code")),
                state_code=_optional_text(raw_point.get("state_code")),
                city=_optional_text(raw_point.get("city")),
                latitude=round(latitude, 6),
                longitude=round(longitude, 6),
                address=_optional_text(raw_point.get("address")),
                accepted_streams=accepted_streams,
                acceptance_confidence=confidence,
                acceptance_summary=_optional_text(raw_point.get("acceptance_summary")),
                match_reasons=tuple(
                    str(reason).strip()
                    for reason in raw_point.get("match_reasons", [])
                    if str(reason).strip()
                ),
                source=_optional_text(raw_point.get("source")) or "Catálogo local",
                reference_url=_optional_text(raw_point.get("reference_url")),
                reference_label=_optional_text(raw_point.get("reference_label")),
                notes=_optional_text(raw_point.get("notes")),
            )
        )

    return tuple(loaded_points)


STREAM_PROFILES: dict[str, SearchProfile] = {
    "recyclable_plastic": SearchProfile(
        stream="recyclable_plastic",
        stream_label="recicláveis secos",
        radius_meters=4500,
        max_results=6,
        exact_tag_keys=("recycling:plastic", "recycling:plastic_packaging"),
        keyword_fragments=("reciclag", "coleta seletiva", "ecoponto", "pev", "cooperativa"),
        selectors=(
            'nwr(around:{radius},{lat},{lng})["amenity"="recycling"];',
            'nwr(around:{radius},{lat},{lng})["recycling:plastic"="yes"];',
            'nwr(around:{radius},{lat},{lng})["name"~"ecoponto|reciclag|coleta seletiva|pev",i];',
        ),
        disclaimer="Confirme no local se ele recebe plásticos no fluxo seco antes de levar grandes volumes.",
    ),
    "recyclable_glass": SearchProfile(
        stream="recyclable_glass",
        stream_label="vidro",
        radius_meters=5000,
        max_results=6,
        exact_tag_keys=("recycling:glass",),
        keyword_fragments=("vidro", "reciclag", "ecoponto", "coleta seletiva", "cooperativa"),
        selectors=(
            'nwr(around:{radius},{lat},{lng})["amenity"="recycling"];',
            'nwr(around:{radius},{lat},{lng})["recycling:glass"="yes"];',
            'nwr(around:{radius},{lat},{lng})["name"~"ecoponto|vidro|reciclag",i];',
        ),
        disclaimer="Vidros quebrados devem ser embalados antes do transporte e do descarte.",
    ),
    "recyclable_metal": SearchProfile(
        stream="recyclable_metal",
        stream_label="metal",
        radius_meters=4500,
        max_results=6,
        exact_tag_keys=("recycling:metal", "recycling:cans"),
        keyword_fragments=("metal", "lata", "reciclag", "ecoponto", "cooperativa"),
        selectors=(
            'nwr(around:{radius},{lat},{lng})["amenity"="recycling"];',
            'nwr(around:{radius},{lat},{lng})["recycling:metal"="yes"];',
            'nwr(around:{radius},{lat},{lng})["name"~"ecoponto|metal|reciclag",i];',
        ),
        disclaimer="Locais genéricos de reciclagem costumam aceitar metal, mas vale confirmar lotes maiores.",
    ),
    "recyclable_paper": SearchProfile(
        stream="recyclable_paper",
        stream_label="papel",
        radius_meters=4500,
        max_results=6,
        exact_tag_keys=("recycling:paper",),
        keyword_fragments=("papel", "papelao", "reciclag", "ecoponto", "coleta seletiva", "cooperativa"),
        selectors=(
            'nwr(around:{radius},{lat},{lng})["amenity"="recycling"];',
            'nwr(around:{radius},{lat},{lng})["recycling:paper"="yes"];',
            'nwr(around:{radius},{lat},{lng})["name"~"ecoponto|papel|reciclag|coleta seletiva",i];',
        ),
        disclaimer="Papel contaminado ou engordurado pode ser recusado mesmo em pontos de recicláveis.",
    ),
    "recyclable_multilayer": SearchProfile(
        stream="recyclable_multilayer",
        stream_label="embalagens cartonadas",
        radius_meters=5000,
        max_results=6,
        exact_tag_keys=("recycling:cartons", "recycling:beverage_cartons"),
        keyword_fragments=("longa vida", "carton", "reciclag", "ecoponto", "cooperativa"),
        selectors=(
            'nwr(around:{radius},{lat},{lng})["amenity"="recycling"];',
            'nwr(around:{radius},{lat},{lng})["recycling:cartons"="yes"];',
            'nwr(around:{radius},{lat},{lng})["name"~"ecoponto|carton|reciclag",i];',
        ),
        disclaimer="Nem todo ponto de recicláveis secos recebe cartonados; confirme se for possível.",
    ),
    "plastic_film": SearchProfile(
        stream="plastic_film",
        stream_label="plástico flexível",
        radius_meters=5500,
        max_results=6,
        exact_tag_keys=("recycling:plastic", "recycling:plastic_packaging"),
        keyword_fragments=("sacola", "plastico", "reciclag", "ecoponto"),
        selectors=(
            'nwr(around:{radius},{lat},{lng})["amenity"="recycling"];',
            'nwr(around:{radius},{lat},{lng})["name"~"ecoponto|plastico|reciclag",i];',
            'nwr(around:{radius},{lat},{lng})["operator"~"supermercado|mercado",i];',
        ),
        disclaimer="Plástico flexível costuma exigir ponto específico; confirme a aceitação antes de levar.",
    ),
    "recyclable_plastic_special": SearchProfile(
        stream="recyclable_plastic_special",
        stream_label="isopor e plásticos especiais",
        radius_meters=6500,
        max_results=6,
        exact_tag_keys=("recycling:plastic",),
        keyword_fragments=("isopor", "eps", "ecoponto", "reciclag"),
        selectors=(
            'nwr(around:{radius},{lat},{lng})["amenity"="recycling"];',
            'nwr(around:{radius},{lat},{lng})["name"~"ecoponto|isopor|eps|reciclag",i];',
        ),
        disclaimer="Isopor e plásticos especiais não são aceitos por todos os ecopontos.",
    ),
    "small_paper_fragments": SearchProfile(
        stream="small_paper_fragments",
        stream_label="papel em pequenos fragmentos",
        radius_meters=4000,
        max_results=6,
        exact_tag_keys=("recycling:paper",),
        keyword_fragments=("papel", "reciclag", "ecoponto"),
        selectors=(
            'nwr(around:{radius},{lat},{lng})["amenity"="recycling"];',
            'nwr(around:{radius},{lat},{lng})["recycling:paper"="yes"];',
        ),
        disclaimer="Esse material pode escapar da triagem; leve apenas se estiver bem acondicionado.",
    ),
    "hazardous_battery": SearchProfile(
        stream="hazardous_battery",
        stream_label="pilhas e baterias",
        radius_meters=8000,
        max_results=6,
        exact_tag_keys=("recycling:batteries",),
        keyword_fragments=("pilha", "bateria", "papa pilha", "ecoponto"),
        selectors=(
            'nwr(around:{radius},{lat},{lng})["recycling:batteries"="yes"];',
            'nwr(around:{radius},{lat},{lng})["name"~"papa pilha|pilhas?|baterias?|ecoponto",i];',
            'nwr(around:{radius},{lat},{lng})["amenity"="recycling"];',
        ),
        disclaimer="Pilhas e baterias exigem descarte especial; confirme a aceitação exata no local escolhido.",
    ),
    "e_waste": SearchProfile(
        stream="e_waste",
        stream_label="eletrônicos",
        radius_meters=8500,
        max_results=6,
        exact_tag_keys=("recycling:electronics", "recycling:small_appliances"),
        keyword_fragments=("eletron", "lixo eletronico", "ecoponto", "reciclag"),
        selectors=(
            'nwr(around:{radius},{lat},{lng})["recycling:electronics"="yes"];',
            'nwr(around:{radius},{lat},{lng})["name"~"eletron|lixo eletronico|ecoponto|reciclag",i];',
            'nwr(around:{radius},{lat},{lng})["amenity"="recycling"];',
        ),
        disclaimer="Apague dados do aparelho antes de levar e confirme se o ponto aceita esse tipo de eletrônico.",
    ),
    "bulky_e_waste": SearchProfile(
        stream="bulky_e_waste",
        stream_label="eletroeletrônicos de maior porte",
        radius_meters=10000,
        max_results=6,
        exact_tag_keys=("recycling:electronics", "recycling:small_appliances"),
        keyword_fragments=("eletro", "eletron", "ecoponto", "volumoso"),
        selectors=(
            'nwr(around:{radius},{lat},{lng})["name"~"ecoponto|eletron|eletro|volumoso",i];',
            'nwr(around:{radius},{lat},{lng})["amenity"="recycling"];',
        ),
        disclaimer="Volumosos e eletrodomésticos grandes podem depender de agenda ou regra específica do ponto.",
    ),
    "hazardous_lamp": SearchProfile(
        stream="hazardous_lamp",
        stream_label="lâmpadas",
        radius_meters=9000,
        max_results=6,
        exact_tag_keys=("recycling:light_bulbs", "recycling:fluorescent_tubes"),
        keyword_fragments=("lampada", "lâmpada", "ecoponto", "reciclag"),
        selectors=(
            'nwr(around:{radius},{lat},{lng})["recycling:light_bulbs"="yes"];',
            'nwr(around:{radius},{lat},{lng})["name"~"lampada|ecoponto|reciclag",i];',
            'nwr(around:{radius},{lat},{lng})["amenity"="recycling"];',
        ),
        disclaimer="Mantenha a lâmpada inteira e embalada ao transportar até o ponto.",
    ),
    "hazardous_medicine": SearchProfile(
        stream="hazardous_medicine",
        stream_label="medicamentos",
        radius_meters=6000,
        max_results=6,
        exact_tag_keys=("recycling:medicine",),
        keyword_fragments=("medicamento", "farmacia", "farmácia", "drogaria"),
        selectors=(
            'nwr(around:{radius},{lat},{lng})["recycling:medicine"="yes"];',
            'nwr(around:{radius},{lat},{lng})["amenity"="pharmacy"];',
            'nwr(around:{radius},{lat},{lng})["name"~"medicamento|farmacia|drogaria",i];',
        ),
        disclaimer="Nem toda farmácia recebe sobras de medicamentos; confirme antes de se deslocar.",
    ),
    "hazardous_paint": SearchProfile(
        stream="hazardous_paint",
        stream_label="tintas e resíduos químicos",
        radius_meters=9000,
        max_results=6,
        exact_tag_keys=("recycling:hazardous_waste",),
        keyword_fragments=("tinta", "quimic", "ecoponto", "residuo perigoso"),
        selectors=(
            'nwr(around:{radius},{lat},{lng})["recycling:hazardous_waste"="yes"];',
            'nwr(around:{radius},{lat},{lng})["name"~"ecoponto|tinta|quimic",i];',
            'nwr(around:{radius},{lat},{lng})["amenity"="recycling"];',
        ),
        disclaimer="Tinta e solvente pedem confirmação prévia, porque muitos pontos aceitam apenas embalagens vazias.",
    ),
    "automotive_waste": SearchProfile(
        stream="automotive_waste",
        stream_label="resíduos automotivos",
        radius_meters=10000,
        max_results=6,
        exact_tag_keys=("recycling:scrap_metal", "recycling:oil"),
        keyword_fragments=("automot", "sucata", "desmanche", "ecoponto"),
        selectors=(
            'nwr(around:{radius},{lat},{lng})["name"~"automot|sucata|desmanche|ecoponto",i];',
            'nwr(around:{radius},{lat},{lng})["recycling:scrap_metal"="yes"];',
            'nwr(around:{radius},{lat},{lng})["amenity"="recycling"];',
        ),
        disclaimer="Peças contaminadas com óleo ou fluido precisam de confirmação específica antes do descarte.",
    ),
    "bulky_wood": SearchProfile(
        stream="bulky_wood",
        stream_label="madeira volumosa",
        radius_meters=9000,
        max_results=6,
        exact_tag_keys=("recycling:wood",),
        keyword_fragments=("madeira", "marcen", "ecoponto", "volumoso"),
        selectors=(
            'nwr(around:{radius},{lat},{lng})["recycling:wood"="yes"];',
            'nwr(around:{radius},{lat},{lng})["name"~"madeira|ecoponto|volumoso|marcen",i];',
            'nwr(around:{radius},{lat},{lng})["amenity"="recycling"];',
        ),
        disclaimer="Madeira tratada, pintada ou com ferragens pode ter restrições extras no recebimento.",
    ),
    "bulky_reuse": SearchProfile(
        stream="bulky_reuse",
        stream_label="volumosos para reuso",
        radius_meters=9000,
        max_results=6,
        exact_tag_keys=("recycling:clothes", "recycling:furniture"),
        keyword_fragments=("doacao", "doação", "reuso", "bazar", "ecoponto"),
        selectors=(
            'nwr(around:{radius},{lat},{lng})["name"~"doacao|bazar|reuso|ecoponto",i];',
            'nwr(around:{radius},{lat},{lng})["amenity"="recycling"];',
        ),
        disclaimer="Itens em bom estado devem priorizar doação; confirme se o local recebe móveis ou peças grandes.",
    ),
    "donation_textile": SearchProfile(
        stream="donation_textile",
        stream_label="roupas e têxteis",
        radius_meters=7000,
        max_results=6,
        exact_tag_keys=("recycling:clothes",),
        keyword_fragments=("roupa", "textil", "doacao", "bazar"),
        selectors=(
            'nwr(around:{radius},{lat},{lng})["recycling:clothes"="yes"];',
            'nwr(around:{radius},{lat},{lng})["name"~"roupa|textil|doacao|bazar",i];',
            'nwr(around:{radius},{lat},{lng})["amenity"="recycling"];',
        ),
        disclaimer="Peças limpas e secas têm maior chance de aceitação em pontos de doação ou reciclagem têxtil.",
    ),
    "donation_footwear": SearchProfile(
        stream="donation_footwear",
        stream_label="calçados",
        radius_meters=7000,
        max_results=6,
        exact_tag_keys=("recycling:clothes",),
        keyword_fragments=("calcado", "calçado", "sapato", "doacao"),
        selectors=(
            'nwr(around:{radius},{lat},{lng})["name"~"calcado|sapato|doacao|bazar",i];',
            'nwr(around:{radius},{lat},{lng})["amenity"="recycling"];',
        ),
        disclaimer="Organize os pares antes de levar e confirme se o ponto recebe calçados em vez de roupas gerais.",
    ),
    "organic_compost": SearchProfile(
        stream="organic_compost",
        stream_label="orgânicos para compostagem",
        radius_meters=5000,
        max_results=6,
        exact_tag_keys=("recycling:green_waste", "recycling:organic", "compost"),
        keyword_fragments=("compost", "organico", "orgânico", "verde"),
        selectors=(
            'nwr(around:{radius},{lat},{lng})["compost"="yes"];',
            'nwr(around:{radius},{lat},{lng})["name"~"compost|organico|orgânico",i];',
            'nwr(around:{radius},{lat},{lng})["amenity"="recycling"];',
        ),
        disclaimer="Resíduos orgânicos podem ter restrições de volume ou tipo; confirme antes de levar ao ponto.",
    ),
}


GENERIC_FALLBACK_PROFILE = SearchProfile(
    stream="generic",
    stream_label="descarte especial",
    radius_meters=6000,
    max_results=6,
    exact_tag_keys=(),
    keyword_fragments=("ecoponto", "reciclag", "coleta seletiva", "cooperativa"),
    selectors=(
        'nwr(around:{radius},{lat},{lng})["amenity"="recycling"];',
        'nwr(around:{radius},{lat},{lng})["name"~"ecoponto|reciclag|coleta seletiva",i];',
    ),
    disclaimer="Confirme no local se ele recebe exatamente esse material antes de se deslocar.",
)


class NearbyDisposalPointFinder:
    def __init__(
        self,
        overpass_url: str = DEFAULT_OVERPASS_URL,
        overpass_urls: tuple[str, ...] | list[str] | None = None,
        photon_url: str = DEFAULT_PHOTON_URL,
        nominatim_url: str = DEFAULT_NOMINATIM_URL,
        catalog_path: str | Path | None = None,
        request_timeout_seconds: int = 12,
        cache_ttl_seconds: int = 900,
        max_results: int = 6,
    ) -> None:
        configured_urls = tuple(
            url.strip()
            for url in (
                overpass_urls
                if overpass_urls is not None
                else DEFAULT_OVERPASS_URLS
            )
            if isinstance(url, str) and url.strip()
        )
        self.overpass_urls = configured_urls or DEFAULT_OVERPASS_URLS
        self.photon_url = photon_url
        self.nominatim_url = nominatim_url
        self.catalog_points = _load_catalog_points(catalog_path)
        self.request_timeout_seconds = request_timeout_seconds
        self.cache_ttl_seconds = cache_ttl_seconds
        self.max_results = max_results
        self._cache: dict[tuple[str, float, float], tuple[float, dict[str, Any]]] = {}
        self._cache_lock = threading.Lock()

    def _profile_for_stream(self, disposal_stream: str) -> SearchProfile:
        profile = STREAM_PROFILES.get(disposal_stream)
        if profile is not None:
            return profile
        return SearchProfile(
            **{
                **GENERIC_FALLBACK_PROFILE.__dict__,
                "stream": disposal_stream,
                "stream_label": disposal_stream.replace("_", " "),
            }
        )

    def _cache_key(self, disposal_stream: str, latitude: float, longitude: float) -> tuple[str, float, float]:
        return (disposal_stream, round(latitude, 3), round(longitude, 3))

    def _get_cached(self, cache_key: tuple[str, float, float]) -> dict[str, Any] | None:
        with self._cache_lock:
            cached = self._cache.get(cache_key)
            if cached is None:
                return None
            expires_at, payload = cached
            if expires_at < time.monotonic():
                self._cache.pop(cache_key, None)
                return None
            return payload

    def _set_cached(self, cache_key: tuple[str, float, float], payload: dict[str, Any]) -> None:
        with self._cache_lock:
            self._cache[cache_key] = (time.monotonic() + self.cache_ttl_seconds, payload)

    def _matches_catalog_location(
        self,
        point: CatalogDisposalPoint,
        location_context: SearchLocationContext | None,
    ) -> bool:
        if location_context is None:
            return True

        if (
            location_context.country_code
            and point.country_code
            and not _same_region_token(location_context.country_code, point.country_code)
        ):
            return False

        if (
            location_context.state_code
            and point.state_code
            and not _same_region_token(location_context.state_code, point.state_code)
        ):
            return False

        if (
            location_context.city
            and point.city
            and not _same_region_token(location_context.city, point.city)
        ):
            return False

        return True

    def _catalog_points_for_stream(
        self,
        profile: SearchProfile,
        latitude: float,
        longitude: float,
        location_context: SearchLocationContext | None = None,
    ) -> list[dict[str, Any]]:
        if not self.catalog_points:
            return []

        max_distance_meters = self._max_fallback_distance_meters(profile)
        candidates: list[dict[str, Any]] = []

        for point in self.catalog_points:
            if profile.stream not in point.accepted_streams:
                continue
            if not self._matches_catalog_location(point, location_context):
                continue

            distance_meters = _haversine_distance_meters(
                latitude,
                longitude,
                point.latitude,
                point.longitude,
            )
            if distance_meters > max_distance_meters:
                continue

            score = 120 + max(0, 24 - int(distance_meters / 300))
            confidence = point.acceptance_confidence
            match_reasons = list(point.match_reasons)[:3]
            if not match_reasons:
                match_reasons.append(
                    f"Ponto curado localmente para {profile.stream_label.lower()}."
                )

            candidates.append(
                {
                    "id": point.id,
                    "name": point.name,
                    "latitude": point.latitude,
                    "longitude": point.longitude,
                    "distance_meters": distance_meters,
                    "distance_km": round(distance_meters / 1000, 1),
                    "address": point.address,
                    "category_label": point.category_label,
                    "acceptance_confidence": confidence,
                    "acceptance_summary": point.acceptance_summary
                    or _acceptance_label(profile, confidence),
                    "match_reasons": match_reasons,
                    "osm_url": _build_osm_url(point.latitude, point.longitude),
                    "directions_url": _build_directions_url(
                        latitude,
                        longitude,
                        point.latitude,
                        point.longitude,
                    ),
                    "source": point.source,
                    "reference_url": point.reference_url,
                    "reference_label": point.reference_label,
                    "score": score,
                }
            )

        candidates.sort(key=lambda item: (int(item["distance_meters"]), -int(item["score"])))
        return candidates[: self.max_results]

    def _build_query(self, profile: SearchProfile, latitude: float, longitude: float) -> str:
        selectors = "\n".join(
            selector.format(radius=profile.radius_meters, lat=latitude, lng=longitude)
            for selector in profile.selectors
        )
        return "\n".join(
            [
                "[out:json][timeout:15];",
                "(",
                selectors,
                ");",
                "out center tags;",
            ]
        )

    def _request_overpass(self, query: str) -> tuple[dict[str, Any], str]:
        last_error: requests.RequestException | None = None

        for overpass_url in self.overpass_urls:
            try:
                response = requests.post(
                    overpass_url,
                    data=query.encode("utf-8"),
                    timeout=self.request_timeout_seconds,
                    headers={
                        "Accept": "application/json",
                        "Content-Type": "text/plain; charset=utf-8",
                        "User-Agent": "ReuseAI/1.0 (disposal point lookup)",
                    },
                )
                response.raise_for_status()
                return response.json(), overpass_url
            except requests.RequestException as error:
                last_error = error
                logger.warning(
                    "Falha ao consultar pontos de descarte em %s: %s",
                    overpass_url,
                    error,
                )

        if last_error is not None:
            raise last_error
        raise requests.RequestException("Nenhum endpoint do Overpass foi configurado.")

    def _max_fallback_distance_meters(self, profile: SearchProfile) -> int:
        return min(max(profile.radius_meters * 3, 12_000), 35_000)

    def _text_queries_for_profile(
        self,
        profile: SearchProfile,
        location_context: SearchLocationContext | None = None,
    ) -> tuple[str, ...]:
        preferred_terms = list(_fallback_signal_terms(profile))

        unique_terms: list[str] = []
        seen_terms: set[str] = set()
        for term in preferred_terms:
            normalized = _normalize_text(term)
            if not normalized or normalized in seen_terms:
                continue
            seen_terms.add(normalized)
            unique_terms.append(term)

        enriched_terms: list[str] = []
        if location_context and location_context.city:
            for term in unique_terms:
                enriched_terms.append(f"{term} {location_context.city}")
                if location_context.state_code:
                    enriched_terms.append(
                        f"{term} {location_context.city} {location_context.state_code}"
                    )
                if location_context.state:
                    enriched_terms.append(f"{term} {location_context.city} {location_context.state}")

        enriched_terms.extend(unique_terms)

        final_terms: list[str] = []
        seen_final_terms: set[str] = set()
        for term in enriched_terms:
            normalized = _normalize_text(term)
            if not normalized or normalized in seen_final_terms:
                continue
            seen_final_terms.add(normalized)
            final_terms.append(term)
        return tuple(final_terms[:6])

    def _request_photon(
        self,
        *,
        query_text: str,
        latitude: float,
        longitude: float,
        radius_meters: int,
    ) -> dict[str, Any]:
        response = requests.get(
            self.photon_url,
            params={
                "q": query_text,
                "limit": self.max_results,
                "bbox": _build_bbox(latitude, longitude, radius_meters),
                "lat": latitude,
                "lon": longitude,
            },
            timeout=min(self.request_timeout_seconds, 6),
            headers={
                "Accept": "application/json",
                "User-Agent": "ReuseAI/1.0 (disposal point lookup)",
            },
        )
        response.raise_for_status()
        return response.json()

    def _request_nominatim(
        self,
        *,
        query_text: str,
        latitude: float,
        longitude: float,
        radius_meters: int,
        location_context: SearchLocationContext | None = None,
    ) -> list[dict[str, Any]]:
        country_code = _normalize_text(location_context.country_code) if location_context else ""
        response = requests.get(
            self.nominatim_url,
            params={
                "q": query_text,
                "format": "jsonv2",
                "limit": self.max_results,
                "addressdetails": 1,
                "dedupe": 1,
                "countrycodes": country_code or None,
                "viewbox": _build_nominatim_viewbox(latitude, longitude, radius_meters),
                "bounded": 1,
            },
            timeout=min(self.request_timeout_seconds, 6),
            headers={
                "Accept": "application/json",
                "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.7",
                "User-Agent": "ReuseAI/1.0 (disposal point lookup)",
            },
        )
        response.raise_for_status()
        payload = response.json()
        return payload if isinstance(payload, list) else []

    def _extract_photon_points(
        self,
        profile: SearchProfile,
        latitude: float,
        longitude: float,
        payload: dict[str, Any],
    ) -> list[dict[str, Any]]:
        candidates: list[dict[str, Any]] = []
        seen_keys: set[tuple[str, float, float]] = set()

        for feature in payload.get("features", []):
            properties = dict(feature.get("properties", {}))
            coordinates = feature.get("geometry", {}).get("coordinates", [])
            if len(coordinates) != 2:
                continue

            point_longitude = float(coordinates[0])
            point_latitude = float(coordinates[1])
            name = (
                properties.get("name")
                or properties.get("street")
                or properties.get("district")
                or "Ponto próximo"
            )
            distance_meters = _haversine_distance_meters(
                latitude,
                longitude,
                point_latitude,
                point_longitude,
            )
            normalized_text = _normalize_text(
                " ".join(
                    filter(
                        None,
                        [
                            str(properties.get("name") or ""),
                            str(properties.get("osm_value") or ""),
                            str(properties.get("street") or ""),
                            str(properties.get("city") or ""),
                        ],
                    )
                )
            )
            keyword_hits = sum(
                1 for fragment in profile.keyword_fragments if fragment and fragment in normalized_text
            )
            osm_value = _normalize_text(str(properties.get("osm_value") or ""))
            signal_terms = _fallback_signal_terms(profile)
            has_strong_signal = (
                any(_normalize_text(term) in normalized_text for term in signal_terms)
                or osm_value in {"recycling", "pharmacy"}
            )
            if not has_strong_signal:
                continue
            score = 16 + min(keyword_hits * 10, 24) + max(0, 18 - int(distance_meters / 8000))
            dedupe_key = (
                _normalize_text(name),
                round(point_latitude, 5),
                round(point_longitude, 5),
            )
            if dedupe_key in seen_keys:
                continue
            seen_keys.add(dedupe_key)

            address = ", ".join(
                part
                for part in [
                    properties.get("street"),
                    properties.get("housenumber"),
                    properties.get("district"),
                    properties.get("city"),
                ]
                if isinstance(part, str) and part.strip()
            ) or None

            candidates.append(
                {
                    "id": f"photon-{properties.get('osm_type', 'feature')}-{properties.get('osm_id', name)}",
                    "name": name,
                    "latitude": round(point_latitude, 6),
                    "longitude": round(point_longitude, 6),
                    "distance_meters": distance_meters,
                    "distance_km": round(distance_meters / 1000, 1),
                    "address": address,
                    "category_label": _category_label(
                        {
                            "amenity": str(properties.get("osm_value") or ""),
                            "recycling_type": "",
                        },
                        normalized_text,
                    ),
                    "acceptance_confidence": "baixa",
                    "acceptance_summary": (
                        f"Resultado aproximado por busca textual para {profile.stream_label.lower()}; confirme antes de ir."
                    ),
                    "match_reasons": [
                        "Resultado encontrado por busca textual geográfica em fonte aberta.",
                    ],
                    "osm_url": _build_osm_url(point_latitude, point_longitude),
                    "directions_url": _build_directions_url(
                        latitude,
                        longitude,
                        point_latitude,
                        point_longitude,
                    ),
                    "source": "Photon",
                    "score": score,
                    "_city": properties.get("city"),
                    "_state": properties.get("state"),
                    "_country_code": properties.get("countrycode"),
                }
            )

        candidates.sort(key=lambda item: (int(item["distance_meters"]), -int(item["score"])))
        return candidates[: self.max_results]

    def _extract_nominatim_points(
        self,
        profile: SearchProfile,
        latitude: float,
        longitude: float,
        payload: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        candidates: list[dict[str, Any]] = []
        seen_keys: set[tuple[str, float, float]] = set()
        signal_terms = _fallback_signal_terms(profile)

        for item in payload:
            try:
                point_latitude = float(item.get("lat"))
                point_longitude = float(item.get("lon"))
            except (TypeError, ValueError):
                continue

            address = dict(item.get("address", {}))
            raw_name = (
                item.get("name")
                or address.get("road")
                or address.get("suburb")
                or address.get("neighbourhood")
                or "Ponto próximo"
            )
            display_name = str(item.get("display_name") or "")
            class_name = str(item.get("class") or "")
            type_name = str(item.get("type") or "")
            normalized_text = _normalize_text(
                " ".join(
                    filter(
                        None,
                        [
                            str(raw_name),
                            display_name,
                            class_name,
                            type_name,
                            str(address.get("city") or address.get("town") or address.get("village") or ""),
                        ],
                    )
                )
            )
            keyword_hits = sum(
                1 for fragment in profile.keyword_fragments if fragment and fragment in normalized_text
            )
            has_strong_signal = (
                any(_normalize_text(term) in normalized_text for term in signal_terms)
                or _normalize_text(type_name) in {"recycling", "pharmacy"}
            )
            if not has_strong_signal:
                continue

            distance_meters = _haversine_distance_meters(
                latitude,
                longitude,
                point_latitude,
                point_longitude,
            )
            dedupe_key = (
                _normalize_text(str(raw_name)),
                round(point_latitude, 5),
                round(point_longitude, 5),
            )
            if dedupe_key in seen_keys:
                continue
            seen_keys.add(dedupe_key)

            address_text = ", ".join(
                part
                for part in [
                    address.get("road"),
                    address.get("house_number"),
                    address.get("suburb") or address.get("neighbourhood"),
                    address.get("city") or address.get("town") or address.get("village"),
                ]
                if isinstance(part, str) and part.strip()
            ) or None
            score = 18 + min(keyword_hits * 10, 26) + max(0, 20 - int(distance_meters / 7000))

            candidates.append(
                {
                    "id": f"nominatim-{item.get('osm_type', 'feature')}-{item.get('osm_id', raw_name)}",
                    "name": str(raw_name),
                    "latitude": round(point_latitude, 6),
                    "longitude": round(point_longitude, 6),
                    "distance_meters": distance_meters,
                    "distance_km": round(distance_meters / 1000, 1),
                    "address": address_text,
                    "category_label": _category_label(
                        {
                            "amenity": type_name,
                            "recycling_type": "",
                        },
                        normalized_text,
                    ),
                    "acceptance_confidence": "baixa",
                    "acceptance_summary": (
                        f"Resultado aproximado por busca textual para {profile.stream_label.lower()}; confirme antes de ir."
                    ),
                    "match_reasons": [
                        "Resultado encontrado por busca textual geográfica em fonte aberta.",
                    ],
                    "osm_url": _build_osm_url(point_latitude, point_longitude),
                    "directions_url": _build_directions_url(
                        latitude,
                        longitude,
                        point_latitude,
                        point_longitude,
                    ),
                    "source": "Nominatim",
                    "score": score,
                    "_city": address.get("city") or address.get("town") or address.get("village"),
                    "_state": address.get("state"),
                    "_country_code": address.get("country_code"),
                }
            )

        candidates.sort(key=lambda item: (int(item["distance_meters"]), -int(item["score"])))
        return candidates[: self.max_results]

    def _matches_location_context(
        self,
        point: dict[str, Any],
        location_context: SearchLocationContext | None,
    ) -> bool:
        if location_context is None:
            return True

        if (
            location_context.country_code
            and point.get("_country_code")
            and not _same_region_token(location_context.country_code, point.get("_country_code"))
        ):
            return False

        if (
            location_context.state
            and point.get("_state")
            and not _same_region_token(location_context.state, point.get("_state"))
        ):
            return False

        if (
            location_context.city
            and point.get("_city")
            and not _same_region_token(location_context.city, point.get("_city"))
        ):
            return False

        return True

    def _prepare_points_for_response(self, points: list[dict[str, Any]]) -> list[dict[str, Any]]:
        return [
            {
                key: value
                for key, value in point.items()
                if not str(key).startswith("_")
            }
            for point in points
        ]

    def _fallback_search_points(
        self,
        profile: SearchProfile,
        latitude: float,
        longitude: float,
        location_context: SearchLocationContext | None = None,
    ) -> tuple[list[dict[str, Any]], str | None, str | None]:
        max_distance_meters = self._max_fallback_distance_meters(profile)
        radius_meters = max_distance_meters
        text_queries = self._text_queries_for_profile(profile, location_context)
        seen_keys: set[tuple[str, float, float]] = set()
        collected_points: list[dict[str, Any]] = []
        provider_sources: set[str] = set()

        # The public Nominatim service has strict usage limits, so we keep it to a single lookup.
        for query_text in text_queries[:1]:
            try:
                nominatim_payload = self._request_nominatim(
                    query_text=query_text,
                    latitude=latitude,
                    longitude=longitude,
                    radius_meters=radius_meters,
                    location_context=location_context,
                )
                provider_points = self._extract_nominatim_points(
                    profile,
                    latitude,
                    longitude,
                    nominatim_payload,
                )
                if provider_points:
                    provider_sources.add("Nominatim")
                    for point in provider_points:
                        dedupe_key = (
                            _normalize_text(str(point.get("name"))),
                            round(float(point.get("latitude", 0.0)), 5),
                            round(float(point.get("longitude", 0.0)), 5),
                        )
                        if dedupe_key in seen_keys:
                            continue
                        seen_keys.add(dedupe_key)
                        collected_points.append(point)
            except requests.RequestException as error:
                logger.warning(
                    "Falha ao consultar fallback do Nominatim (%s): %s",
                    query_text,
                    error,
                )

        for query_text in text_queries[:3]:
            try:
                photon_payload = self._request_photon(
                    query_text=query_text,
                    latitude=latitude,
                    longitude=longitude,
                    radius_meters=radius_meters,
                )
                provider_points = self._extract_photon_points(
                    profile,
                    latitude,
                    longitude,
                    photon_payload,
                )
                if provider_points:
                    provider_sources.add("Photon")
                    for point in provider_points:
                        dedupe_key = (
                            _normalize_text(str(point.get("name"))),
                            round(float(point.get("latitude", 0.0)), 5),
                            round(float(point.get("longitude", 0.0)), 5),
                        )
                        if dedupe_key in seen_keys:
                            continue
                        seen_keys.add(dedupe_key)
                        collected_points.append(point)
            except requests.RequestException as error:
                logger.warning(
                    "Falha ao consultar fallback do Photon (%s): %s",
                    query_text,
                    error,
                )
            if collected_points:
                break

        trusted_points = [
            point
            for point in collected_points
            if int(point["distance_meters"]) <= max_distance_meters
            and self._matches_location_context(point, location_context)
        ]
        if trusted_points:
            trusted_points.sort(
                key=lambda item: (int(item["distance_meters"]), -int(item["score"]))
            )
            source_label = " + ".join(sorted(provider_sources)) if provider_sources else None
            return (
                self._prepare_points_for_response(trusted_points[: self.max_results]),
                (
                    "Os pontos abaixo vieram de buscas textuais em bases abertas, com prioridade para a sua cidade. "
                    "Confirme o recebimento do material antes de se deslocar."
                ),
                source_label,
            )

        return [], None, None

    def _score_candidate(
        self,
        profile: SearchProfile,
        tags: dict[str, str],
        normalized_text: str,
        distance_meters: int,
    ) -> tuple[int, list[str]]:
        keyword_hits = sum(
            1 for fragment in profile.keyword_fragments if fragment and fragment in normalized_text
        )
        score = 0

        if any(tags.get(tag_key) == "yes" for tag_key in profile.exact_tag_keys):
            score += 56
        if "ecoponto" in normalized_text:
            score += 24
        if tags.get("amenity") == "recycling":
            score += 20
        if tags.get("recycling_type") == "centre":
            score += 12
        if tags.get("amenity") == "pharmacy":
            score += 16
        score += min(keyword_hits * 10, 24)
        score += max(0, 28 - int(distance_meters / 240))

        reasons = _build_match_reasons(profile, tags, normalized_text, keyword_hits)
        return score, reasons

    def _extract_points(
        self,
        profile: SearchProfile,
        latitude: float,
        longitude: float,
        payload: dict[str, Any],
    ) -> list[dict[str, Any]]:
        candidates: list[dict[str, Any]] = []
        seen_keys: set[tuple[str, float, float]] = set()

        for element in payload.get("elements", []):
            tags = {str(key): str(value) for key, value in dict(element.get("tags", {})).items()}
            point_latitude = element.get("lat") or element.get("center", {}).get("lat")
            point_longitude = element.get("lon") or element.get("center", {}).get("lon")
            if point_latitude is None or point_longitude is None:
                continue

            name = tags.get("name") or tags.get("brand") or tags.get("operator") or "Ponto próximo"
            distance_meters = _haversine_distance_meters(
                latitude,
                longitude,
                float(point_latitude),
                float(point_longitude),
            )
            normalized_text = _normalize_text(
                " ".join(
                    filter(
                        None,
                        [
                            name,
                            tags.get("description"),
                            tags.get("operator"),
                            tags.get("amenity"),
                            tags.get("recycling_type"),
                        ],
                    )
                )
            )

            score, match_reasons = self._score_candidate(
                profile,
                tags,
                normalized_text,
                distance_meters,
            )
            confidence = _confidence_label(score)
            dedupe_key = (
                _normalize_text(name),
                round(float(point_latitude), 5),
                round(float(point_longitude), 5),
            )
            if dedupe_key in seen_keys:
                continue
            seen_keys.add(dedupe_key)

            candidates.append(
                {
                    "id": f"osm-{element.get('type', 'point')}-{element.get('id')}",
                    "name": name,
                    "latitude": round(float(point_latitude), 6),
                    "longitude": round(float(point_longitude), 6),
                    "distance_meters": distance_meters,
                    "distance_km": round(distance_meters / 1000, 1),
                    "address": _build_address(tags),
                    "category_label": _category_label(tags, normalized_text),
                    "acceptance_confidence": confidence,
                    "acceptance_summary": _acceptance_label(profile, confidence),
                    "match_reasons": match_reasons,
                    "osm_url": _build_osm_url(float(point_latitude), float(point_longitude)),
                    "directions_url": _build_directions_url(
                        latitude,
                        longitude,
                        float(point_latitude),
                        float(point_longitude),
                    ),
                    "source": "OpenStreetMap",
                    "score": score,
                }
            )

        candidates.sort(key=lambda item: (-int(item["score"]), int(item["distance_meters"])))
        max_results = min(profile.max_results, self.max_results)
        return candidates[:max_results]

    def find_nearby(
        self,
        *,
        disposal_stream: str,
        latitude: float,
        longitude: float,
        location_context: SearchLocationContext | None = None,
    ) -> dict[str, Any]:
        profile = self._profile_for_stream(disposal_stream)
        cache_key = self._cache_key(disposal_stream, latitude, longitude)
        cached = self._get_cached(cache_key)
        if cached is not None:
            return cached

        catalog_points = self._catalog_points_for_stream(
            profile,
            latitude,
            longitude,
            location_context,
        )
        if catalog_points:
            payload = {
                "stream": disposal_stream,
                "stream_label": profile.stream_label,
                "radius_meters": profile.radius_meters,
                "points": self._prepare_points_for_response(catalog_points),
                "disclaimer": profile.disclaimer,
                "source": "Catálogo local",
                "status": "ok",
                "warning": None,
            }
            self._set_cached(cache_key, payload)
            return payload

        try:
            query = self._build_query(profile, latitude, longitude)
            raw_payload, overpass_url = self._request_overpass(query)
            points = self._extract_points(profile, latitude, longitude, raw_payload)
            warning = None
            source = f"OpenStreetMap via {overpass_url}"

            if not points:
                fallback_points, fallback_warning, fallback_source = self._fallback_search_points(
                    profile,
                    latitude,
                    longitude,
                    location_context,
                )
                if fallback_points:
                    points = fallback_points
                    warning = fallback_warning
                    source = fallback_source or "Busca textual aberta"

            payload = {
                "stream": disposal_stream,
                "stream_label": profile.stream_label,
                "radius_meters": profile.radius_meters,
                "points": points if source == "Photon" else self._prepare_points_for_response(points),
                "disclaimer": profile.disclaimer,
                "source": source,
                "status": "ok",
                "warning": warning,
            }
            self._set_cached(cache_key, payload)
        except requests.RequestException as error:
            logger.warning("Falha ao consultar pontos de descarte proximos: %s", error)
            fallback_points, fallback_warning, fallback_source = self._fallback_search_points(
                profile,
                latitude,
                longitude,
                location_context,
            )
            if fallback_points:
                payload = {
                    "stream": disposal_stream,
                    "stream_label": profile.stream_label,
                    "radius_meters": profile.radius_meters,
                    "points": fallback_points,
                    "disclaimer": profile.disclaimer,
                    "source": fallback_source or "Busca textual aberta",
                    "status": "ok",
                    "warning": fallback_warning,
                }
                self._set_cached(cache_key, payload)
                return payload

            payload = {
                "stream": disposal_stream,
                "stream_label": profile.stream_label,
                "radius_meters": profile.radius_meters,
                "points": [],
                "disclaimer": profile.disclaimer,
                "source": "OpenStreetMap",
                "status": "ok",
                "warning": "Não encontramos pontos confiáveis perto de você na base aberta agora. Tente uma busca local por ecoponto ou coleta seletiva na sua cidade.",
            }
        return payload
