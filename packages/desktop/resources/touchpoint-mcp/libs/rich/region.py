# Copyright (c) 2026 onelpawarai. All rights reserved.

from typing import NamedTuple


class Region(NamedTuple):
    """Defines a rectangular region of the screen."""

    x: int
    y: int
    width: int
    height: int
