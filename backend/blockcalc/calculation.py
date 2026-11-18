from decimal import Decimal, ROUND_HALF_UP, localcontext
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from .settings import Count, Mix, SettingsRead

KILOGRAMS_PER_TON = Decimal(1000)
CEMENT_BAG_KILOGRAMS = Decimal(50)


class MaterialOrder(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    full_quantity: Count
    half_quantity: Count
    mix_id: Annotated[int, Field(strict=True, ge=1, le=4)] | None = None

    @model_validator(mode="after")
    def require_blocks(self) -> Self:
        if self.full_quantity == 0 and self.half_quantity == 0:
            raise ValueError("An order must contain at least one block")
        return self


class MaterialCost(BaseModel):
    model_config = ConfigDict(frozen=True)

    tons: Decimal
    price_per_ton: Decimal | None
    cost: Decimal


class MaterialCalculation(BaseModel):
    model_config = ConfigDict(frozen=True)

    mix_id: int
    currency: str
    full_batches: int
    half_batches: int
    total_batches: int
    full_surplus: int
    half_surplus: int
    sand: MaterialCost
    stone: MaterialCost
    cement: MaterialCost
    total_cost: Decimal


class MissingCalculationInputs(ValueError):
    """Required settings or the selected mix are unavailable."""

    def __init__(self, fields: list[str]):
        self.fields = tuple(fields)
        super().__init__("Missing required calculation inputs: " + ", ".join(fields))


def _require_inputs(order: MaterialOrder, settings: SettingsRead) -> Mix:
    mix = next((mix for mix in settings.mixes if mix.id == order.mix_id), None)
    if mix is None:
        raise MissingCalculationInputs(["mix_id"])

    required = {}
    if order.full_quantity:
        required["full_yield"] = mix.full_yield
    if order.half_quantity:
        required["half_yield"] = mix.half_yield
    if mix.sand_wheelbarrows:
        required["sand_kg_per_wheelbarrow"] = settings.sand_kg_per_wheelbarrow
        required["sand_price_per_ton"] = settings.sand_price_per_ton
    if mix.stone_wheelbarrows:
        required["stone_kg_per_wheelbarrow"] = settings.stone_kg_per_wheelbarrow
        required["stone_price_per_ton"] = settings.stone_price_per_ton
    if mix.cement_bags:
        required["cement_price_per_ton"] = settings.cement_price_per_ton

    missing = [field for field, value in required.items() if value is None]
    if missing:
        raise MissingCalculationInputs(missing)
    return mix


def _batch_count(quantity: int, yield_per_batch: int | None) -> int:
    if quantity == 0:
        return 0
    assert yield_per_batch is not None
    return (quantity + yield_per_batch - 1) // yield_per_batch


def _material_cost(
    batches: int,
    units_per_batch: Decimal,
    kilograms_per_unit: Decimal | None,
    price_per_ton: Decimal | None,
) -> MaterialCost:
    if units_per_batch == 0:
        return MaterialCost(tons=Decimal(0), price_per_ton=price_per_ton, cost=Decimal(0))
    assert kilograms_per_unit is not None and price_per_ton is not None
    tons = batches * units_per_batch * kilograms_per_unit / KILOGRAMS_PER_TON
    return MaterialCost(tons=tons, price_per_ton=price_per_ton, cost=tons * price_per_ton)


def calculate_materials(order: MaterialOrder, settings: SettingsRead) -> MaterialCalculation:
    """Calculate whole batches and material costs from validated order and settings values.

    Missing inputs are reported together. Only yields for ordered sizes and inputs
    for materials used by the selected recipe are required. Material quantities
    and item costs retain their precision. The final total uses ROUND_HALF_UP.
    """
    mix = _require_inputs(order, settings)
    full_batches = _batch_count(order.full_quantity, mix.full_yield)
    half_batches = _batch_count(order.half_quantity, mix.half_yield)
    total_batches = full_batches + half_batches

    decimal_inputs = [
        mix.sand_wheelbarrows, mix.stone_wheelbarrows, mix.cement_bags,
        settings.sand_kg_per_wheelbarrow, settings.stone_kg_per_wheelbarrow,
        settings.sand_price_per_ton, settings.stone_price_per_ton, settings.cement_price_per_ton,
    ]
    # Reserve enough digits and decimal places for exact products, their sum, and cents.
    precision = len(str(total_batches)) + 10 + sum(
        len(value.as_tuple().digits) + abs(value.as_tuple().exponent)
        for value in decimal_inputs if value is not None
    )
    with localcontext(prec=precision):
        sand = _material_cost(
            total_batches, mix.sand_wheelbarrows,
            settings.sand_kg_per_wheelbarrow, settings.sand_price_per_ton,
        )
        stone = _material_cost(
            total_batches, mix.stone_wheelbarrows,
            settings.stone_kg_per_wheelbarrow, settings.stone_price_per_ton,
        )
        cement = _material_cost(
            total_batches, mix.cement_bags, CEMENT_BAG_KILOGRAMS, settings.cement_price_per_ton,
        )
        total_cost = (sand.cost + stone.cost + cement.cost).quantize(
            Decimal("0.01"), rounding=ROUND_HALF_UP,
        )

    return MaterialCalculation(
        mix_id=mix.id,
        currency=settings.currency,
        full_batches=full_batches,
        half_batches=half_batches,
        total_batches=total_batches,
        full_surplus=full_batches * (mix.full_yield or 0) - order.full_quantity,
        half_surplus=half_batches * (mix.half_yield or 0) - order.half_quantity,
        sand=sand,
        stone=stone,
        cement=cement,
        total_cost=total_cost,
    )
