// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

export type DownloadPlatform =
  | `darwin-${"x64" | "aarch64"}-dmg`
  | "windows-x64-nsis"
  | `linux-x64-${"deb" | "rpm" | "appimage"}`
