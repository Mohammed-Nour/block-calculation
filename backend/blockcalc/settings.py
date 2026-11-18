import json
import re
import sqlite3
from datetime import datetime
from decimal import Decimal
from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import (
    BaseModel,
    BeforeValidator,
    ConfigDict,
    Field,
    PlainSerializer,
    StringConstraints,
    field_validator,
)

from .db import transaction

router = APIRouter(prefix="/api/settings", tags=["Settings"])

Material = Literal["sand", "stone", "cement"]
MIX_IDS = {1, 2, 3, 4}
SQLITE_MAX_INT = 2**63 - 1


def decimal_string(value: object) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"[0-9]+(?:\.[0-9]+)?", value):
        raise ValueError("Use a nonnegative decimal string, such as \"10.50\"")
    return value


DecimalString = Annotated[
    Decimal,
    BeforeValidator(decimal_string, json_schema_input_type=str),
    PlainSerializer(lambda value: format(value, "f"), return_type=str, when_used="json"),
]
Price = Annotated[DecimalString, Field(ge=0)]
Weight = Annotated[DecimalString, Field(gt=0)]
Count = Annotated[int, Field(strict=True, ge=0, le=SQLITE_MAX_INT)]
PositiveCount = Annotated[int, Field(strict=True, gt=0, le=SQLITE_MAX_INT)]
Currency = Annotated[str, StringConstraints(strip_whitespace=True, to_upper=True, pattern=r"^[A-Za-z]{3}$")]


class SettingsValues(BaseModel):
    model_config = ConfigDict(extra="forbid")

    currency: Currency
    sand_price_per_ton: Price | None
    stone_price_per_ton: Price | None
    cement_price_per_ton: Price | None
    full_molds: Count
    half_molds: Count
    sand_kg_per_wheelbarrow: Weight | None
    stone_kg_per_wheelbarrow: Weight | None


class MixYield(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: Annotated[int, Field(strict=True, ge=1, le=4)]
    full_yield: PositiveCount | None
    half_yield: PositiveCount | None


class Mix(MixYield):
    name: str
    sand_wheelbarrows: DecimalString
    stone_wheelbarrows: DecimalString
    cement_bags: DecimalString


class SettingsRead(SettingsValues):
    version: PositiveCount
    updated_at: datetime
    mixes: list[Mix]


class SettingsUpdate(SettingsValues):
    version: PositiveCount
    mix_yields: Annotated[list[MixYield], Field(min_length=4, max_length=4)]
    confirmed_zero_prices: set[Material] = Field(default_factory=set)

    @field_validator("mix_yields")
    @classmethod
    def require_all_mixes(cls, yields: list[MixYield]) -> list[MixYield]:
        if {mix.id for mix in yields} != MIX_IDS:
            raise ValueError("Include exactly one yield entry for each of Mix 1 through Mix 4")
        return yields


def get_database_path(request: Request) -> Path:
    return request.app.state.database_path


DatabasePath = Annotated[Path, Depends(get_database_path)]


def read_settings(connection: sqlite3.Connection) -> SettingsRead:
    settings = connection.execute("""
        SELECT version, currency, sand_price_per_ton, stone_price_per_ton, cement_price_per_ton,
               full_molds, half_molds, sand_kg_per_wheelbarrow, stone_kg_per_wheelbarrow, updated_at
        FROM settings WHERE id = 1
    """).fetchone()
    mixes = connection.execute("""
        SELECT id, name, sand_wheelbarrows, stone_wheelbarrows, cement_bags, full_yield, half_yield
        FROM mixes ORDER BY id
    """).fetchall()
    return SettingsRead(**dict(settings), mixes=[dict(mix) for mix in mixes])


@router.get("", summary="Read material and production settings")
def get_settings(path: DatabasePath) -> SettingsRead:
    with transaction(path) as connection:
        return read_settings(connection)


@router.put(
    "",
    summary="Replace material and production settings",
    responses={409: {"description": "Settings have changed since the submitted version"}},
)
def update_settings(update: SettingsUpdate, path: DatabasePath) -> SettingsRead:
    with transaction(path, write=True) as connection:
        current = read_settings(connection)
        if update.version != current.version:
            raise HTTPException(
                status_code=409,
                detail={
                    "message": "Settings have changed. Reload them before saving.",
                    "current_version": current.version,
                },
            )

        unconfirmed = []
        for material in ("sand", "stone", "cement"):
            field = f"{material}_price_per_ton"
            if (
                getattr(update, field) == 0
                and getattr(current, field) != 0
                and material not in update.confirmed_zero_prices
            ):
                unconfirmed.append({
                    "loc": ["body", field],
                    "msg": "Confirm the zero price before saving",
                    "type": "value_error.zero_price_confirmation",
                })
        if unconfirmed:
            raise HTTPException(status_code=422, detail=unconfirmed)

        values = update.model_dump(mode="json", exclude={"version", "mix_yields", "confirmed_zero_prices"})
        connection.execute("""
            UPDATE settings SET
                version = version + 1,
                currency = :currency,
                sand_price_per_ton = :sand_price_per_ton,
                stone_price_per_ton = :stone_price_per_ton,
                cement_price_per_ton = :cement_price_per_ton,
                full_molds = :full_molds,
                half_molds = :half_molds,
                sand_kg_per_wheelbarrow = :sand_kg_per_wheelbarrow,
                stone_kg_per_wheelbarrow = :stone_kg_per_wheelbarrow,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE id = 1
        """, values)
        connection.executemany("""
            UPDATE mixes SET full_yield = :full_yield, half_yield = :half_yield WHERE id = :id
        """, [mix.model_dump() for mix in update.mix_yields])

        snapshot = read_settings(connection)
        details = {"previous_version": current.version, "settings": snapshot.model_dump(mode="json")}
        connection.execute("""
            INSERT INTO audit_events (event_type, actor_id, details_json)
            VALUES ('settings.updated', 'local-user', ?)
        """, (json.dumps(details),))
        return snapshot
