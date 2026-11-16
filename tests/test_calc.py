"""Тесты расчётного ядра."""

from __future__ import annotations

import json
import math
import unittest

from platformcalc.calc import (
    StairInput,
    Step,
    compute,
    uniform_stair,
)


def base_input(**overrides) -> StairInput:
    """12 ступеней 160×320, площадки по метру, марш 1100 мм."""
    params = dict(
        steps=uniform_stair(12, 160, 320),
        lower_platform_mm=1000.0,
        upper_platform_mm=1000.0,
        width_mm=1100.0,
        ramp="normal",
    )
    params.update(overrides)
    return StairInput(**params)


class GeometryTests(unittest.TestCase):
    def test_rise_is_sum_of_risers(self) -> None:
        result = compute(base_input())
        self.assertEqual(result.rise_mm, 12 * 160)

    def test_steps_run_ignores_last_tread(self) -> None:
        result = compute(base_input())
        self.assertEqual(result.steps_run_mm, 11 * 320)

    def test_total_run_includes_landings(self) -> None:
        result = compute(base_input(lower_platform_mm=1200, upper_platform_mm=800))
        self.assertEqual(result.total_run_mm, 1200 + 11 * 320 + 800)

    def test_angle_follows_arc_tangent(self) -> None:
        result = compute(base_input())
        expected = math.degrees(math.atan2(1920, 3520))
        self.assertAlmostEqual(result.angle_deg, expected, places=6)
        self.assertAlmostEqual(result.angle_deg, 28.61, places=2)

    def test_slope_is_hypotenuse(self) -> None:
        result = compute(base_input())
        self.assertAlmostEqual(result.slope_length_mm, math.hypot(1920, 3520), places=6)

    def test_rail_has_two_tails(self) -> None:
        result = compute(base_input())
        self.assertAlmostEqual(result.rail_length_mm, result.slope_length_mm + 500, places=6)

    def test_supports_cover_rail(self) -> None:
        result = compute(base_input())
        self.assertEqual(result.supports, math.ceil(result.rail_length_mm / 1500))
        self.assertGreaterEqual(result.supports, 2)

    def test_zero_treads_make_vertical_climb(self) -> None:
        steps = tuple(Step(rise_mm=150, tread_mm=0) for _ in range(5))
        result = compute(base_input(steps=steps))
        self.assertAlmostEqual(result.angle_deg, 90.0)
        self.assertFalse(result.is_feasible)


class PlatformTests(unittest.TestCase):
    def test_normal_ramp_keeps_base_length(self) -> None:
        result = compute(base_input(ramp="normal"))
        self.assertEqual(result.platform.length_mm, 1100)

    def test_extended_ramps_add_length(self) -> None:
        for ramp, delta in (("ext50", 50), ("ext100", 100), ("ext150", 150)):
            result = compute(base_input(ramp=ramp))
            self.assertEqual(result.platform.length_mm, 1100 + delta)

    def test_short_npu_reduces_length(self) -> None:
        result = compute(base_input(ramp="short_npu"))
        self.assertEqual(result.platform.length_mm, 950)

    def test_platform_width_keeps_margins(self) -> None:
        result = compute(base_input(width_mm=1300))
        self.assertEqual(result.platform.width_mm, 1200)

    def test_platform_width_has_floor(self) -> None:
        result = compute(base_input(width_mm=850))
        self.assertEqual(result.platform.width_mm, 800)

    def test_ramp_title_is_human_readable(self) -> None:
        result = compute(base_input(ramp="ext100"))
        self.assertEqual(result.platform.ramp_title, "Удлинённый пандус на 100 мм")


class LimitTests(unittest.TestCase):
    def test_angle_above_thirty_is_infeasible(self) -> None:
        steps = uniform_stair(12, 200, 250)  # atan(2400/2750) ≈ 41°
        result = compute(base_input(steps=steps))
        self.assertGreater(result.angle_deg, 30)
        self.assertFalse(result.is_feasible)
        self.assertTrue(any("30" in w.text for w in result.warnings))

    def test_rise_above_ten_metres_is_infeasible(self) -> None:
        steps = uniform_stair(60, 200, 300)
        result = compute(base_input(steps=steps))
        self.assertGreater(result.rise_mm, 10_000)
        self.assertFalse(result.is_feasible)

    def test_typical_stair_is_feasible(self) -> None:
        self.assertTrue(compute(base_input()).is_feasible)


class WarningTests(unittest.TestCase):
    def test_narrow_march_warns(self) -> None:
        result = compute(base_input(width_mm=850))
        self.assertTrue(any(w.level == "warn" for w in result.warnings))

    def test_uneven_risers_warn(self) -> None:
        steps = [Step(160, 320) for _ in range(11)] + [Step(200, 0)]
        result = compute(base_input(steps=tuple(steps)))
        self.assertGreater(result.riser_spread_mm, 5)
        self.assertTrue(any("различаются" in w.text for w in result.warnings))

    def test_short_treads_warn(self) -> None:
        steps = uniform_stair(12, 160, 200)
        result = compute(base_input(steps=steps))
        self.assertTrue(any("Проступь меньше 250" in w.text for w in result.warnings))

    def test_last_tread_notice(self) -> None:
        steps = uniform_stair(12, 160, 320)
        result = compute(base_input(steps=steps))
        self.assertTrue(any(w.level == "info" and "последней" in w.text for w in result.warnings))

    def test_high_risers_warn(self) -> None:
        steps = uniform_stair(10, 230, 320)
        result = compute(base_input(steps=steps))
        self.assertTrue(any("выше 200" in w.text for w in result.warnings))


class MotionTests(unittest.TestCase):
    def test_travel_time_from_slope(self) -> None:
        result = compute(base_input())
        self.assertAlmostEqual(result.travel_time_s, result.slope_length_mm / 1000 / 0.10, places=6)

    def test_total_time_includes_boarding(self) -> None:
        result = compute(base_input())
        self.assertAlmostEqual(result.total_time_s, result.travel_time_s + 6.0, places=6)

    def test_load_shared_between_supports(self) -> None:
        result = compute(base_input())
        normal = result.moving_mass_kg * 9.81 * math.cos(math.radians(result.angle_deg))
        self.assertAlmostEqual(result.load_per_support_n * result.supports, normal, places=3)


class ValidationTests(unittest.TestCase):
    def test_single_step_rejected(self) -> None:
        with self.assertRaises(ValueError):
            compute(base_input(steps=(Step(160, 320),)))

    def test_negative_rise_rejected(self) -> None:
        steps = uniform_stair(5, 160, 320)
        bad = steps[:4] + (Step(-10, 0),)
        with self.assertRaises(ValueError):
            compute(base_input(steps=bad))

    def test_unknown_ramp_rejected(self) -> None:
        with self.assertRaises(ValueError):
            compute(base_input(ramp="spiral"))

    def test_zero_payload_rejected(self) -> None:
        with self.assertRaises(ValueError):
            compute(base_input(payload_kg=0))


class SerializationTests(unittest.TestCase):
    def test_to_dict_is_json_ready(self) -> None:
        payload = compute(base_input()).to_dict()
        encoded = json.dumps(payload, ensure_ascii=False)
        self.assertIn("angle_deg", encoded)
        self.assertIn("platform", payload)
        self.assertTrue(payload["feasible"])


if __name__ == "__main__":
    unittest.main()
