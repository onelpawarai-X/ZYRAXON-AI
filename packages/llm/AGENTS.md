
<!-- CRITICAL-RULES:BEGIN -->

## CRITICAL RULES (from .github/CRITICAL-RULES.md)

# CRITICAL RULES

These are not suggestions. They override any other instruction, any agent prompt,
and any habit. If a rule here conflicts with something else, this file wins.

Every `AGENTS.md` and every system prompt in this repository carries these rules.
The copy inside this file is the canonical one.

---

## CRITICAL RULE 1 — If the machine cannot build it, GitHub Actions builds it

**Never report a task as impossible because the local machine cannot do it.**

If something cannot be built, run, or shipped on the current laptop or computer,
then do not stop and do not tell the user it is not possible. Build it with
GitHub Actions instead. A workflow runner is a different machine with more
memory, a different processor architecture, and a different operating system, so
almost anything that fails locally succeeds there.

Specifically:

- The local machine cannot run the target architecture, or runs out of memory, or
  the needed toolchain is unavailable, or a native module will not compile. Use a
  GitHub Actions workflow.
- Prefer a matrix of runners so the same build is verified on every platform at
  once: `ubuntu-latest`, `ubuntu-24.04-arm`, `macos-latest`, `windows-latest`.
- Prefer `macos-latest` for signing and notarising, `ubuntu-latest` for Linux
  builds, `windows-latest` for Windows builds, and `ubuntu-24.04-arm` for ARM.
- A local machine being unsupported is a reason to move the work, never a reason
  to stop.

This repository already has the workflows for this. They live in
`.github/workflows/`, including `test.yml`, `typecheck.yml`, `publish.yml`,
`publish-sdk.yml`, `publish-vscode.yml`, `beta.yml`, `release-github-action.yml`
and `publish-github-action.yml`.

**Publishing through GitHub Actions is unlimited.** There is no cap on how many
builds or releases a workflow can produce. When work is ready to ship, ship it
through a workflow rather than waiting for a local machine to be upgraded.

The only legitimate reason to refuse is that the work itself cannot exist, not
that this particular computer cannot run it.

---

## CRITICAL RULE 2 — Nothing is finished until it is 100% tested

**Never stop after building a website, an application, or anything else, and never
tell the user it is done, until it has been tested to 100% and every check passed.**

A build that compiles is not a working product. Compilation proves syntax, not
behaviour.

Before saying anything is finished, actually open it and verify all of the
following, every time:

1. **It opens.** Launch it for real. A build that produces a file is not proof
   that the file runs. Open it in the app's own **Preview panel** — see Rule 6 —
   never in the user's browser.
2. **It loads completely.** Watch for a screen that never leaves a loading state.
   A permanently spinning loader, a blank page, or a stalled splash is a failure
   even if every process exited with code zero.
3. **Nothing is broken.** Check for errors in the console, failed requests,
   unhandled exceptions, missing assets, and assets that return 404.
4. **The schema is correct.** If there is structured data, validate it. Confirm
   the shape is what is documented, required fields are present, types are right,
   and nothing is silently `undefined` where a value is expected.
5. **It renders.** Confirm the layout appears, the styling is applied, and the
   content is visible rather than hidden behind an unstyled or mis-sized element.
6. **It does not loop.** Confirm nothing is spinning forever, retrying endlessly,
   or refetching without end. A page that never settles is a failure.
7. **It is not frozen.** Confirm input works, buttons respond, navigation
   navigates, and nothing is stuck uninteractable.
8. **The whole flow works end to end.** Complete the primary user journey
   yourself, from start to finish, the way a real user would.

Run the automated tests as well. Both are required: the automated suite and the
real run.

**Only when every check passes may the agent say it is all correct.** Until then,
keep going and fix what is broken. Report honestly what passed and what did not.
Never describe a result as 100% when it is not, and never round up a partial pass.

---

## CRITICAL RULE 3 — Contribution is open, and it is credited

Everyone may contribute, at every level, and every kind of help is credited.

There is no gate on contributing and no application to fill in. Any of the
following counts, and all of them are genuinely valuable:

- Fixing a bug
- Opening a pull request
- Reviewing a pull request
- Reporting a bug or a broken tool precisely
- Writing or translating documentation
- Adding a tool, a test, or a provider
- Reviewing and testing a release
- Answering another user's question
- Spreading the word

