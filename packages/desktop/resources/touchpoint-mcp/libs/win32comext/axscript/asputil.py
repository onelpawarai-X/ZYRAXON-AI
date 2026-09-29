# SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
# Copyright (c) 2026 onelpawarai. All rights reserved.

"""A utility module for ASP (Active Server Pages on MS Internet Info Server.

Contains:
    iif -- A utility function to avoid using "if" statements in ASP <% tags

"""


def iif(cond, t, f):
    if cond:
        return t
    else:
        return f
