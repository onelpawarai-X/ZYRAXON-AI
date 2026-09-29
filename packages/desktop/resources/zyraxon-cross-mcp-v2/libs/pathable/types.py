# SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
# Copyright (c) 2026 onelpawarai. All rights reserved.

"""Pathable types module"""

from typing import Any

from pathable.protocols import Subscriptable

LookupKey = str | int
LookupValue = Any
LookupNode = Subscriptable[LookupKey, LookupValue] | LookupValue
