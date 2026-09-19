# ZYRAXON AI — npm Packages

All official ZYRAXON AI packages published under the `@zyraxon-ai` npm scope.

**Current Version**: 19.0.5  
**License**: ZSL-X (Zyraxon Sovereign License — X Edition)  
**npm Organization**: [zyraxon-ai](https://www.npmjs.com/org/zyraxon-ai)  
**GitHub**: https://github.com/onelpawarai-X/ZYRAXON-AI

---

## Quick Start

For most users, install just the SDK:

```bash
npm install @zyraxon-ai/sdk
```

If you want to extend ZYRAXON with custom tools:

```bash
npm install @zyraxon-ai/plugin
```

---

## All Packages

### Tier 1 — Public SDK (for everyone)

| Package | Description | Install |
|---------|-------------|---------|
| `@zyraxon-ai/sdk` | Main JavaScript/TypeScript SDK | `npm i @zyraxon-ai/sdk` |
| `@zyraxon-ai/plugin` | Plugin system for extending ZYRAXON | `npm i @zyraxon-ai/plugin` |

### Tier 2 — API Building Blocks (for developers building AI agents)

| Package | Description | Install |
|---------|-------------|---------|
| `@zyraxon-ai/schema` | Effect-TS schema definitions | `npm i @zyraxon-ai/schema` |
| `@zyraxon-ai/protocol` | Communication protocol for ZYRAXON services | `npm i @zyraxon-ai/protocol` |
| `@zyraxon-ai/client` | Official API client | `npm i @zyraxon-ai/client` |
| `@zyraxon-ai/server` | Server runtime | `npm i @zyraxon-ai/server` |
| `@zyraxon-ai/sdk-next` | Next-gen SDK (Effect-TS based) | `npm i @zyraxon-ai/sdk-next` |

### Tier 3 — Internal Packages (used by ZYRAXON desktop app)

| Package | Description | Install |
|---------|-------------|---------|
| `@zyraxon-ai/core` | Core engine with all providers and tools | `npm i @zyraxon-ai/core` |
| `@zyraxon-ai/llm` | LLM provider protocols (Anthropic, OpenAI, Gemini, etc.) | `npm i @zyraxon-ai/llm` |
| `@zyraxon-ai/http-recorder` | HTTP traffic recording and replay | `npm i @zyraxon-ai/http-recorder` |
| `@zyraxon-ai/effect-drizzle-sqlite` | Effect-TS Drizzle SQLite integration | `npm i @zyraxon-ai/effect-drizzle-sqlite` |
| `@zyraxon-ai/effect-sqlite-node` | Effect-TS SQLite for Node.js | `npm i @zyraxon-ai/effect-sqlite-node` |

---

## Package Details

### @zyraxon-ai/sdk

The main SDK for building applications with ZYRAXON AI. Works with any JavaScript/TypeScript project.

```typescript
import { createZyraxonClient } from "@zyraxon-ai/sdk"

const client = createZyraxonClient({
  baseUrl: "http://localhost:3000"
})
```

**Dependencies**: `cross-spawn` (auto-installed)

---

### @zyraxon-ai/plugin

Extend ZYRAXON with custom tools, agents, and integrations.

```typescript
import type { Plugin } from "@zyraxon-ai/plugin"

export const myPlugin: Plugin = {
  name: "my-plugin",
  tools: [...]
}
```

**Dependencies**: `@zyraxon-ai/sdk`, `effect`, `zod`

---

### @zyraxon-ai/schema

All Effect-TS schema definitions for the ZYRAXON protocol. Types for sessions, events, permissions, models, and more.

```typescript
import { SessionId, EventManifest } from "@zyraxon-ai/schema"
```

**Dependencies**: `effect`

---

### @zyraxon-ai/protocol

HTTP API protocol definition using Effect-TS HttpApi. Defines all server endpoints.

```typescript
import { makeDefaultApi } from "@zyraxon-ai/protocol/api"
```

**Dependencies**: `@zyraxon-ai/schema`, `effect`

---

### @zyraxon-ai/client

Type-safe API client generated from the ZYRAXON server protocol.

```typescript
import { Client } from "@zyraxon-ai/client"
```

**Dependencies**: `@zyraxon-ai/schema`, `@zyraxon-ai/protocol`

---

### @zyraxon-ai/server

Server-side runtime for ZYRAXON API. Handles sessions, tools, permissions, and all backend logic.

```typescript
import { makeServer } from "@zyraxon-ai/server/routes"
```

**Dependencies**: `@zyraxon-ai/core`, `@zyraxon-ai/protocol`, `drizzle-orm`, `effect`

---

### @zyraxon-ai/sdk-next

Next-generation SDK built entirely on Effect-TS. For advanced use cases.

**Dependencies**: `@zyraxon-ai/client`, `@zyraxon-ai/server`, `effect`

---

### @zyraxon-ai/core

The full ZYRAXON engine. Contains all AI providers (OpenAI, Anthropic, Google, etc.), tools (bash, file edit, grep, etc.), session management, and the OMNI kernel system.

**Note**: This is a large package with many dependencies. Only needed if you're building a full AI agent from scratch.

---

### @zyraxon-ai/llm

LLM provider protocols for communicating with AI models (Anthropic Messages, OpenAI Chat, Gemini, Bedrock Converse, etc.).

---

### @zyraxon-ai/http-recorder

Record and replay HTTP client traffic with deterministic cassettes. Useful for testing.

---

### @zyraxon-ai/effect-drizzle-sqlite

Effect-TS integration layer for Drizzle ORM with SQLite.

---

### @zyraxon-ai/effect-sqlite-node

Effect-TS SQLite adapter for Node.js environments.

---

## Dependency Graph

```
sdk (standalone — no ZYRAXON deps)
└── plugin (depends on sdk)

schema (standalone)
└── protocol (depends on schema)
    └── client (depends on schema + protocol)
        └── sdk-next (depends on client + server)

llm (depends on schema)
http-recorder (standalone)
effect-drizzle-sqlite (standalone)
effect-sqlite-node (standalone)
└── core (depends on all above)
    └── server (depends on core + protocol)
        └── sdk-next (depends on client + server)
```

## Links

- **Homepage**: https://zyraxonai.lovable.app
- **License Portal**: https://zyraxonai-license.lovable.app
- **Founder**: https://onelpawarai.lovable.app
- **GitHub**: https://github.com/onelpawarai-X/ZYRAXON-AI
