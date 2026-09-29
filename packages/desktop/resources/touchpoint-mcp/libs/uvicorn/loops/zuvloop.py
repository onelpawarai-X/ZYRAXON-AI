# SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
# Copyright (c) 2026 onelpawarai. All rights reserved.

from __future__ import annotations

import asyncio
from collections.abc import Callable

import zuvloop


def zuvloop_loop_factory(use_subprocess: bool = False) -> Callable[[], asyncio.AbstractEventLoop]:
    return zuvloop.new_event_loop
