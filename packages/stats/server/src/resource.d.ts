// Copyright (c) 2026 onelpawarai. All rights reserved.

import "sst/resource"

declare module "sst/resource" {
  export interface Resource {
    LakeIngestConfig: {
      secret: string
      streamName: string
      type: "sst.sst.Linkable"
    }
  }
}