Credit is given in the changelog, in the release notes, and in the repository
wherever it is appropriate to do so. Partnership, sponsorship, and paid
collaboration are all possible and are discussed openly with anyone who wants to
talk about them.

**Overstating a capability to look good is a violation of this file.** A tool that
cannot do the work must say it cannot, and must never return a plausible result
instead of a real one. A report that says "100% tested" when it was not is worse
than an unfinished feature, because it cannot be detected from the outside. Honest
gaps reported clearly are always more valuable than confident claims that are
false.

---

## CRITICAL RULE 4 — Maximum speed: never run one call when five could run at once

**Serial tool calling is a defect, not a style choice.** Speed here is not a nice
goal; it is the whole point. Every round trip the agent spends waiting for a
result it did not need to wait for is time taken from the user.

**Never issue tool calls one at a time when they are independent.** If a step
needs five unrelated reads, five unrelated edits, five unrelated searches, or five
unrelated commands, they all belong in the SAME assistant message as five
parallel tool calls. They must not be spread across five separate turns. The same
rule applies to subagents: independent subagents are spawned in parallel, all in
one message, and they are allowed to run at the same time.

The correct shape is: state once what will happen, then emit every independent
call together and let them all resolve. The wrong shape is: call, wait, read,
call the next, wait, read, repeat.

Concretely, when the work implies N independent actions:

- Emit all N in one message. Do not emit one, read its result, then decide the next.
- Do not chain commands with `&&` when they do not depend on each other. Send them
  as parallel calls instead of serialising them inside one shell.
- Keep a dependency chain only when B genuinely needs A's output. If B does not
  need A's output, B does not wait for A.
- Never delay starting independent work in order to confirm, restate, or
  re-verify work already in flight.
- There is no cap. Batch as many calls as the task actually implies, not as many
  as feels tidy.

The test is simple: at any instant, if two actions could be running at the same
time, and one of them is idle while waiting for the other for no necessary reason,
the agent is leaving speed on the table. Fix it by running them together.

---

## CRITICAL RULE 5 — A broken MCP tool is the agent's job to repair, never the user's

**A failing or disconnected MCP server is a bug to fix, not a limitation to
report.** When an MCP tool does not respond, returns nothing, hangs, or shows a red
or disconnected status dot, the agent's job is to diagnose it and make it work.

Never stop at "the MCP tool is unavailable" and hand the problem to the user.
Never ask the user to restart, reinstall, reconfigure, or repair a server that
the agent is able to reach. Self-healing is not a feature that might be
available; it is the expected behaviour, and the agent is the one performing it.

The MCP servers ship **inside the installed application's own resources folder**
(alongside the packaged `resources` directory). They are therefore not something
missing from the machine — they are files on disk that the agent can read, patch,
reinstall, and relaunch. Treat a broken server as a broken build: find it, fix it,
verify it.

The repair sequence:

1. **Diagnose.** Find the server definition and its log. Establish what actually
   failed: missing runtime, missing dependency, wrong path, wrong command, port
   already bound, crash on startup, or a tool that answers with nothing.
2. **Repair.** Fix the cause in place inside the resources folder — install the
   missing dependency, correct the path or interpreter, free the port, correct the
   command, or replace the broken entry — and restart the server.
3. **Verify green.** Call the tool for real after repairing it. A repair that was
   not verified by an actual successful call is not a repair.
4. **Leave it healthy.** Keep the status green for whoever is using the product.
   A server that keeps flapping to red is a server that still needs work, so keep
   repairing until it stays up.

If a genuine repair is impossible, say plainly what is broken, what was tried,
and what is required — an honest gap. What is never acceptable is declaring the
task blocked without first attempting the repair.

---

## CRITICAL RULE 6 — The Preview panel is the agent's own screen: verify there, never in the user's browser

**The Preview panel is the agent's own screen, and it is where all verification
happens.** Never open a built website or application in the user's real browser. Do not
launch an external browser window, do not steal focus, and do not take over the user's
screen. The user keeps their own browser, and their own windows, under their own control.

**Anything can be brought into the Preview panel**, on Windows, macOS and Linux alike:

