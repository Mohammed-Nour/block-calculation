import json
import unittest
from decimal import Decimal, getcontext, localcontext

from pydantic import ValidationError

from blockcalc.calculation import MaterialOrder, MissingCalculationInputs, calculate_materials
from blockcalc.settings import SettingsRead


def configured_settings() -> SettingsRead:
    return SettingsRead(
        currency="RUB",
        sand_price_per_ton="10",
        stone_price_per_ton="20",
        cement_price_per_ton="100",
        full_molds=50,
        half_molds=15,
        sand_kg_per_wheelbarrow="100",
        stone_kg_per_wheelbarrow="120",
        version=1,
        updated_at="2026-11-17T15:00:00Z",
        mixes=[
            {
                "id": mix_id,
                "name": f"Mix {mix_id}",
                "sand_wheelbarrows": sand,
                "stone_wheelbarrows": stone,
                "cement_bags": "1",
                "full_yield": 35,
                "half_yield": 60,
            }
            for mix_id, sand, stone in (
                (1, "3", "0"), (2, "3", "2"), (3, "2.5", "2.5"), (4, "2", "2"),
            )
        ],
    )


class MaterialCalculationTests(unittest.TestCase):
    def test_all_four_mixes_match_expected_materials_and_costs(self):
        cases = [
            # Mix 1 and Mix 2 include the study's worked acceptance examples.
            {
                "mix_id": 1,
                "yields": (22, 40),
                "batches": (78, 8),
                "surplus": (16, 20),
                "tons": ("25.8", "0", "4.3"),
                "costs": ("258", "0", "430"),
                "total_cost": "688.00",
            },
            {
                "mix_id": 2,
                "yields": (35, 60),
                "batches": (49, 5),
                "surplus": (15, 0),
                "tons": ("16.2", "12.96", "2.7"),
                "costs": ("162", "259.2", "270"),
                "total_cost": "691.20",
            },
            {
                "mix_id": 3,
                "yields": (35, 60),
                "batches": (49, 5),
                "surplus": (15, 0),
                "tons": ("13.5", "16.2", "2.7"),
                "costs": ("135", "324", "270"),
                "total_cost": "729.00",
            },
            {
                "mix_id": 4,
                "yields": (35, 60),
                "batches": (49, 5),
                "surplus": (15, 0),
                "tons": ("10.8", "12.96", "2.7"),
                "costs": ("108", "259.2", "270"),
                "total_cost": "637.20",
            },
        ]
        for case in cases:
            with self.subTest(mix_id=case["mix_id"]):
                settings = configured_settings()
                mix = settings.mixes[case["mix_id"] - 1]
                mix.full_yield, mix.half_yield = case["yields"]
                order = MaterialOrder(full_quantity=1700, half_quantity=300, mix_id=case["mix_id"])

                result = calculate_materials(order, settings)

                self.assertEqual((result.mix_id, result.currency), (case["mix_id"], "RUB"))
                self.assertEqual((result.full_batches, result.half_batches), case["batches"])
                self.assertEqual(result.total_batches, sum(case["batches"]))
                self.assertEqual((result.full_surplus, result.half_surplus), case["surplus"])
                self.assertEqual(
                    (result.sand.tons, result.stone.tons, result.cement.tons),
                    tuple(Decimal(value) for value in case["tons"]),
                )
                self.assertEqual(
                    (result.sand.cost, result.stone.cost, result.cement.cost),
                    tuple(Decimal(value) for value in case["costs"]),
                )
                self.assertEqual(
                    (result.sand.price_per_ton, result.stone.price_per_ton, result.cement.price_per_ton),
                    (Decimal("10"), Decimal("20"), Decimal("100")),
                )
                self.assertEqual(result.total_cost, Decimal(case["total_cost"]))
                self.assertEqual(str(result.total_cost), case["total_cost"])
                self.assertEqual((order.full_quantity, order.half_quantity), (1700, 300))

    def test_matching_yields_and_batch_boundaries(self):
        for full, half, full_batches, half_batches, full_surplus, half_surplus in (
            (1, 2, 1, 1, 34, 58),
            (35, 60, 1, 1, 0, 0),
            (36, 61, 2, 2, 34, 59),
            (1, 0, 1, 0, 34, 0),
            (0, 61, 0, 2, 0, 59),
        ):
            with self.subTest(full=full, half=half):
                settings = configured_settings()
                mix = settings.mixes[1]
                if full == 0:
                    mix.full_yield = None
                if half == 0:
                    mix.half_yield = None
                result = calculate_materials(
                    MaterialOrder(full_quantity=full, half_quantity=half, mix_id=2), settings,
                )
                self.assertEqual((result.full_batches, result.half_batches), (full_batches, half_batches))
                self.assertEqual((result.full_surplus, result.half_surplus), (full_surplus, half_surplus))

    def test_missing_prices_weights_and_yields_are_identified_for_every_mix(self):
        fields = [
            "sand_price_per_ton", "sand_kg_per_wheelbarrow",
            "cement_price_per_ton", "full_yield", "half_yield",
        ]
        for mix_id in range(1, 5):
            required = fields if mix_id == 1 else fields + ["stone_price_per_ton", "stone_kg_per_wheelbarrow"]
            for field in required:
                with self.subTest(mix_id=mix_id, field=field):
                    settings = configured_settings()
                    target = settings.mixes[mix_id - 1] if field.endswith("_yield") else settings
                    setattr(target, field, None)
                    with self.assertRaises(MissingCalculationInputs) as error:
                        calculate_materials(
                            MaterialOrder(full_quantity=1, half_quantity=1, mix_id=mix_id), settings,
                        )
                    self.assertEqual(error.exception.fields, (field,))
                    self.assertIn(field, str(error.exception))

    def test_missing_inputs_are_reported_together(self):
        settings = configured_settings()
        settings.sand_price_per_ton = None
        settings.cement_price_per_ton = None
        settings.mixes[1].full_yield = None
        settings.mixes[1].half_yield = None
        with self.assertRaises(MissingCalculationInputs) as error:
            calculate_materials(MaterialOrder(full_quantity=1, half_quantity=1, mix_id=2), settings)
        self.assertCountEqual(
            error.exception.fields,
            ("sand_price_per_ton", "cement_price_per_ton", "full_yield", "half_yield"),
        )

    def test_mix_1_calculates_without_stone_inputs(self):
        settings = configured_settings()
        settings.stone_price_per_ton = None
        settings.stone_kg_per_wheelbarrow = None
        settings.mixes[0].full_yield = 22
        settings.mixes[0].half_yield = 40
        result = calculate_materials(MaterialOrder(full_quantity=1700, half_quantity=300, mix_id=1), settings)
        self.assertEqual(result.total_cost, Decimal("688.00"))
        self.assertEqual((result.stone.tons, result.stone.cost), (Decimal(0), Decimal(0)))
        self.assertIsNone(result.stone.price_per_ton)

    def test_other_mixes_do_not_require_configured_yields(self):
        settings = configured_settings()
        for mix in settings.mixes[1:]:
            mix.full_yield = None
            mix.half_yield = None
        result = calculate_materials(MaterialOrder(full_quantity=35, half_quantity=60, mix_id=1), settings)
        self.assertEqual(result.total_batches, 2)

    def test_missing_or_unavailable_selected_mix_blocks_calculation(self):
        settings = configured_settings()
        orders = [
            MaterialOrder(full_quantity=1, half_quantity=0),
            MaterialOrder(full_quantity=1, half_quantity=0, mix_id=2),
        ]
        settings.mixes = [mix for mix in settings.mixes if mix.id != 2]
        for order in orders:
            with self.subTest(mix_id=order.mix_id):
                with self.assertRaises(MissingCalculationInputs) as error:
                    calculate_materials(order, settings)
                self.assertEqual(error.exception.fields, ("mix_id",))

    def test_invalid_quantities_and_mix_choices_are_rejected(self):
        for field in ("full_quantity", "half_quantity"):
            for value in (-1, 1.5, True, "1", 2**63):
                with self.subTest(field=field, value=value), self.assertRaises(ValidationError):
                    MaterialOrder(**({"full_quantity": 1, "half_quantity": 1, "mix_id": 1} | {field: value}))
        with self.assertRaisesRegex(ValidationError, "at least one block"):
            MaterialOrder(full_quantity=0, half_quantity=0, mix_id=1)
        for mix_id in (0, 5, True, "1"):
            with self.subTest(mix_id=mix_id), self.assertRaises(ValidationError):
                MaterialOrder(full_quantity=1, half_quantity=0, mix_id=mix_id)

    def test_large_quantities_keep_exact_integer_batch_counts(self):
        settings = configured_settings()
        settings.mixes[0].full_yield = 1
        result = calculate_materials(
            MaterialOrder(full_quantity=9_007_199_254_740_993, half_quantity=0, mix_id=1), settings,
        )
        self.assertEqual(result.full_batches, 9_007_199_254_740_993)
        self.assertEqual(result.full_surplus, 0)

    def test_only_the_final_total_is_rounded(self):
        settings = configured_settings()
        settings.sand_price_per_ton = Decimal("0.01")
        settings.stone_price_per_ton = Decimal("0.01")
        settings.cement_price_per_ton = Decimal("0.08")
        result = calculate_materials(MaterialOrder(full_quantity=1, half_quantity=0, mix_id=2), settings)
        self.assertEqual(result.sand.cost, Decimal("0.003"))
        self.assertEqual(result.stone.cost, Decimal("0.0024"))
        self.assertEqual(result.cement.cost, Decimal("0.004"))
        self.assertEqual(result.total_cost, Decimal("0.01"))

    def test_final_half_cent_rounds_up(self):
        settings = configured_settings()
        settings.sand_price_per_ton = Decimal(0)
        settings.cement_price_per_ton = Decimal("0.10")
        result = calculate_materials(MaterialOrder(full_quantity=1, half_quantity=0, mix_id=1), settings)
        self.assertEqual(result.cement.cost, Decimal("0.005"))
        self.assertEqual(result.total_cost, Decimal("0.01"))

    def test_configured_zero_prices_are_valid(self):
        settings = configured_settings()
        settings.sand_price_per_ton = Decimal(0)
        settings.stone_price_per_ton = Decimal(0)
        settings.cement_price_per_ton = Decimal(0)
        result = calculate_materials(MaterialOrder(full_quantity=1, half_quantity=0, mix_id=2), settings)
        self.assertEqual(result.total_cost, Decimal("0.00"))
        self.assertEqual(result.sand.tons, Decimal("0.3"))

    def test_decimal_precision_is_preserved_and_isolated_from_the_caller(self):
        settings = configured_settings()
        settings.sand_kg_per_wheelbarrow = Decimal("12345678901234567890.123456789")
        settings.sand_price_per_ton = Decimal("0.00000001")
        settings.cement_price_per_ton = Decimal(0)
        with localcontext(prec=6):
            result = calculate_materials(MaterialOrder(full_quantity=1, half_quantity=0, mix_id=1), settings)
            self.assertEqual(getcontext().prec, 6)
        self.assertEqual(result.sand.tons, Decimal("37037036703703703.670370370367"))
        self.assertEqual(result.sand.cost, Decimal("370370367.03703703670370370367"))
        self.assertEqual(result.total_cost, Decimal("370370367.04"))

    def test_calculation_preserves_inputs_and_serializes_decimal_results_as_strings(self):
        settings = configured_settings()
        before = settings.model_dump_json()
        order = MaterialOrder(full_quantity=1700, half_quantity=300, mix_id=2)
        result = calculate_materials(order, settings)
        serialized = json.loads(result.model_dump_json())
        self.assertEqual(serialized["total_cost"], "691.20")
        self.assertEqual(serialized["sand"]["tons"], "16.2")
        self.assertEqual(serialized["stone"]["price_per_ton"], "20")
        self.assertEqual(settings.model_dump_json(), before)
        self.assertEqual(order.full_quantity, 1700)
