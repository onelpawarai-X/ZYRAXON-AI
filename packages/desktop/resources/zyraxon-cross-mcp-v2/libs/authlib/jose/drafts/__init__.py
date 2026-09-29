# SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
# Copyright (c) 2026 onelpawarai. All rights reserved.

from ._jwe_algorithms import JWE_DRAFT_ALG_ALGORITHMS
from ._jwe_enc_cryptography import C20PEncAlgorithm

try:
    from ._jwe_enc_cryptodome import XC20PEncAlgorithm
except ImportError:
    XC20PEncAlgorithm = None


def register_jwe_draft(cls):
    for alg in JWE_DRAFT_ALG_ALGORITHMS:
        cls.register_algorithm(alg)

    cls.register_algorithm(C20PEncAlgorithm(256))  # C20P
    if XC20PEncAlgorithm is not None:
        cls.register_algorithm(XC20PEncAlgorithm(256))  # XC20P


__all__ = ["register_jwe_draft"]
