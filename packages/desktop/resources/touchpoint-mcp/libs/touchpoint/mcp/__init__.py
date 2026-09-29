# SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
# Copyright (c) 2026 onelpawarai. All rights reserved.

"""Touchpoint MCP server.

Exposes Touchpoint's UI-automation API as an MCP (Model Context
Protocol) tool server, ready for use from Claude Desktop, Cursor,
Copilot agents, or any MCP-compatible client.

Install::

    pip install touchpoint

Run::

    touchpoint-mcp          # stdio transport (default)
    python -m touchpoint.mcp.server
"""
