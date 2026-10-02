// Copyright (c) 2026 onelpawarai. All rights reserved.

import { SettingsSection } from "./settings-section"

export default function () {
  return (
    <div data-page="workspace-[id]">
      <div data-slot="sections">
        <SettingsSection />
      </div>
    </div>
  )
}
