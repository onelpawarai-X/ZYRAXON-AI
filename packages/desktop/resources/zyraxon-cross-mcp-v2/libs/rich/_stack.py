# SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
# Copyright (c) 2026 onelpawarai. All rights reserved.

from typing import List, TypeVar

T = TypeVar("T")


class Stack(List[T]):
    """A small shim over builtin list."""

    @property
    def top(self) -> T:
        """Get top of stack."""
        return self[-1]

    def push(self, item: T) -> None:
        """Push an item on to the stack (append in stack nomenclature)."""
        self.append(item)
