// Copyright (c) 2026 onelpawarai. All rights reserved.

import { NodeHttpServer, NodeServices } from "@effect/platform-node"
import { Config as EffectConfig, Effect, Layer } from "effect"
import { HttpRouter } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { Config } from "@/config/config"
import { Installation } from "@/installation"
import { InstanceStore } from "@/project/instance-store"
import { GlobalApi } from "@/server/routes/instance/httpapi/groups/global"
import { globalHandlers } from "@/server/routes/instance/httpapi/handlers/global"
import { Authorization, authorizationLayer } from "@/server/routes/instance/httpapi/middleware/authorization"
import { SchemaErrorMiddleware, schemaErrorLayer } from "@/server/routes/instance/httpapi/middleware/schema-error"
import { ServerAuth } from "@/server/auth"

// The recorded order is written by the mocked services, so it lives at module
// scope: the layer is built before the test effect runs.
export const order: string[] = []

const configLayer = Layer.mock(Config.Service, {
  updateGlobal: () =>
    Effect.sync(() => {
      order.push("update")
      return { info: { username: "ordering-test" }, changed: true }
    }),
  getGlobal: () => Effect.succeed({}),
})

const installationLayer = Layer.mock(Installation.Service, {
  method: () => Effect.succeed("unknown" as never),
})

const storeLayer = Layer.mock(InstanceStore.Service, {
  disposeAll: () =>
    Effect.sync(() => {
      order.push("dispose")
    }),
})

// `globalHandlers` is bound to `RootHttpApi`'s "global" group, so the test API
// has to declare the same name, groups, and middleware for the layer to line up.
const TestApi = HttpApi.make("zyraxon-root")
  .addHttpApi(GlobalApi)
  .middleware(SchemaErrorMiddleware)
  .middleware(Authorization)

const routes = HttpApiBuilder.layer(TestApi).pipe(
  Layer.provide(globalHandlers),
  Layer.provide(schemaErrorLayer),
  Layer.provide(authorizationLayer.pipe(Layer.provide(ServerAuth.Config.layer))),
  Layer.provide([configLayer, installationLayer, storeLayer]),
)

const served = HttpRouter.serve(routes, { disableListenLog: true, disableLogger: true })

// `layerTest` supplies both the server and a client bound to it, and NodeServices
// supplies the platform services the router needs. The remaining `Generator` and
// `HttpPlatform` entries in the inferred requirement are an over-approximation of
// the api-builder layer: they are satisfied internally and the layer builds and
// serves for real, which the test exercises end to end.
export const globalConfigLayer = served.pipe(
  Layer.provideMerge(NodeHttpServer.layerTest),
  Layer.provideMerge(NodeServices.layer),
) as Layer.Layer<import("effect/unstable/http").HttpClient.HttpClient, never, never>
