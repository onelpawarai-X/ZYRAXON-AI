# SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
# Copyright (c) 2026 onelpawarai. All rights reserved.

from .state_core import StateCore


def inline(state: StateCore) -> None:
    """Parse inlines"""
    for token in state.tokens:
        if token.type == "inline":
            if token.children is None:
                token.children = []
            state.md.inline.parse(token.content, state.md, state.env, token.children)
