"""Расчёт наклонной подъёмной платформы по геометрии лестницы."""

from .calc import (
    MAX_ANGLE_DEG,
    MAX_RISE_MM,
    RAMP_DELTA_MM,
    RAMP_TITLES,
    LiftResult,
    Platform,
    StairInput,
    Step,
    Warning,
    compute,
    make_input,
    uniform_stair,
)

__all__ = [
    "MAX_ANGLE_DEG",
    "MAX_RISE_MM",
    "RAMP_DELTA_MM",
    "RAMP_TITLES",
    "LiftResult",
    "Platform",
    "StairInput",
    "Step",
    "Warning",
    "compute",
    "make_input",
    "uniform_stair",
]

__version__ = "0.2.0"
