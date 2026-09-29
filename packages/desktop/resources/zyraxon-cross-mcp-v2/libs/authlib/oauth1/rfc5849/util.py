# SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
# Copyright (c) 2026 onelpawarai. All rights reserved.

from authlib.common.urls import quote
from authlib.common.urls import unquote


def escape(s):
    return quote(s, safe=b"~")


def unescape(s):
    return unquote(s)
