"""Командная строка калькулятора.

Примеры:
    python -m liftcalc.cli --height 2.8 --run 3.4 --width 1.1 --steps 15
    python -m liftcalc.cli --height 3.2 --run 2.0 --width 1.2 --steps 18 \\
        --track turn --kind platform --payload 300 --json
"""

from __future__ import annotations

import argparse
import json
import sys

from .calc import KINDS, TRACKS, LiftInput, compute
from .report import format_report


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="liftcalc",
        description="Расчёт наклонного подъёмника для лестницы.",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    parser.add_argument("--height", type=float, help="высота подъёма, м")
    parser.add_argument("--run", type=float, help="горизонтальная проекция марша, м")
    parser.add_argument("--width", type=float, help="ширина марша в свету, м")
    parser.add_argument("--steps", type=int, help="число ступеней")
    parser.add_argument(
        "--track",
        choices=sorted(TRACKS),
        default="straight",
        help="тип трассы: straight — прямая, turn — с поворотом",
    )
    parser.add_argument(
        "--kind",
        choices=sorted(KINDS),
        default="platform",
        help="platform — платформа для коляски, seat — кресло",
    )
    parser.add_argument("--payload", type=float, default=250.0, help="грузоподъёмность, кг")
    parser.add_argument("--json", action="store_true", help="вывести результат в JSON")
    parser.add_argument("--out", help="сохранить отчёт или JSON в файл")
    return parser


def _ask(prompt: str, cast, default):
    raw = input(f"{prompt} [{default}]: ").strip()
    if not raw:
        return default
    try:
        return cast(raw)
    except ValueError:
        print(f"  не понял значение {raw!r}, беру {default}", file=sys.stderr)
        return default


def interactive_input() -> LiftInput:
    """Спрашивает параметры, если они не переданы аргументами."""
    print("Введите параметры лестницы (Enter — значение по умолчанию).")
    height = _ask("Высота подъёма, м", float, 2.8)
    run = _ask("Горизонтальная проекция марша, м", float, 3.4)
    width = _ask("Ширина марша, м", float, 1.1)
    steps = _ask("Число ступеней", int, 15)
    track = _ask("Трасса (straight/turn)", str, "straight")
    kind = _ask("Тип (platform/seat)", str, "platform")
    payload = _ask("Грузоподъёмность, кг", float, 250.0)
    return LiftInput(
        height_m=height,
        run_m=run,
        width_m=width,
        steps=steps,
        track=track if track in TRACKS else "straight",
        kind=kind if kind in KINDS else "platform",
        payload_kg=payload,
    )


def _safe_console() -> None:
    """Не падать на символах вроде ₽ и не ломать кириллицу при перенаправлении."""
    for stream in (sys.stdout, sys.stderr):
        try:
            if stream.isatty():
                stream.reconfigure(errors="replace")  # type: ignore[attr-defined]
            else:
                stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
        except (AttributeError, OSError):
            pass


def main(argv: list[str] | None = None) -> int:
    _safe_console()
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.height is None:
        try:
            data = interactive_input()
        except (EOFError, KeyboardInterrupt):
            print("\nотменено", file=sys.stderr)
            return 130
    else:
        data = LiftInput(
            height_m=args.height,
            run_m=args.run,
            width_m=args.width,
            steps=args.steps,
            track=args.track,
            kind=args.kind,
            payload_kg=args.payload,
        )

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
