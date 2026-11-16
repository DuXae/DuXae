"""Калькулятор наклонного подъёмника для лестницы."""

from .calc import (
    KINDS,
    TRACKS,
    LiftInput,
    LiftResult,
    PriceBreakdown,
    Warning,
    compute,
)

__all__ = [
    "KINDS",
    "TRACKS",
    "LiftInput",
    "LiftResult",
    "PriceBreakdown",
    "Warning",
    "compute",
]

__version__ = "0.1.0"
