"""Текстовый отчёт по результату расчёта."""

from __future__ import annotations

from .calc import KINDS, TRACKS, LiftResult

LINE = "-" * 52


def money(value: float) -> str:
    """Форматирует сумму в рублях с разделителями тысяч."""
    return f"{value:,.0f}".replace(",", " ") + " ₽"


def format_report(result: LiftResult) -> str:
    """Возвращает многострочный отчёт для печати в консоль или файл."""
    d = result.source
    p = result.price
    rows = [
        "РАСЧЁТ НАКЛОННОГО ПОДЪЁМНИКА",
        LINE,
        "ИСХОДНЫЕ ДАННЫЕ",
        f"  Высота подъёма ............ {d.height_m:.2f} м",
        f"  Горизонтальная проекция ... {d.run_m:.2f} м",
        f"  Ширина марша .............. {d.width_m:.2f} м",
        f"  Ступеней .................. {d.steps}",
        f"  Трасса .................... {TRACKS[d.track]}",
        f"  Тип ....................... {KINDS[d.kind]}",
        f"  Грузоподъёмность .......... {d.payload_kg:.0f} кг",
        "",
        "ГЕОМЕТРИЯ",
        f"  Угол наклона .............. {result.angle_deg:.1f}°",
        f"  Длина по наклону .......... {result.slope_length_m:.2f} м",
        f"  Длина направляющей ........ {result.rail_length_m:.2f} м",
        f"  Точек крепления ........... {result.supports}",
        f"  Шаг ступени ............... {result.step_height_mm:.0f} мм",
        f"  Свободная ширина .......... {result.clearance_m:.2f} м",
        "",
        "ПЛАТФОРМА",
        f"  Длина ..................... {result.platform_length_m:.2f} м",
        f"  Ширина .................... {result.platform_width_m:.2f} м",
        "",
        "КИНЕМАТИКА И НАГРУЗКИ",
        f"  Скорость .................. {result.speed_mps:.2f} м/с",
        f"  Время в пути .............. {result.travel_time_s:.1f} с",
        f"  Полный цикл ............... {result.total_time_s:.1f} с",
        f"  Движущаяся масса .......... {result.moving_mass_kg:.0f} кг",
        f"  Тяговое усилие ............ {result.traction_force_n:.0f} Н",
        f"  Мощность привода .......... {result.motor_power_kw:.2f} кВт",
        f"  Нагрузка на крепление ..... {result.load_per_support_n:.0f} Н",
        "",
        "ЦЕНА (ориентировочно)",
        f"  Базовая комплектация ...... {money(p.base)}",
        f"  Направляющая сверх нормы .. {money(p.extra_rail)}",
        f"  Поворот ................... {money(p.turn)}",
        f"  Платформа для коляски ..... {money(p.wheelchair)}",
        f"  Монтаж .................... {money(p.installation)}",
        f"  ИТОГО ..................... {money(p.total)}",
    ]

    if result.warnings:
        rows.append("")
        rows.append("ЗАМЕЧАНИЯ")
        marks = {"error": "[!]", "warn": "[~]", "info": "[i]"}
        for w in result.warnings:
            rows.append(f"  {marks.get(w.level, '[-]')} {w.text}")

    rows.append("")
    rows.append(LINE)
    verdict = "проект выполним" if result.is_feasible else "проект НЕ выполним в таком виде"
    rows.append(f"ИТОГ: {verdict}")
    return "\n".join(rows)
