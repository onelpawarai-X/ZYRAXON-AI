# SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
# Copyright (c) 2026 onelpawarai. All rights reserved.

"""authlib.oauth2.rfc7636.
~~~~~~~~~~~~~~~~~~~~~~

This module represents a direct implementation of
Proof Key for Code Exchange by OAuth Public Clients.

https://tools.ietf.org/html/rfc7636
"""

from .challenge import CodeChallenge
from .challenge import create_s256_code_challenge

__all__ = ["CodeChallenge", "create_s256_code_challenge"]
