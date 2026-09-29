# SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
# Copyright (c) 2026 onelpawarai. All rights reserved.

from typing import Any, TypedDict

__all__ = [
    "JSONRecipientDict",
    "FlattenedJSONSerialization",
    "GeneralJSONSerialization",
]


class JSONRecipientDict(TypedDict, total=False):
    header: dict[str, Any]
    encrypted_key: str


class GeneralJSONSerialization(TypedDict, total=False):
    protected: str
    unprotected: dict[str, Any]
    iv: str
    aad: str
    ciphertext: str
    tag: str
    recipients: list[JSONRecipientDict]


class FlattenedJSONSerialization(TypedDict, total=False):
    protected: str
    unprotected: dict[str, Any]
    iv: str
    aad: str
    ciphertext: str
    tag: str
    header: dict[str, Any]
    encrypted_key: str
