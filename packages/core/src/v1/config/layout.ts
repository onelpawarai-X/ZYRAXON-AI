// Copyright (c) 2026 onelpawarai. All rights reserved.

export * as ConfigLayoutV1 from "./layout"

import { Schema } from "effect"

export const Layout = Schema.Literals(["auto", "stretch"]).annotate({ identifier: "LayoutConfig" })
export type Layout = Schema.Schema.Type<typeof Layout>
