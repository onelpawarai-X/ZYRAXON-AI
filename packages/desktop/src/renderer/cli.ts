// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

import { initI18n, t } from "./i18n"

export async function installCli(): Promise<void> {
  await initI18n()

  try {
    const path = await window.api.installCli()
    window.alert(t("desktop.cli.installed.message", { path }))
  } catch (e) {
    window.alert(t("desktop.cli.failed.message", { error: String(e) }))
  }
}
