# Copyright (c) 2026 onelpawarai. All rights reserved.

"""macOS Accessibility backend for Touchpoint."""

from touchpoint.backends.macos.ax import AxBackend
from touchpoint.backends.macos.input import CGEventInput

__all__ = ["AxBackend", "CGEventInput"]
