# SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
# Copyright (c) 2026 onelpawarai. All rights reserved.

"""Authentication-related CLI commands."""

import cyclopts

from fastmcp.cli.cimd import cimd_app

auth_app = cyclopts.App(
    name="auth",
    help="Authentication-related utilities and configuration.",
)

# Nest CIMD commands under auth
auth_app.command(cimd_app)
