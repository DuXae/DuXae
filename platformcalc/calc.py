"""Расчёт наклонной подъёмной платформы по геометрии лестницы.

Модель повторяет порядок работы конструктора: задаются высота и длина проступи
каждой ступени, длины нижней и верхней площадок, ширина марша и тип въездного
пандуса. На выходе — высота подъёма, угол, длина направляющей и габарит платформы.

Все размеры внутри расчёта — в миллиметрах, наружу отдаются и метры.
Зависимостей нет, только стандартная библиотека.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from math import atan2, ceil, cos, degrees, hypot, radians, sin
from typing import Any, Iterable

# --------------------------------------------------------------------------
# Ограничения и допущения
# --------------------------------------------------------------------------

MAX_RISE_MM = 10_000.0  # максимальная длина подъёма
MAX_ANGLE_DEG = 30.0  # максимальный угол подъёма
MIN_WIDTH_MM = 900.0  # минимальная ширина марша

PLATFORM_BASE_MM = 1_100.0  # длина платформы с обычным пандусом
PLATFORM_WIDTH_MARGIN_MM = 100.0  # зазор по 50 мм с каждой стороны
MIN_PLATFORM_WIDTH_MM = 800.0

RAIL_TAIL_MM = 250.0  # запас направляющей за крайние точки
SUPPORT_SPACING_MM = 1_500.0  # шаг точек крепления направляющей
SPEED_MPS = 0.10  # скорость платформы
BOARDING_S = 3.0  # посадка или высадка

G = 9.81
FRICTION = 0.02
DRIVE_EFFICIENCY = 0.75
PLATFORM_MASS_KG = 120.0

RAMP_DELTA_MM = {
    "normal": 0.0,
    "ext50": 50.0,
    "ext100": 100.0,
    "ext150": 150.0,
    "short_npu": -150.0,
}

RAMP_TITLES = {
    "normal": "Обычный пандус",
    "ext50": "Удлинённый пандус на 50 мм",
    "ext100": "Удлинённый пандус на 100 мм",
    "ext150": "Удлинённый пандус на 150 мм",
    "short_npu": "Укороченная площадка НПУ",
}


# --------------------------------------------------------------------------
# Структуры данных
# --------------------------------------------------------------------------


@dataclass(frozen=True)
class Step:
    """Одна ступень: высота подступенка и длина проступи."""

    rise_mm: float
    tread_mm: float = 0.0


@dataclass(frozen=True)
class StairInput:
    """Геометрия лестницы для расчёта платформы."""

    steps: tuple[Step, ...]
    lower_platform_mm: float = 1_000.0
    upper_platform_mm: float = 1_000.0
    width_mm: float = 1_100.0
    ramp: str = "normal"
    payload_kg: float = 250.0

    def validate(self) -> None:
        if len(self.steps) < 2:
            raise ValueError("нужно не меньше двух ступеней")
        if self.ramp not in RAMP_DELTA_MM:
            raise ValueError(f"неизвестный тип пандуса: {self.ramp}")
        if self.width_mm <= 0:
            raise ValueError("ширина марша должна быть больше нуля")
        if self.lower_platform_mm < 0 or self.upper_platform_mm < 0:
            raise ValueError("длины площадок не могут быть отрицательными")
        if self.payload_kg <= 0:
            raise ValueError("грузоподъёмность должна быть больше нуля")
        for index, step in enumerate(self.steps, start=1):
            if step.rise_mm <= 0:
                raise ValueError(f"ступень {index}: высота должна быть больше нуля")
            if step.tread_mm < 0:
                raise ValueError(f"ступень {index}: длина проступи не может быть отрицательной")


@dataclass(frozen=True)
class Warning:
    """Замечание к расчёту."""

    level: str  # "error" | "warn" | "info"
    text: str


@dataclass(frozen=True)
class Platform:
    """Габариты платформы и въездного пандуса."""

    length_mm: float
    width_mm: float
    ramp: str
    ramp_title: str
    ramp_extension_mm: float


@dataclass(frozen=True)
class LiftResult:
    """Результат расчёта платформы."""

    source: StairInput
    steps_count: int
    rise_mm: float
    steps_run_mm: float
    total_run_mm: float
    angle_deg: float
    slope_length_mm: float
    rail_length_mm: float
    supports: int
    platform: Platform
    avg_rise_mm: float
    riser_spread_mm: float
    travel_time_s: float
    total_time_s: float
    moving_mass_kg: float
    traction_force_n: float
    motor_power_kw: float
    load_per_support_n: float
    warnings: tuple[Warning, ...] = field(default_factory=tuple)

    @property
    def is_feasible(self) -> bool:
        return not any(w.level == "error" for w in self.warnings)

    @property
    def rise_m(self) -> float:
        return self.rise_mm / 1000.0

    def to_dict(self) -> dict[str, Any]:
        p = self.platform
        return {
            "input": {
                "steps": [{"rise_mm": s.rise_mm, "tread_mm": s.tread_mm} for s in self.source.steps],
                "lower_platform_mm": self.source.lower_platform_mm,
                "upper_platform_mm": self.source.upper_platform_mm,
                "width_mm": self.source.width_mm,
                "ramp": self.source.ramp,
                "payload_kg": self.source.payload_kg,
            },
            "geometry": {
                "steps_count": self.steps_count,
                "rise_mm": round(self.rise_mm, 1),
                "steps_run_mm": round(self.steps_run_mm, 1),
                "total_run_mm": round(self.total_run_mm, 1),
                "angle_deg": round(self.angle_deg, 2),
                "slope_length_mm": round(self.slope_length_mm, 1),
                "rail_length_mm": round(self.rail_length_mm, 1),
                "supports": self.supports,
                "avg_rise_mm": round(self.avg_rise_mm, 1),
                "riser_spread_mm": round(self.riser_spread_mm, 1),
            },
            "platform": {
                "length_mm": round(p.length_mm, 1),
                "width_mm": round(p.width_mm, 1),
                "ramp": p.ramp,
                "ramp_title": p.ramp_title,
                "ramp_extension_mm": p.ramp_extension_mm,
            },
            "motion": {
                "travel_time_s": round(self.travel_time_s, 1),
                "total_time_s": round(self.total_time_s, 1),
                "moving_mass_kg": round(self.moving_mass_kg, 1),
                "traction_force_n": round(self.traction_force_n, 1),
                "motor_power_kw": round(self.motor_power_kw, 3),
                "load_per_support_n": round(self.load_per_support_n, 1),
            },
            "feasible": self.is_feasible,
            "warnings": [{"level": w.level, "text": w.text} for w in self.warnings],
        }


# --------------------------------------------------------------------------
# Расчёт
# --------------------------------------------------------------------------


def compute(data: StairInput) -> LiftResult:
    """Считает параметры наклонной платформы по размерам ступеней."""
    data.validate()

    steps = data.steps
    count = len(steps)

    rises = [s.rise_mm for s in steps]
    # Проступь последней ступени — это верхняя площадка, её не суммируем.
    treads = [s.tread_mm for s in steps[:-1]]

    rise = sum(rises)
    steps_run = sum(treads)
    total_run = data.lower_platform_mm + steps_run + data.upper_platform_mm

    if steps_run <= 0:
        angle_deg = 90.0
        slope = rise
    else:
        angle_deg = degrees(atan2(rise, steps_run))
        slope = hypot(rise, steps_run)

    extension = RAMP_DELTA_MM[data.ramp]
    platform_length = max(600.0, PLATFORM_BASE_MM + extension)
    platform_width = max(MIN_PLATFORM_WIDTH_MM, data.width_mm - PLATFORM_WIDTH_MARGIN_MM)

    rail_length = slope + 2 * RAIL_TAIL_MM
    supports = max(2, ceil(rail_length / SUPPORT_SPACING_MM))

    avg_rise = rise / count
    spread = max(rises) - min(rises)

    angle_rad = radians(angle_deg)
    moving_mass = data.payload_kg + PLATFORM_MASS_KG
    traction = moving_mass * G * (sin(angle_rad) + FRICTION * cos(angle_rad))
    power_kw = traction * SPEED_MPS / DRIVE_EFFICIENCY / 1000.0

    travel_time = (slope / 1000.0) / SPEED_MPS
    total_time = travel_time + 2 * BOARDING_S
    load_per_support = moving_mass * G * cos(angle_rad) / supports

    platform = Platform(
        length_mm=platform_length,
        width_mm=platform_width,
        ramp=data.ramp,
        ramp_title=RAMP_TITLES[data.ramp],
        ramp_extension_mm=extension,
    )

    warnings = _warnings(
        data=data,
        rise=rise,
        steps_run=steps_run,
        angle_deg=angle_deg,
        avg_rise=avg_rise,
        spread=spread,
        platform=platform,
    )

    return LiftResult(
        source=data,
        steps_count=count,
        rise_mm=rise,
        steps_run_mm=steps_run,
        total_run_mm=total_run,
        angle_deg=angle_deg,
        slope_length_mm=slope,
        rail_length_mm=rail_length,
        supports=supports,
        platform=platform,
        avg_rise_mm=avg_rise,
        riser_spread_mm=spread,
        travel_time_s=travel_time,
        total_time_s=total_time,
        moving_mass_kg=moving_mass,
        traction_force_n=traction,
        motor_power_kw=power_kw,
        load_per_support_n=load_per_support,
        warnings=tuple(warnings),
    )


def _warnings(
    *,
    data: StairInput,
    rise: float,
    steps_run: float,
    angle_deg: float,
    avg_rise: float,
    spread: float,
    platform: Platform,
) -> list[Warning]:
    out: list[Warning] = []

    if steps_run <= 0:
        out.append(Warning("error", "Сумма проступей равна нулю: угол подъёма 90°, платформа невозможна."))

    if angle_deg > MAX_ANGLE_DEG:
        out.append(
            Warning(
                "error",
                f"Угол подъёма {angle_deg:.1f}° больше допустимых {MAX_ANGLE_DEG:.0f}°.",
            )
        )

    if rise > MAX_RISE_MM:
        out.append(
            Warning(
                "error",
                f"Высота подъёма {rise / 1000:.2f} м больше допустимых {MAX_RISE_MM / 1000:.0f} м.",
            )
        )

    if data.width_mm < MIN_WIDTH_MM:
        out.append(
            Warning(
                "warn",
                f"Ширина марша {data.width_mm / 1000:.2f} м меньше {MIN_WIDTH_MM / 1000:.2f} м: "
                "платформа будет уже типовой.",
            )
        )

    if platform.width_mm < 800:
        out.append(
            Warning(
                "error",
                f"Расчётная ширина платформы {platform.width_mm:.0f} мм меньше минимальных 800 мм.",
            )
        )

    if spread > 5:
        out.append(
            Warning(
                "warn",
                f"Высоты ступеней различаются на {spread:.0f} мм: направляющая получит излом, "
                "проверьте геометрию.",
            )
        )

    if avg_rise > 200:
        out.append(
            Warning(
                "warn",
                f"Средняя высота ступени {avg_rise:.0f} мм выше 200 мм — неудобно для коляски.",
            )
        )
    elif avg_rise < 100:
        out.append(
            Warning(
                "warn",
                f"Средняя высота ступени {avg_rise:.0f} мм ниже 100 мм — проверьте число ступеней.",
            )
        )

    short_treads = [i for i, s in enumerate(data.steps[:-1], start=1) if s.tread_mm < 250]
    if short_treads:
        listed = ", ".join(str(i) for i in short_treads[:6])
        tail = " и др." if len(short_treads) > 6 else ""
        out.append(
            Warning(
                "warn",
                f"Проступь меньше 250 мм у ступеней {listed}{tail}: платформе не хватит места "
                "для безопасного проезда.",
            )
        )

    if data.steps[-1].tread_mm > 0:
        out.append(
            Warning(
                "info",
                "Длина проступи последней ступени не учитывается: её роль играет верхняя площадка.",
            )
        )

    if platform.ramp_extension_mm < 0:
        out.append(
            Warning(
                "info",
                f"{platform.ramp_title}: длина платформы уменьшена на {abs(platform.ramp_extension_mm):.0f} мм, "
                "проверьте угол въезда.",
            )
        )

    return out


def uniform_stair(steps: int, rise_mm: float, tread_mm: float) -> tuple[Step, ...]:
    """Готовый набор одинаковых ступеней — удобно для тестов и быстрых прикидок."""
    return tuple(Step(rise_mm=rise_mm, tread_mm=tread_mm) for _ in range(steps))


def make_input(
    steps: Iterable[Step],
    lower_platform_mm: float = 1_000.0,
    upper_platform_mm: float = 1_000.0,
    width_mm: float = 1_100.0,
    ramp: str = "normal",
    payload_kg: float = 250.0,
) -> StairInput:
    """Собирает входные данные из любого набора ступеней."""
    return StairInput(
        steps=tuple(steps),
        lower_platform_mm=lower_platform_mm,
        upper_platform_mm=upper_platform_mm,
        width_mm=width_mm,
        ramp=ramp,
        payload_kg=payload_kg,
    )
