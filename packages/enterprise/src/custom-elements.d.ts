// Copyright (c) 2026 onelpawarai. All rights reserved.

import { DIFFS_TAG_NAME } from "@pierre/diffs"

declare module "solid-js" {
  namespace JSX {
    interface IntrinsicElements {
      [DIFFS_TAG_NAME]: HTMLAttributes<HTMLElement>
    }
  }
}

export {}
