"""Расчёт наклонного подъёмника для лестницы.

Модуль содержит только расчётную часть: никаких зависимостей, кроме стандартной
библиотеки. Те же формулы продублированы в `web/app.js` для страницы-калькулятора.

Все длины — в метрах, углы — в градусах, силы — в ньютонах.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from math import atan2, ceil, cos, degrees, hypot, sin
from typing import Any

# --------------------------------------------------------------------------
# Физические и нормативные константы
# --------------------------------------------------------------------------

G = 9.81  # ускорение свободного падения, м/с²

MIN_ANGLE_DEG = 15.0
MAX_ANGLE_DEG = 45.0
STEP_HEIGHT_MIN_MM = 150.0
STEP_HEIGHT_MAX_MM = 200.0
MIN_CLEAR_WIDTH_M = 0.90

RAIL_RESERVE_M = 0.35  # запас направляющей с каждой стороны
TURN_EXTRA_M = 1.60  # добавка к рельсу на один поворот 90°
SUPPORT_SPACING_M = 1.50  # шаг точек крепления

FRICTION = 0.02  # сопротивление качения роликов
DRIVE_EFFICIENCY = 0.75
ACCELERATION_MPS2 = 0.10
BOARDING_SECONDS = 3.0  # посадка или высадка, с

SPEED_MPS = {"platform": 0.10, "seat": 0.15}
MOVING_MASS_KG = {"platform": 120.0, "seat": 45.0}
PLATFORM_LENGTH_M = {"platform": 1.20, "seat": 0.55}
PLATFORM_WIDTH_M = {"platform": 0.80, "seat": 0.45}

TRACKS = {"straight": "прямая", "turn": "с поворотом"}
KINDS = {"platform": "платформа для коляски", "seat": "кресло"}

# Ориентировочный прайс. Меняется под конкретное производство.
PRICE_BASE = 320_000.0
PRICE_PER_RAIL_M = 42_000.0
PRICE_RAIL_INCLUDED_M = 3.0
PRICE_TURN = 90_000.0
PRICE_WHEELCHAIR = 50_000.0
PRICE_INSTALLATION_SHARE = 0.12


# --------------------------------------------------------------------------
# Входные и выходные структуры
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class LiftInput:
    """Исходные данные: размеры лестницы и требования к подъёмнику."""

    height_m: float
    run_m: float
    width_m: float
    steps: int
    track: str = "straight"
    kind: str = "platform"
    payload_kg: float = 250.0

    def validate(self) -> None:
        if self.height_m <= 0:
            raise ValueError("высота подъёма должна быть больше нуля")
        if self.run_m <= 0:
            raise ValueError("длина марша должна быть больше нуля")
        if self.width_m <= 0:
            raise ValueError("ширина марша должна быть больше нуля")
        if self.steps < 2:
            raise ValueError("ступеней должно быть не меньше двух")
        if self.payload_kg <= 0:
            raise ValueError("грузоподъёмность должна быть больше нуля")
        if self.track not in TRACKS:
            raise ValueError(f"неизвестный тип трассы: {self.track}")
        if self.kind not in KINDS:
            raise ValueError(f"неизвестный тип подъёмника: {self.kind}")


@dataclass(frozen=True)
class Warning:
    """Замечание к расчёту: ошибка делает проект невыполнимым."""

    level: str  # "error" | "warn" | "info"
    text: str


@dataclass(frozen=True)
class PriceBreakdown:
    base: float
    extra_rail: float
    turn: float
    wheelchair: float
    installation: float

    @property
    def total(self) -> float:
        return self.base + self.extra_rail + self.turn + self.wheelchair + self.installation


@dataclass(frozen=True)
class LiftResult:
    """Результат расчёта."""

    source: LiftInput
    angle_deg: float
    slope_length_m: float
    rail_length_m: float
    supports: int
    step_height_mm: float
    clearance_m: float
    platform_length_m: float
    platform_width_m: float
    speed_mps: float
    travel_time_s: float
    total_time_s: float
    moving_mass_kg: float
    traction_force_n: float
    motor_power_kw: float
    load_per_support_n: float
    price: PriceBreakdown
    warnings: tuple[Warning, ...] = field(default_factory=tuple)

    @property
    def is_feasible(self) -> bool:
        """True, если в расчёте нет ошибок, блокирующих изготовление."""
        return not any(w.level == "error" for w in self.warnings)

    def to_dict(self) -> dict[str, Any]:
        """Словарь для JSON и обмена с другими программами."""
        p = self.price
        return {
            "input": {
                "height_m": self.source.height_m,
                "run_m": self.source.run_m,
                "width_m": self.source.width_m,
                "steps": self.source.steps,
                "track": self.source.track,
                "kind": self.source.kind,
                "payload_kg": self.source.payload_kg,
            },
            "geometry": {
                "angle_deg": round(self.angle_deg, 2),
                "slope_length_m": round(self.slope_length_m, 3),
                "rail_length_m": round(self.rail_length_m, 3),
                "supports": self.supports,
                "step_height_mm": round(self.step_height_mm, 1),
                "clearance_m": round(self.clearance_m, 3),
            },
            "platform": {
                "length_m": round(self.platform_length_m, 3),
                "width_m": round(self.platform_width_m, 3),
            },
            "motion": {
                "speed_mps": self.speed_mps,
                "travel_time_s": round(self.travel_time_s, 1),
                "total_time_s": round(self.total_time_s, 1),
                "moving_mass_kg": round(self.moving_mass_kg, 1),
                "traction_force_n": round(self.traction_force_n, 1),
                "motor_power_kw": round(self.motor_power_kw, 3),
                "load_per_support_n": round(self.load_per_support_n, 1),
            },
            "price": {
                "base": p.base,
                "extra_rail": p.extra_rail,
                "turn": p.turn,
                "wheelchair": p.wheelchair,
                "installation": p.installation,
                "total": p.total,
            },
            "feasible": self.is_feasible,
            "warnings": [{"level": w.level, "text": w.text} for w in self.warnings],
        }


# --------------------------------------------------------------------------
# Расчёт
# --------------------------------------------------------------------------


def compute(data: LiftInput) -> LiftResult:
    """Считает геометрию, нагрузки и ориентировочную цену подъёмника."""
    data.validate()

    angle_rad = atan2(data.height_m, data.run_m)
    angle_deg = degrees(angle_rad)
    slope_length = hypot(data.height_m, data.run_m)

    rail_length = slope_length + 2 * RAIL_RESERVE_M
    if data.track == "turn":
        rail_length += TURN_EXTRA_M
    supports = max(2, ceil(rail_length / SUPPORT_SPACING_M))

    step_height_mm = data.height_m / data.steps * 1000.0
    clearance = max(0.0, data.width_m - 0.10)  # минус поручень
    platform_length = PLATFORM_LENGTH_M[data.kind]
    platform_width = PLATFORM_WIDTH_M[data.kind]

    speed = SPEED_MPS[data.kind]
    travel_time = slope_length / speed
    total_time = travel_time + 2 * BOARDING_SECONDS

    moving_mass = data.payload_kg + MOVING_MASS_KG[data.kind]
    traction = moving_mass * G * (sin(angle_rad) + FRICTION * cos(angle_rad))
    traction += moving_mass * ACCELERATION_MPS2  # разгон и торможение
    motor_power_kw = traction * speed / DRIVE_EFFICIENCY / 1000.0

    normal_force = moving_mass * G * cos(angle_rad)
    load_per_support = normal_force / supports

    price = _price(data, rail_length)
    warnings = _warnings(
        data=data,
        angle_deg=angle_deg,
        step_height_mm=step_height_mm,
        clearance=clearance,
        platform_width=platform_width,
        rail_length=rail_length,
        motor_power_kw=motor_power_kw,
    )

    return LiftResult(
        source=data,
        angle_deg=angle_deg,
        slope_length_m=slope_length,
        rail_length_m=rail_length,
        supports=supports,
        step_height_mm=step_height_mm,
        clearance_m=clearance,
        platform_length_m=platform_length,
        platform_width_m=platform_width,
        speed_mps=speed,
        travel_time_s=travel_time,
        total_time_s=total_time,
        moving_mass_kg=moving_mass,
        traction_force_n=traction,
        motor_power_kw=motor_power_kw,
        load_per_support_n=load_per_support,
        price=price,
        warnings=tuple(warnings),
    )


def _price(data: LiftInput, rail_length: float) -> PriceBreakdown:
    extra_metres = max(0.0, rail_length - PRICE_RAIL_INCLUDED_M)
    extra_rail = extra_metres * PRICE_PER_RAIL_M
    turn = PRICE_TURN if data.track == "turn" else 0.0
    wheelchair = PRICE_WHEELCHAIR if data.kind == "platform" else 0.0
    subtotal = PRICE_BASE + extra_rail + turn + wheelchair
    return PriceBreakdown(
        base=PRICE_BASE,
        extra_rail=extra_rail,
        turn=turn,
        wheelchair=wheelchair,
        installation=round(subtotal * PRICE_INSTALLATION_SHARE, 2),
    )


def _warnings(
    *,
    data: LiftInput,
    angle_deg: float,
    step_height_mm: float,
    clearance: float,
    platform_width: float,
    rail_length: float,
    motor_power_kw: float,
) -> list[Warning]:
    out: list[Warning] = []

    if angle_deg < MIN_ANGLE_DEG:
        out.append(
            Warning(
                "error",
                f"Угол наклона {angle_deg:.1f}° меньше {MIN_ANGLE_DEG:.0f}°: "
                "рельсовый подъёмник теряет смысл, нужен вертикальный вариант.",
            )
        )
    elif angle_deg > MAX_ANGLE_DEG:
        out.append(
            Warning(
                "error",
                f"Угол наклона {angle_deg:.1f}° больше {MAX_ANGLE_DEG:.0f}°: "
                "платформа не удержится на рельсе, требуется другой тип подъёмника.",
            )
        )

    if step_height_mm < STEP_HEIGHT_MIN_MM:
        out.append(
            Warning(
                "warn",
                f"Шаг ступени {step_height_mm:.0f} мм ниже {STEP_HEIGHT_MIN_MM:.0f} мм — "
                "ступени слишком пологие, проверьте число ступеней.",
            )
        )
    elif step_height_mm > STEP_HEIGHT_MAX_MM:
        out.append(
            Warning(
                "warn",
                f"Шаг ступени {step_height_mm:.0f} мм выше {STEP_HEIGHT_MAX_MM:.0f} мм — "
                "неудобно и небезопасно, проверьте число ступеней.",
            )
        )

    if clearance < MIN_CLEAR_WIDTH_M:
        out.append(
            Warning(
                "error",
                f"Свободная ширина марша {clearance:.2f} м меньше {MIN_CLEAR_WIDTH_M:.2f} м — "
                "подъёмник не поместится.",
            )
        )
    elif clearance < platform_width + 0.10:
        out.append(
            Warning(
                "warn",
                f"Свободная ширина {clearance:.2f} м впритык для платформы "
                f"{platform_width:.2f} м — останется меньше 10 см сбоку.",
            )
        )

    if rail_length > 12.0:
        out.append(
            Warning(
                "warn",
                f"Длина направляющей {rail_length:.1f} м — трасса длинная, "
                "потребуется промежуточная опора и проверка прогиба.",
            )
        )

    if data.height_m > 6.0:
        out.append(
            Warning(
                "info",
                f"Высота подъёма {data.height_m:.1f} м: проверьте требования "
                "пожарной безопасности и аварийного спуска.",
            )
        )

    if motor_power_kw > 1.5:
        out.append(
            Warning(
                "info",
                f"Расчётная мощность {motor_power_kw:.2f} кВт — нужен редуктор "
                "повышенной мощности и отдельная линия питания.",
            )
        )

    if data.payload_kg > 400:
        out.append(
            Warning(
                "warn",
                f"Грузоподъёмность {data.payload_kg:.0f} кг выше типовой (400 кг) — "
                "требуется усиленная платформа.",
            )
        )

    return out
