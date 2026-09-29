// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

import { type ComponentProps, splitProps } from "solid-js"
import "./badge-v2.css"

export interface TagProps extends ComponentProps<"span"> {
  variant?: "neutral" | "accent"
}

export function Tag(props: TagProps) {
  const [split, rest] = splitProps(props, ["class", "classList", "children", "variant"])
  return (
    <span
      {...rest}
      data-component="tag"
      data-variant={split.variant ?? "neutral"}
      classList={{
        ...split.classList,
        [split.class ?? ""]: !!split.class,
      }}
    >
      {split.children}
    </span>
  )
}
