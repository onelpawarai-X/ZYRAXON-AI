# SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
# Copyright (c) 2026 onelpawarai. All rights reserved.

# Copyright (C) Dnspython Contributors, see LICENSE for text of ISC license

import dns.immutable
import dns.rdtypes.tlsabase


@dns.immutable.immutable
class TLSA(dns.rdtypes.tlsabase.TLSABase):
    """TLSA record"""
