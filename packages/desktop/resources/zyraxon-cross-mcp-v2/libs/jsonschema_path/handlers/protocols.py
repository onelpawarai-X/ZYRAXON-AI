# Copyright (c) 2026 onelpawarai. All rights reserved.

from typing import Protocol


class SupportsRead(Protocol):
    def read(self, amount: int | None = 0) -> str: ...
