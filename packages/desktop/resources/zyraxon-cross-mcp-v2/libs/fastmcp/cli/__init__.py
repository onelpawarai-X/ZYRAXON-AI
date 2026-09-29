# SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
# Copyright (c) 2026 onelpawarai. All rights reserved.

"""FastMCP CLI package."""

try:
    from .cli import app
except ImportError as exc:
    from fastmcp import _install_hints

    raise ImportError(_install_hints.CLI_SUPPORT) from exc
