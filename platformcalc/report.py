"""Текстовый отчёт по расчёту платформы."""

from __future__ import annotations

from .calc import LiftResult

LINE = "-" * 54


def mm(value: float) -> str:
    """Миллиметры с разделителями тысяч."""
    return f"{value:,.0f}".replace(",", " ") + " мм"


def meters(value: float) -> str:
    return f"{value / 1000:,.2f}".replace(",", " ") + " м"


def format_report(result: LiftResult) -> str:
    """Многострочный отчёт для консоли или файла."""
    p = result.platform
    rows = [
        "РАСЧЁТ НАКЛОННОЙ ПОДЪЁМНОЙ ПЛАТФОРМЫ",
        LINE,
        "ЛЕСТНИЦА",
        f"  Ступеней .................. {result.steps_count}",
        f"  Высота подъёма ............ {mm(result.rise_mm)}  ({meters(result.rise_mm)})",
        f"  Горизонтальная длина ...... {mm(result.total_run_mm)}",
        f"  Средняя высота ступени .... {result.avg_rise_mm:.0f} мм",
        f"  Разброс высот ступеней .... {result.riser_spread_mm:.0f} мм",
        "",
        "ПЛАТФОРМА",
        f"  Угол подъёма .............. {result.angle_deg:.1f}°",
        f"  Длина по наклону .......... {mm(result.slope_length_mm)}",
        f"  Длина направляющей ........ {mm(result.rail_length_mm)}",
        f"  Точек крепления ........... {result.supports}",
        f"  Длина платформы ........... {mm(p.length_mm)}",
        f"  Ширина платформы .......... {mm(p.width_mm)}",
        f"  Пандус .................... {p.ramp_title}",
        "",
        "ДВИЖЕНИЕ И НАГРУЗКИ",
        f"  Скорость .................. {0.10:.2f} м/с",
        f"  Время в пути .............. {result.travel_time_s:.1f} с",
        f"  Полный цикл ............... {result.total_time_s:.1f} с",
        f"  Движущаяся масса .......... {result.moving_mass_kg:.0f} кг",
        f"  Тяговое усилие ............ {result.traction_force_n:.0f} Н",
        f"  Мощность привода .......... {result.motor_power_kw:.2f} кВт",
        f"  Нагрузка на крепление ..... {result.load_per_support_n:.0f} Н",
    ]

    if result.warnings:
        rows += ["", "ЗАМЕЧАНИЯ"]
        marks = {"error": "[!]", "warn": "[~]", "info": "[i]"}
        rows += [f"  {marks.get(w.level, '[-]')} {w.text}" for w in result.warnings]

    rows += [
        "",
        LINE,
        "ИТОГ: " + ("расчёт проходит" if result.is_feasible else "расчёт НЕ проходит по ограничениям"),
    ]
    return "\n".join(rows)
