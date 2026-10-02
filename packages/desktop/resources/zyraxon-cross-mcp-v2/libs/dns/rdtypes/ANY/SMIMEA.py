# Copyright (c) 2026 onelpawarai. All rights reserved.

# Copyright (C) Dnspython Contributors, see LICENSE for text of ISC license

import dns.immutable
import dns.rdtypes.tlsabase


@dns.immutable.immutable
class SMIMEA(dns.rdtypes.tlsabase.TLSABase):
    """SMIMEA record"""
