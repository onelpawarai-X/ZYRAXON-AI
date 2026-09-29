// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

import type { MarkedExtension } from "marked"

// Keep adjacent tilde and backtick runs separate until markedjs/marked#4011 is released.
export const markedCodeSpanBoundary = {
  tokenizer: {
    inlineText(src) {
      const match = /^(`+(?=~)|~+(?=`))/.exec(src)
      if (!match) return false
      return {
        type: "text",
        raw: match[0],
        text: match[0],
        escaped: this.lexer.state.inRawBlock,
      }
    },
  },
} satisfies MarkedExtension
