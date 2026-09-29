// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

import type { APIEvent } from "@solidjs/start/server"
import { ZenData } from "@zyraxon-ai/console-core/model.js"
import { buildModelsResponse, buildOptionsResponse } from "../../util/modelsHandler"

export async function OPTIONS(_input: APIEvent) {
  return buildOptionsResponse()
}

export async function GET(_input: APIEvent) {
  const models = Object.keys(ZenData.list("lite").models)
  return buildModelsResponse(models)
}
