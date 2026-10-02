// Copyright (c) 2026 onelpawarai. All rights reserved.

import { HttpApiMiddleware } from "effect/unstable/httpapi"
import { InvalidRequestError } from "../errors"

export class SchemaErrorMiddleware extends HttpApiMiddleware.Service<SchemaErrorMiddleware>()(
  "@zyraxon/HttpApiSchemaError",
  { error: InvalidRequestError },
) {}
