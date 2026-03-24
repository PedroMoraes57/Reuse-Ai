from __future__ import annotations

import unicodedata
from dataclasses import asdict, dataclass
from typing import Any

from geopy.exc import GeocoderServiceError, GeocoderTimedOut
from geopy.geocoders import Nominatim


BRAZIL_STATE_CODES = {
    "ACRE": "AC",
    "ALAGOAS": "AL",
    "AMAPA": "AP",
    "AMAZONAS": "AM",
    "BAHIA": "BA",
    "CEARA": "CE",
    "DISTRITO_FEDERAL": "DF",
    "ESPIRITO_SANTO": "ES",
    "GOIAS": "GO",
    "MARANHAO": "MA",
    "MATO_GROSSO": "MT",
    "MATO_GROSSO_DO_SUL": "MS",
    "MINAS_GERAIS": "MG",
    "PARA": "PA",
    "PARAIBA": "PB",
    "PARANA": "PR",
    "PERNAMBUCO": "PE",
    "PIAUI": "PI",
    "RIO_DE_JANEIRO": "RJ",
    "RIO_GRANDE_DO_NORTE": "RN",
    "RIO_GRANDE_DO_SUL": "RS",
    "RONDONIA": "RO",
    "RORAIMA": "RR",
    "SANTA_CATARINA": "SC",
    "SAO_PAULO": "SP",
    "SERGIPE": "SE",
    "TOCANTINS": "TO",
}


def normalize_region_token(value: str | None) -> str | None:
    if not value:
        return None
    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    return "_".join(ascii_value.upper().split())


@dataclass
class LocationContext:
    latitude: float | None
    longitude: float | None
    country_code: str | None
    state_name: str | None
    state_code: str | None
    city: str | None
    display_name: str | None
    region_keys: list[str]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class LocationResolver:
    def __init__(self, user_agent: str, timeout_seconds: int) -> None:
        self.geocoder = Nominatim(user_agent=user_agent, timeout=timeout_seconds)

    def resolve(
        self,
        latitude: float | None = None,
        longitude: float | None = None,
        country_code: str | None = None,
        state: str | None = None,
        state_code: str | None = None,
        city: str | None = None,
    ) -> LocationContext:
        reverse_payload: dict[str, Any] = {}
        if latitude is not None and longitude is not None:
            try:
                location = self.geocoder.reverse((latitude, longitude), language="pt-BR")
                reverse_payload = location.raw if location else {}
            except (GeocoderTimedOut, GeocoderServiceError, ValueError):
                reverse_payload = {}

        address = reverse_payload.get("address", {})
        detected_country_code = (address.get("country_code") or country_code or "").upper() or None
        detected_state_name = state or address.get("state")
        detected_city = city or address.get("city") or address.get("town") or address.get("village")
        detected_state_code = state_code or address.get("state_code")

        if detected_country_code == "BR" and not detected_state_code and detected_state_name:
            detected_state_code = BRAZIL_STATE_CODES.get(normalize_region_token(detected_state_name))

        region_keys = build_region_keys(detected_country_code, detected_state_code, detected_city)

        return LocationContext(
            latitude=latitude,
            longitude=longitude,
            country_code=detected_country_code,
            state_name=detected_state_name,
            state_code=detected_state_code,
            city=detected_city,
            display_name=reverse_payload.get("display_name"),
            region_keys=region_keys,
        )


def build_region_keys(
    country_code: str | None,
    state_code: str | None = None,
    city: str | None = None,
) -> list[str]:
    if not country_code:
        return []

    country_token = normalize_region_token(country_code)
    state_token = normalize_region_token(state_code)
    city_token = normalize_region_token(city)

    keys: list[str] = []
    if country_token and state_token and city_token:
        keys.append(f"{country_token}-{state_token}-{city_token}")
    if country_token and state_token:
        keys.append(f"{country_token}-{state_token}")
    if country_token:
        keys.append(country_token)
    return keys
