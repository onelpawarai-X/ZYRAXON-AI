# SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
# Copyright (c) 2026 onelpawarai. All rights reserved.

"""authlib.oauth2.rfc7591.
~~~~~~~~~~~~~~~~~~~~~~

This module represents a direct implementation of
OAuth 2.0 Dynamic Client Registration Protocol.

https://tools.ietf.org/html/rfc7591
"""

from .claims import ClientMetadataClaims
from .endpoint import ClientRegistrationEndpoint
from .errors import InvalidClientMetadataError
from .errors import InvalidRedirectURIError
from .errors import InvalidSoftwareStatementError
from .errors import UnapprovedSoftwareStatementError

__all__ = [
    "ClientMetadataClaims",
    "ClientRegistrationEndpoint",
    "InvalidRedirectURIError",
    "InvalidClientMetadataError",
    "InvalidSoftwareStatementError",
    "UnapprovedSoftwareStatementError",
]
