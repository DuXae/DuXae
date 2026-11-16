"""Командная строка расчёта наклонной платформы.

Примеры:
    # одинаковые ступени: 12 по 180 мм, проступь 300 мм
    python -m platformcalc.cli --steps 12 --rise 180 --tread 300

    # разные ступени: высота:проступь, повторяется сколько нужно
    python -m platformcalc.cli --step 170:300 --step 175:295 --step 180:290 \\
        --lower 1200 --upper 900 --width 1100 --ramp ext100
"""

from __future__ import annotations

import argparse
import json
import sys

from .calc import RAMP_TITLES, Step, StairInput, compute, uniform_stair
from .report import format_report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="platformcalc",
        description="Расчёт наклонной подъёмной платформы по геометрии лестницы.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument(
        "--step",
        action="append",
        metavar="ВЫСОТА[:ПРОСТУПЬ]",
        help="размеры ступени в мм, можно повторять; у последней проступь не нужна",
    )
    parser.add_argument("--steps", type=int, help="число одинаковых ступеней")
    parser.add_argument("--rise", type=float, help="высота ступени, мм")
    parser.add_argument("--tread", type=float, help="длина проступи, мм")
    parser.add_argument("--lower", type=float, default=1000.0, help="длина нижней площадки, мм")
    parser.add_argument("--upper", type=float, default=1000.0, help="длина верхней площадки, мм")
    parser.add_argument("--width", type=float, default=1100.0, help="ширина марша, мм")
    parser.add_argument(
        "--ramp",
        choices=sorted(RAMP_TITLES),
        default="normal",
        help="тип въездного пандуса",
    )
    parser.add_argument("--payload", type=float, default=250.0, help="грузоподъёмность, кг")
    parser.add_argument("--json", action="store_true", help="вывести результат в JSON")
    parser.add_argument("--out", help="сохранить отчёт или JSON в файл")
    return parser


def _safe_console() -> None:
    """UTF-8 при перенаправлении, чтобы не ломать кириллицу и символы вроде °."""
    for stream in (sys.stdout, sys.stderr):
        try:
            if stream.isatty():
                stream.reconfigure(errors="replace")  # type: ignore[attr-defined]
            else:
                stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
        except (AttributeError, OSError):
            pass


def parse_step(raw: str) -> Step:
    """Разбирает запись вида '180:300' или '180'."""
    parts = raw.replace("x", ":").replace("/", ":").split(":")
    try:
        rise = float(parts[0])
        tread = float(parts[1]) if len(parts) > 1 and parts[1] else 0.0
    except ValueError as exc:
        raise argparse.ArgumentTypeError(f"не понял размер ступени {raw!r}") from exc
    return Step(rise_mm=rise, tread_mm=tread)


def _ask(prompt: str, cast, default):
    raw = input(f"{prompt} [{default}]: ").strip()
    if not raw:
        return default
    try:
        return cast(raw)
    except ValueError:
        print(f"  не понял {raw!r}, беру {default}", file=sys.stderr)
        return default


def interactive_input() -> StairInput:
    """Спрашивает данные построчно, если аргументы не переданы."""
    print("Введите данные лестницы (Enter — значение по умолчанию).")
    count = _ask("Число ступеней", int, 12)
    rise = _ask("Высота ступени, мм", float, 180.0)
    tread = _ask("Длина проступи, мм", float, 300.0)
    steps = list(uniform_stair(count, rise, tread))
    same = input("Ступени одинаковые? (y/n) [y]: ").strip().lower() or "y"
    if same.startswith("n"):
        steps = []
        for i in range(1, count + 1):
            r = _ask(f"  ступень {i}, высота, мм", float, rise)
            t = _ask(f"  ступень {i}, проступь, мм", float, tread) if i < count else 0.0
            steps.append(Step(rise_mm=r, tread_mm=t))
    lower = _ask("Длина нижней площадки, мм", float, 1000.0)
    upper = _ask("Длина верхней площадки, мм", float, 1000.0)
    width = _ask("Ширина марша, мм", float, 1100.0)
    return StairInput(
        steps=tuple(steps),
        lower_platform_mm=lower,
        upper_platform_mm=upper,
        width_mm=width,
    )


def main(argv: list[str] | None = None) -> int:
    _safe_console()
    args = build_parser().parse_args(argv)

    try:
        if args.step:
            steps = tuple(parse_step(raw) for raw in args.step)
            data = StairInput(
                steps=steps,
                lower_platform_mm=args.lower,
                upper_platform_mm=args.upper,
                width_mm=args.width,
                ramp=args.ramp,
                payload_kg=args.payload,
            )
        elif args.steps:
            if args.rise is None or args.tread is None:
                print("Ошибка: вместе с --steps нужны --rise и --tread", file=sys.stderr)
                return 2
            steps = uniform_stair(args.steps, args.rise, args.tread)
            data = StairInput(
                steps=steps,
                lower_platform_mm=args.lower,
                upper_platform_mm=args.upper,
                width_mm=args.width,
                ramp=args.ramp,
                payload_kg=args.payload,
            )
        else:
            data = interactive_input()
    except (EOFError, KeyboardInterrupt):
        print("\nотменено", file=sys.stderr)
        return 130

    try:
        result = compute(data)
    except ValueError as exc:
        print(f"Ошибка: {exc}", file=sys.stderr)
        return 2

    text = json.dumps(result.to_dict(), ensure_ascii=False, indent=2) if args.json else format_report(result)

    if args.out:
        with open(args.out, "w", encoding="utf-8") as fh:
            fh.write(text + "\n")
        print(f"Сохранено: {args.out}", file=sys.stderr)
    else:
        print(text)

    return 0 if result.is_feasible else 1


if __name__ == "__main__":
    raise SystemExit(main())
