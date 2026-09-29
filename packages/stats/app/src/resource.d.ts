// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

import "sst/resource"

declare module "sst/resource" {
  export interface Resource {
    EMAILOCTOPUS_API_KEY: {
      type: "sst.sst.Secret"
      value: string
    }
  }
}