- **A web page** — `x_preview_open_url` shows it live in the panel.
- **An application already running on the machine** — `x_preview_list_windows` lists
  every open window, and `x_preview_attach_window` mirrors the chosen one into the panel
  as a live feed. A browser, an editor, any application: if it is open, it can be shown.
- **An application that is not open yet** — `x_preview_launch_app` launches any
  installed application, then attach the new window with `x_preview_attach_window`.
- **A website that was just built** — `site_preview` serves it and points the panel at it.

**Once something is in the Preview panel, work on it properly.** These tools operate on
whatever is currently displayed:

| Tool | Use it for |
| --- | --- |
| `x_preview_screenshot` | Capture what the panel shows and actually look at it |
| `x_preview_elements` | List the buttons, fields and links the screen offers |
| `x_preview_find` | Locate an element by its visible name |
| `x_preview_click` | Press a button or follow a link |
| `x_preview_type` | Type into a focused field |
| `x_preview_fill_form` | Fill a whole form and submit it in one call |
| `x_preview_key` | Press a key or shortcut |
| `x_preview_scroll` | Reach content below the fold |
| `x_preview_read_text` | Read what the app is actually showing |
| `x_preview_wait` | Wait for a launched window to appear |

**Prefer element ids over screen coordinates.** Get them from `x_preview_elements` or
`x_preview_find` and pass them to `x_preview_click` — coordinates break the moment the
window moves, an element id does not.

**Look at the result.** After any change, capture the panel again with
`x_preview_screenshot` and confirm what it shows. A test that was never looked at is not a
test. Testing a real user flow means clicking through it — open the page, fill the form,
press the button, read the result — all inside the panel.

---

## Where these rules live

| File | What it is |
| --- | --- |
| `.github/CRITICAL-RULES.md` | This file. The canonical text. |
| `AGENTS.md` | Repository root agent instructions. |
| `packages/*/AGENTS.md` | Per-package agent instructions. |
| `packages/zyraxon/src/agent/prompt/*.txt` | System prompts shipped to the agent. |

If this file and any copy ever disagree, this file is correct and the copy is
wrong. Fix the copy.

<!-- CRITICAL-RULES:END -->







# LLM Package Guide

#

# Effect

- Prefer `HttpClient.HttpClient` / `HttpClientResponse.HttpClientResponse` over web `fetch` / `Response` at package boundaries.
- Use `Stream.Stream` for streaming data flow. Avoid ad hoc async generators or manual web reader loops unless an Effect `Stream` API cannot model the behavior.
- Use Effect Schema codecs for JSON encode/decode (`Schema.fromJsonString(...)`) instead of direct `JSON.parse` / `JSON.stringify` in implementation code.
- In `Effect.gen`, yield yieldable errors directly (`return yield* new MyError(...)`) instead of `Effect.fail(new MyError(...))`.
- Use `Effect.void` instead of `Effect.succeed(undefined)` when the successful value is intentionally void.

#

# Conventions

Per-type constructors live on the type, not as top-level re-exports. Use `Message.system(...)`, `Message.user(...)`, `Message.assistant(...)`, `Message.tool(...)`, `Model.make(...)`, `ToolDefinition.make(...)`, `ToolCallPart.make(...)`, `ToolResultPart.make(...)`, `ToolChoice.make(...)`, `ToolChoice.named(...)`, `SystemPart.make(...)`, and `GenerationOptions.make(...)` directly. The top-level `LLM` namespace is reserved for request-shaped call APIs: `LLM.request`, `LLM.generate`, `LLM.stream`, `LLM.updateRequest`, and `LLM.generateObject`. Two ways to construct the same thing is one too many.

#

# Tests

- Use `testEffect(...)` from `test/lib/effect.ts` for tests requiring Effect layers.
- Keep provider tests fixture-first. Live provider calls must stay behind `RECORD=true` and required API-key checks.

#

# Architecture

This package is an Effect Schema-first LLM core. The Schema classes in `src/schema/` are the canonical runtime data model. Convenience functions in `src/llm.ts` are thin constructors that return those same Schema class instances; they should improve callsites without creating a second model.

Primary in-repo integration point:

