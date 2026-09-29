# SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
# Copyright (c) 2026 onelpawarai. All rights reserved.

"""
This module provides simpler types to use with the server for managing prompts
and tools.
"""

from pydantic import BaseModel

from mcp.types import (
    Icon,
    ServerCapabilities,
)


class InitializationOptions(BaseModel):
    server_name: str
    server_version: str
    capabilities: ServerCapabilities
    instructions: str | None = None
    website_url: str | None = None
    icons: list[Icon] | None = None
