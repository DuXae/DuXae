"""Тесты расчётного ядра."""

from __future__ import annotations

import unittest

from liftcalc.calc import (
    LiftInput,
    compute,
)


def sample(**overrides) -> LiftInput:
    base = dict(height_m=2.8, run_m=3.4, width_m=1.10, steps=15)
    base.update(overrides)
    return LiftInput(**base)


class GeometryTests(unittest.TestCase):
    def test_angle_matches_pythagoras(self) -> None:
        result = compute(sample())
        # atan2(2.8, 3.4) = 39.47°
        self.assertAlmostEqual(result.angle_deg, 39.47, places=2)
        self.assertAlmostEqual(result.slope_length_m, 4.405, places=3)

    def test_rail_has_two_end_reserves(self) -> None:
        result = compute(sample())
        self.assertAlmostEqual(result.rail_length_m, result.slope_length_m + 0.70, places=6)

    def test_turn_adds_extra_rail(self) -> None:
        straight = compute(sample(track="straight"))
        turn = compute(sample(track="turn"))
        self.assertAlmostEqual(turn.rail_length_m - straight.rail_length_m, 1.60, places=6)

    def test_supports_are_at_least_two(self) -> None:
        short = compute(sample(height_m=0.6, run_m=1.2, steps=4))
        self.assertGreaterEqual(short.supports, 2)

    def test_step_height(self) -> None:
        result = compute(sample(steps=14))
        self.assertAlmostEqual(result.step_height_mm, 200.0, places=3)


class PhysicsTests(unittest.TestCase):
    def test_heavier_load_needs_more_force(self) -> None:
        light = compute(sample(payload_kg=120))
        heavy = compute(sample(payload_kg=350))
        self.assertGreater(heavy.traction_force_n, light.traction_force_n)
        self.assertGreater(heavy.motor_power_kw, light.motor_power_kw)

    def test_moving_mass_includes_platform(self) -> None:
        result = compute(sample(payload_kg=200, kind="platform"))
        self.assertAlmostEqual(result.moving_mass_kg, 320.0)

    def test_seat_is_lighter(self) -> None:
        platform = compute(sample(kind="platform"))
        seat = compute(sample(kind="seat"))
        self.assertLess(seat.moving_mass_kg, platform.moving_mass_kg)

    def test_travel_time(self) -> None:
        result = compute(sample())
        self.assertAlmostEqual(result.travel_time_s, result.slope_length_m / 0.10, places=6)

    def test_load_per_support_lower_for_more_supports(self) -> None:
        result = compute(sample())
        self.assertAlmostEqual(
            result.load_per_support_n * result.supports,
            result.moving_mass_kg * 9.81 * __import__("math").cos(__import__("math").radians(result.angle_deg)),
            places=3,
        )


class PriceTests(unittest.TestCase):
    def test_base_price_includes_three_metres(self) -> None:
        result = compute(sample(height_m=1.0, run_m=1.6, steps=6))
        self.assertLess(result.rail_length_m, 3.0)
        self.assertEqual(result.price.extra_rail, 0.0)

    def test_extra_rail_charged_above_three_metres(self) -> None:
        result = compute(sample())
        expected = (result.rail_length_m - 3.0) * 42_000
        self.assertAlmostEqual(result.price.extra_rail, expected, places=2)

    def test_turn_and_wheelchair_are_paid_options(self) -> None:
        base = compute(sample(track="straight", kind="seat"))
        full = compute(sample(track="turn", kind="platform"))
        self.assertEqual(base.price.turn, 0.0)
        self.assertEqual(base.price.wheelchair, 0.0)
        self.assertGreater(full.price.turn, 0.0)
        self.assertGreater(full.price.wheelchair, 0.0)

    def test_total_is_sum_of_parts(self) -> None:
        p = compute(sample()).price
        self.assertAlmostEqual(p.total, p.base + p.extra_rail + p.turn + p.wheelchair + p.installation, places=6)


class WarningTests(unittest.TestCase):
    def test_steep_stair_is_infeasible(self) -> None:
        result = compute(sample(height_m=4.0, run_m=1.5, steps=20))
        self.assertFalse(result.is_feasible)

    def test_flat_stair_is_infeasible(self) -> None:
        result = compute(sample(height_m=0.7, run_m=6.0, steps=4))
        self.assertFalse(result.is_feasible)

    def test_narrow_stair_is_infeasible(self) -> None:
        result = compute(sample(width_m=0.8))
        self.assertFalse(result.is_feasible)

    def test_typical_stair_is_feasible(self) -> None:
        result = compute(sample())
        self.assertTrue(result.is_feasible)

    def test_payload_above_400_warns(self) -> None:
        result = compute(sample(payload_kg=450))
        self.assertTrue(any(w.level == "warn" for w in result.warnings))


class ValidationTests(unittest.TestCase):
    def test_negative_height_rejected(self) -> None:
        with self.assertRaises(ValueError):
            compute(sample(height_m=-1))

    def test_single_step_rejected(self) -> None:
        with self.assertRaises(ValueError):
            compute(sample(steps=1))

    def test_unknown_track_rejected(self) -> None:
        with self.assertRaises(ValueError):
            compute(sample(track="spiral"))


class SerializationTests(unittest.TestCase):
    def test_to_dict_is_json_ready(self) -> None:
        import json

        payload = compute(sample()).to_dict()
        encoded = json.dumps(payload, ensure_ascii=False)
        self.assertIn("angle_deg", encoded)
        self.assertTrue(payload["feasible"])


if __name__ == "__main__":
    unittest.main()
