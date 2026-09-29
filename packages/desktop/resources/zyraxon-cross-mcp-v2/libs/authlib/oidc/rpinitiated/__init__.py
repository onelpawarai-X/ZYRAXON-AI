# SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
# Copyright (c) 2026 onelpawarai. All rights reserved.

"""authlib.oidc.rpinitiated.
~~~~~~~~~~~~~~~~~~~~~~~~~~~

OpenID Connect RP-Initiated Logout 1.0 Implementation.

https://openid.net/specs/openid-connect-rpinitiated-1_0.html
"""

from .discovery import OpenIDProviderMetadata
from .end_session import EndSessionEndpoint
from .end_session import EndSessionRequest
from .registration import ClientMetadataClaims

__all__ = [
    "EndSessionEndpoint",
    "EndSessionRequest",
    "ClientMetadataClaims",
    "OpenIDProviderMetadata",
]