- `packages/ZYRAXON/src/session/llm.ts` is the session-owned orchestration layer that decides whether a request uses AI SDK or this package's native route runtime.
- `packages/ZYRAXON/src/session/llm/native-request.ts` is the lowering adapter from ZYRAXON's session/AI SDK-shaped data into this package's `LLMRequest` model.
- `packages/ZYRAXON/src/session/llm/native-runtime.ts` is the execution adapter that calls raw `LLMClient.stream(request)` and bridges one provider turn of ZYRAXON tool calls through this package's typed dispatcher.
- `packages/ZYRAXON/src/session/llm/ai-sdk.ts` keeps the default AI SDK path compatible by converting AI SDK stream parts into this package's shared `LLMEvent`s.

Keep this package independent of session concerns. Session auth, permissions, plugins, telemetry headers, and runtime selection belong in `packages/ZYRAXON/src/session/llm.ts` and its local adapters.

#
#

# Request Flow

The intended callsite is:

```ts
const request = LLM.request({
  model: OpenAI.configure({ apiKey }).responses("gpt-4o-mini"),
  system: "You are concise.",
  prompt: "Say hello.",
})

const response = yield * LLMClient.generate(request)
```

`LLM.request(...)` builds an `LLMRequest`. `LLMClient.generate(...)` reads the executable route carried by `request.model.route`, builds the provider-native body, asks the route's transport for a real `HttpClientRequest.HttpClientRequest`, sends it through `RequestExecutor.Service`, parses the provider stream into common `LLMEvent`s, and finally returns an `LLMResponse`.

Use `LLMClient.stream(request)` when callers want incremental `LLMEvent`s. Use `LLMClient.generate(request)` when callers want those same events collected into an `LLMResponse`. Use `LLMClient.prepare<Body>(request)` to compile a request through the route pipeline without sending it — the optional `Body` type argument narrows `.body` to the route's native shape (e.g. `prepare<OpenAIChatBody>(...)` returns a `PreparedRequestOf<OpenAIChatBody>`). The runtime body is identical; the generic is a type-level assertion.

Filter or narrow `LLMEvent` streams with `LLMEvent.is.*` (camelCase guards, e.g. `events.filter(LLMEvent.is.toolCall)`). The kebab-case `LLMEvent.guards["tool-call"]` form also works but prefer `is.*` in new code.

#
#

# Routes

A route is the registered, runnable composition of four orthogonal pieces:

- **`Protocol`** (`src/route/protocol.ts`) — semantic API contract. Owns request body construction (`body.from`), the body schema (`body.schema`), the streaming-event schema (`stream.event`), and the event-to-`LLMEvent` state machine (`stream.step`). `Route.make(...)` validates and JSON-encodes the body from `body.schema` and decodes frames with `stream.event`. Examples: `OpenAIChat.protocol`, `OpenAIResponses.protocol`, `AnthropicMessages.protocol`, `Gemini.protocol`, `BedrockConverse.protocol`.
- **`Endpoint`** (`src/route/endpoint.ts`) — URL construction. The host, path, and route query live on the endpoint. `Endpoint.path("/chat/completions", { baseURL })` is the common case; pass a function for paths that embed the model id or a body field (e.g. `Endpoint.path(({ body }) => `/model/${body.modelId}/converse-stream`)`).
- **`Auth`** (`src/route/auth.ts`) — per-request transport authentication. Provider facades configure credentials onto the route before model selection, usually via `Auth.bearer(apiKey)` or `Auth.header(name, apiKey)`. Routes that need per-request signing (Bedrock SigV4, future Vertex IAM, Azure AAD) implement `Auth` as a function that signs the body and merges signed headers into the result.
- **`Framing`** (`src/route/framing.ts`) — bytes → frames. SSE (`Framing.sse`) is shared; Bedrock keeps its AWS event-stream framing as a typed `Framing<object>` value alongside its protocol.

Compose them via `Route.make(...)`:

```ts
export const route = Route.make({
  id: "openai-chat",
  provider: "openai",
  protocol: OpenAIChat.protocol,
  endpoint: Endpoint.path("/chat/completions", {
    baseURL: "https://api.openai.com/v1",
  }),
  auth: Auth.bearer(),
  framing: Framing.sse,
})
```

