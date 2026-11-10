// Copyright (c) 2026 onelpawarai. All rights reserved.

import { HttpApiMiddleware } from "effect/unstable/httpapi"
import { UnauthorizedError } from "../errors"

export class Authorization extends HttpApiMiddleware.Service<Authorization>()("@zyraxon/HttpApiAuthorization", {
  error: UnauthorizedError,
}) {}
