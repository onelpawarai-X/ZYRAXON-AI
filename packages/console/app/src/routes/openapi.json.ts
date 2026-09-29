// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

export async function GET() {
  const response = await fetch(
    "https://raw.githubusercontent.com/onelpawarai/ZYRAXON-AI/refs/heads/dev/packages/sdk/openapi.json",
  )
  const json = await response.json()
  return json
}