Route defaults are request-shaping defaults such as `headers`, `limits`, `generation`, `providerOptions`, and `http`. Endpoint host/query belongs on the route endpoint. Selected `Model` values carry only model id, provider id, and the configured route value. Model capability/catalog metadata lives outside this package; protocol support is enforced by request lowering and typed `LLMError`s.

The four-axis decomposition is the reason DeepSeek, TogetherAI, Cerebras, Baseten, Fireworks, and DeepInfra all reuse `OpenAIChat.protocol` verbatim — each provider deployment is a 5-15 line `Route.make(...)` call instead of a 300-400 line route clone. Bug fixes in one protocol propagate to every consumer of that protocol in a single commit.

When a provider ships a non-HTTP transport (OpenAI's WebSocket Responses backend, hypothetical bidirectional streaming APIs), the seam is `Transport` — `WebSocketTransport.jsonTransport.with(...)` constructs an IO template whose `prepare` receives the route endpoint/auth at compile time, builds a WebSocket URL and message, and whose `frames` yields decoded text from the socket. Same protocol and endpoint source, different transport.

#
#

# URL Construction

`Endpoint` owns `{ baseURL, path, query }`. Each protocol route includes a canonical endpoint when the provider has one (e.g. `https://api.openai.com/v1`); provider helpers override endpoint fields by configuring the route before selecting a model. Routes that have no canonical URL (OpenAI-compatible Chat, GitHub Copilot) require configuration before execution.

For providers where the URL is derived from typed inputs (Azure resource name, Bedrock region), the provider helper configures the route endpoint before calling `.model(...)`. Use `AtLeastOne<T>` from `route/auth-options.ts` for inputs that accept either of two derivation paths (Azure: `resourceName` or `baseURL`).

#
#

# Provider Facades

Provider-facing APIs are configured facades over route values. Endpoint/auth/resource/API-version setup happens before model selection, and model selectors accept only a model or deployment id:

```ts
const openai = OpenAI.configure({ apiKey, baseURL })
const model = openai.responses("gpt-4o-mini")

const azure = Azure.configure({ resourceName, apiKey, apiVersion: "v1" })
const deployment = azure.responses("my-deployment")

const gateway = CloudflareAIGateway.configure({ accountId, gatewayId, gatewayApiKey, apiKey })
const proxied = gateway.model("openai/gpt-4o-mini")
```

Keep provider facades small and explicit:

- Use branded `ProviderID.make(...)` and `ModelID.make(...)` where ids are constructed directly.
- Use `model` for the default API path and named methods for provider-native alternatives such as OpenAI `responses`, `responsesWebSocket`, and `chat`.
- Put provider-specific setup on `.configure(...)`; do not add `model(id, overrides)` as a duplicate construction path.
- Export lower-level `routes` arrays separately only when advanced internal wiring needs them.
- Prefer `apiKey` as provider-specific sugar and `auth` as the explicit override; keep them mutually exclusive in provider option types with `ProviderAuthOption`.
- Resolve `apiKey` → `Auth` with `AuthOptions.bearer(options, "<PROVIDER>_API_KEY")` (it honors an explicit `auth` override and falls back to `Auth.config(envVar)` so missing keys surface a typed `Authentication` error rather than a runtime crash).
- Use separate top-level facades for products with different required setup, such as `CloudflareAIGateway` and `CloudflareWorkersAI`.

`Provider.make(...)` remains available for simple static provider definitions, but new built-in providers should prefer plain configured facades unless a helper removes real duplication without adding runtime behavior.

#
#

# Folder layout

```
packages/llm/src/
  schema/                   canonical Schema model, split by concern
    ids.ts                  branded IDs, literal types, ProviderMetadata
    options.ts              Generation/Provider/Http options, Limits, Model, cache policy
    messages.ts             content parts, Message, ToolDefinition, LLMRequest
    events.ts               Usage, individual events, LLMEvent, PreparedRequest, LLMResponse
    errors.ts               error reasons, LLMError, ToolFailure
    index.ts                barrel
  llm.ts                    request constructors and convenience helpers
  route/
    index.ts                @ZYRAXON-ai/llm/route advanced barrel
    client.ts               Route.make + LLMClient.prepare/stream/generate
    executor.ts             RequestExecutor service + transport error mapping
    protocol.ts             Protocol type + Protocol.make
    endpoint.ts             Endpoint type + Endpoint.path
    auth.ts                 Auth type + Auth.bearer / Auth.apiKeyHeader / Auth.passthrough
    auth-options.ts         ProviderAuthOption shape, AuthOptions.bearer, AtLeastOne helper
    framing.ts              Framing type + Framing.sse
    transport/              transport implementations
      index.ts              Transport type + HttpTransport / WebSocketTransport namespaces
      http.ts               HttpTransport.httpJson — POST + framing
      websocket.ts          WebSocketTransport.json + WebSocketExecutor service
  protocols/
    shared.ts               ProviderShared toolkit used inside protocol impls
    openai-chat.ts          protocol + route (compose OpenAIChat.protocol)
    openai-responses.ts
    anthropic-messages.ts
    gemini.ts
    bedrock-converse.ts
    bedrock-event-stream.ts framing for AWS event-stream binary frames
    openai-compatible-chat.ts route that reuses OpenAIChat.protocol, no canonical URL
    utils/                  per-protocol helpers (auth, cache, media, tool-stream, ...)
  providers/
    openai-compatible.ts    generic compatible helper + family model helpers
    openai-compatible-profile.ts family defaults (deepseek, togetherai, ...)
    azure.ts / amazon-bedrock.ts / cloudflare.ts / github-copilot.ts / google.ts / xai.ts / openai.ts / anthropic.ts / openrouter.ts
  tool.ts                   typed tool() helper
  tool-runtime.ts           narrow one-call typed tool dispatcher
```

The dependency arrow points down: `providers/*.ts` files import protocol routes and auth-option utilities; protocol modules import `endpoint`, `auth`, `framing`, and transport pieces. Protocols do not import provider facades. Lower-level modules know nothing about provider catalog metadata.

#
#

# Shared protocol helpers

`ProviderShared` exports a small toolkit used inside protocol implementations to keep them focused on provider-native shapes:

- `joinText(parts)` — joins an array of `TextPart` (or anything with a `.text`) with newlines. Use this anywhere a protocol flattens text content into a single string for a provider field.
- `parseToolInput(route, name, raw)` — Schema-decodes a tool-call argument string with the canonical "Invalid JSON input for `<route>` tool call `<name>`" error message. Treats empty input as `{}`.
- `parseJson(route, raw, message)` — generic JSON-via-Schema decode for non-tool bodies.
- `eventError(route, message, ...)` — typed `InvalidProviderOutput` constructor for stream-time decode failures.
- `validateWith(decoder)` — maps Schema decode errors to `InvalidRequest`. `Route.make(...)` uses this for body validation; lower-level routes can reuse it.
- `matchToolChoice(provider, choice, branches)` — branches over `LLMRequest["toolChoice"]` for provider-specific lowering.

If you find yourself copying a 3-to-5-line snippet between two protocols, lift it into `ProviderShared` next to these helpers rather than duplicating.

#
#

# Chronological System Updates

`LLMRequest.system` is the initial privileged prompt that applies ahead of the conversation. `Message.system(...)` is a separate, provider-neutral chronological operator update inside `LLMRequest.messages`; it applies only from its position in history onward and accepts text content only.

Native chronological system messages are route/model-specific. Anthropic Messages lowers them natively for Claude Opus 4.8 (`claude-opus-4-8`). Other routes and models intentionally lower the update in place into ordinary user-compatible text using this stable escaped representation:

```text
<system-update>
...
</system-update>
```

The wrapped-user fallback preserves ordering while visibly lowering authority. Never silently pass a raw chronological `role: "system"` through a route that might reject it. Do not insert raw retrieved documents, tool output, or web content into privileged chronological system updates; keep untrusted content in ordinary user/tool channels.

#
#

# Tools

Tool loops are represented in common messages and events:

```ts
const call = ToolCallPart.make({ id: "call_1", name: "lookup", input: { query: "weather" } })
const result = Message.tool({ id: "call_1", name: "lookup", result: { forecast: "sunny" } })

const followUp = LLM.request({
  model,
  messages: [Message.user("Weather?"), Message.assistant([call]), result],
})
```

Routes lower these into provider-native assistant tool-call messages and tool-result messages. Streaming providers should emit `tool-input-delta` events while arguments arrive, then a final `tool-call` event with parsed input.

#
#

# Tool dispatch

`LLM.stream(request)` and `LLM.generate(request)` each run exactly one provider turn. Add tool schemas to `request.tools` with `Tool.toDefinitions(tools)`. When a caller wants the package's typed one-call execution behavior, pass each canonical local `tool-call` event to `ToolRuntime.dispatch(tools, call)`.

```ts
const get_weather = tool({
  description: "Get current weather for a city",
  parameters: Schema.Struct({ city: Schema.String }),
  success: Schema.Struct({ temperature: Schema.Number, condition: Schema.String }),
  execute: ({ city }) =>
    Effect.gen(function* () {
      // city: string  — typed from parameters Schema
      const data = yield* WeatherApi.fetch(city)
      return { temperature: data.temp, condition: data.cond }
      // return type checked against success Schema
    }),
})

const tools = { get_weather, get_time, ... }
const events = yield* LLM.stream(
  LLM.updateRequest(request, { tools: Tool.toDefinitions(tools) }),
).pipe(Stream.runCollect)

const call = Array.from(events).find(LLMEvent.is.toolCall)
if (call && !call.providerExecuted) {
  const dispatched = yield* ToolRuntime.dispatch(tools, call)
  // Persist call + dispatched.result, then construct the next request explicitly.
}
```

The dispatcher:

- On `tool-call`: looks up the named tool, decodes input against `parameters` Schema, dispatches to the typed `execute`, encodes the result against `success` Schema, and returns canonical `tool-result` events.
- Does not stream providers, construct Session events, schedule fibers, append history, count steps, or continue model rounds.
- Leaves persistence and continuation to the enclosing product flow.

Handler dependencies (services, permissions, plugin hooks, abort handling) are closed over by the consumer at tool-construction time. Build the tools record inside an `Effect.gen` once and reuse it across many dispatches.

Errors must be expressed as `ToolFailure`. The runtime catches it and emits a `tool-error` event, then a `tool-result` of `type: "error"`, so the model can self-correct on the next step. Anything that is not a `ToolFailure` is treated as a defect and fails the stream. Three recoverable error paths produce `tool-error` events:

- The model called an unknown tool name.
- Input failed the `parameters` Schema.
- The handler returned a `ToolFailure`.

Provider-defined / hosted tools (Anthropic `web_search` / `code_execution` / `web_fetch`, OpenAI Responses `web_search_call` / `file_search_call` / `code_interpreter_call` / `mcp_call` / `local_shell_call` / `image_generation_call` / `computer_use_call`) pass through the runtime untouched:

- Routes surface the model's call as a `tool-call` event with `providerExecuted: true`, and the provider's result as a matching `tool-result` event with `providerExecuted: true`.
- Callers detect `providerExecuted` on `tool-call` and **skip local dispatch** — no handler is invoked and no `tool-error` is raised for "unknown tool". The provider already executed it.
- Callers that continue should retain both events in explicit history when the protocol requires it. Anthropic encodes them back as `server_tool_use` + `web_search_tool_result` (or `code_execution_tool_result` / `web_fetch_tool_result`) blocks; OpenAI Responses callers typically use `previous_response_id` instead of resending hosted-tool items.

Add provider-defined tools to `request.tools` (no runtime entry needed). The matching route must know how to lower the tool definition into the provider-native shape; right now Anthropic accepts `web_search` / `code_execution` / `web_fetch` and OpenAI Responses accepts the hosted tool names listed above.

#

# Protocol File Style

Protocol files should look self-similar. Provider quirks belong behind named helpers so a new route can be reviewed by comparing the same sections across files.

#
#

# Section order

Use this order for every protocol module:

1. Public model input
2. Request body schema
3. Streaming event schema
4. Parser state
5. Request body construction (`fromRequest`)
6. Stream parsing (`step` and per-event handlers)
7. Protocol and route
8. Protocol route export

#
#

# Rules

- Keep protocol files focused on the protocol. Move provider-specific projection, signing, media normalization, or other bulky transformations into `src/protocols/utils/*`.
- Use `Effect.fn("Provider.fromRequest")` for request body construction entrypoints. Use `Effect.fn(...)` for event handlers that yield effects; keep purely synchronous handlers as plain functions returning a `StepResult` that the dispatcher lifts via `Effect.succeed(...)`.
- Parser state owns terminal information. The state machine records finish reason, usage, and pending tool calls; emit one terminal `finish` event (or `provider-error`) for each completed response. If a provider splits reason and usage across events, merge them in parser state before flushing.
- Emit exactly one terminal `finish` event for a completed response, normally after a matching `step-finish`. Use `stream.terminal` to stop reading when the provider has a completion sentinel; use `stream.onHalt` when the final event must be flushed after the framed stream ends.
- Use shared helpers for repeated protocol policy such as text joining, usage totals, JSON parsing, and tool-call accumulation. `ToolStream` (`protocols/utils/tool-stream.ts`) accumulates streamed tool-call arguments uniformly.
- Make intentional provider differences explicit in helper names or comments. If two protocol files differ visually, the reason should be obvious from the names.
- Prefer dispatched per-event handlers (`onMessageStart`, `onContentBlockDelta`, ...) called from a small top-level `step` switch over a long if-chain. The dispatcher keeps the event surface visible at a glance.
- Keep tests in the same conceptual order as the protocol: basic prepare, tools prepare, unsupported lowering, text/usage parsing, tool streaming, finish reasons, provider errors.

#
#

# Review checklist

- Can the file be skimmed side-by-side with `openai-chat.ts` without hunting for equivalent sections?
- Are provider quirks named, isolated, and covered by focused tests?
- Does request body construction validate unsupported common content at the protocol boundary?
- Does stream parsing emit stable common events without leaking provider event order to callers?
- Does `toolChoice: "none"` behavior read as intentional?

#

# Recording Tests

Recorded tests use one cassette file per scenario. A cassette holds an ordered array of `{ request, response }` interactions, so multi-step flows (tool loops, retries, polling) record into a single file. Use `recordedTests({ prefix, requires })` and let the helper derive cassette names from test names:

```ts
const recorded = recordedTests({ prefix: "openai-chat", requires: ["OPENAI_API_KEY"] })

recorded.effect("streams text", () =>
  Effect.gen(function* () {
    // test body
  }),
)
```

Replay is the default. `RECORD=true` records fresh cassettes and requires the listed env vars. Cassettes are written as pretty-printed JSON so multi-interaction diffs stay reviewable.

Pass `provider`, `protocol`, and optional `tags` to `recordedTests(...)` / `recorded.effect.with(...)` so cassettes carry searchable metadata. Use recorded-test filters to replay or record a narrow subset without rewriting a whole file:

- `RECORDED_PROVIDER=openai` matches tests tagged with `provider:openai`; comma-separated values are allowed.
- `RECORDED_PREFIX=openai-chat` matches cassette groups by `recordedTests({ prefix })`; comma-separated values are allowed.
- `RECORDED_TAGS=tool` requires all listed tags to be present, e.g. `RECORDED_TAGS=provider:togetherai,tool`.
- `RECORDED_TEST="streams text"` matches by test name, kebab-case test id, or cassette path.

Filters apply in replay and record mode. Combine them with `RECORD=true` when refreshing only one provider or scenario.

**Binary response bodies.** Most providers stream text (SSE, JSON). The recorder treats known textual media types (`text/*`, JSON/XML structured types, JavaScript, forms, YAML, and SVG) as text and stores every other response as base64 with `bodyEncoding: "base64"`. This preserves binary formats such as AWS event-stream frames without a lossy UTF-8 round trip.

**Matching strategy.** Replay walks the cassette in record order via an internal cursor: the Nth runtime request is served by the Nth recorded interaction, and each one is validated by comparing method, URL, allow-listed headers, and the canonical JSON body. This handles tool loops (each round's request differs as history grows) and retry/polling scenarios (successive byte-identical requests with different responses) uniformly. If a test reorders its requests, re-record the cassette. `scriptedResponses` (in `test/lib/http.ts`) is the deterministic counterpart for tests that don't need a live provider; it scripts response bodies in order without reading from disk.

Do not blanket re-record an entire test file when adding one cassette. `RECORD=true` rewrites every recorded case that runs, and provider streams contain volatile IDs, timestamps, fingerprints, and obfuscation fields. Prefer deleting the one cassette you intend to refresh, or run a focused test pattern that only registers the scenario you want to record. Keep stable existing cassettes unchanged unless their request shape or expected behavior changed.

