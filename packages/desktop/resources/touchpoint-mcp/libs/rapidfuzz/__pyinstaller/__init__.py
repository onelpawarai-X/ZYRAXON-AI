# SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
# Copyright (c) 2026 onelpawarai. All rights reserved.

from __future__ import annotations

from pathlib import Path


def get_PyInstaller_tests() -> list[str]:
    return [str(Path(__file__).parent)]
