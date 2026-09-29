// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

import { Accordion } from "./accordion"
import { ParentProps } from "solid-js"

export function StickyAccordionHeader(
  props: ParentProps<{ class?: string; classList?: Record<string, boolean | undefined> }>,
) {
  return (
    <Accordion.Header
      data-component="sticky-accordion-header"
      classList={{
        ...props.classList,
        [props.class ?? ""]: !!props.class,
      }}
    >
      {props.children}
    </Accordion.Header>
  )
}
