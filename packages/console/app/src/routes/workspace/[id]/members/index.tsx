// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

import { MemberSection } from "./member-section"

export default function () {
  return (
    <div data-page="workspace-[id]">
      <div data-slot="sections">
        <MemberSection />
      </div>
    </div>
  )
}
