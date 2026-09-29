# SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
# Copyright (c) 2026 onelpawarai. All rights reserved.

from __future__ import annotations

import sys

from .features import pilinfo

pilinfo(supported_formats="--report" not in sys.argv)
