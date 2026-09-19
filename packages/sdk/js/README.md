# ZYRAXON AI SDK

> The official JavaScript/TypeScript SDK for ZYRAXON AI

---

## Overview

The ZYRAXON AI SDK provides a comprehensive set of tools and APIs for developers who want to integrate ZYRAXON's powerful AI capabilities into their own applications. Build chatbots, code editors, voice assistants, and more with ease.

---

## Quick Start

```bash
npm install @zyraxon-ai/sdk
```

```typescript
import { createZyraxonClient } from '@zyraxon-ai/sdk'

const client = createZyraxonClient({
  baseUrl: 'http://localhost:3000',
})

const response = await client.chat({
  message: 'Hello ZYRAXON!',
})

console.log(response.text)
```

---

## Documentation

- **[Full SDK Documentation](../../../SDK.md)** — Complete API reference, examples, and guides
- **[Quick Start Guide](./QUICKSTART.md)** — Get up and running in minutes

---

## Features

| Feature | Description |
|---------|-------------|
| **AI Chat** | Send messages and receive responses from 25+ LLM providers |
| **Streaming** | Real-time streaming responses for better UX |
| **File Operations** | Read and write files on the server |
| **Session Management** | Maintain conversation context across messages |
| **Memory** | Store and retrieve key-value pairs |
| **TypeScript** | Full TypeScript support with type definitions |

---

## Examples

### Basic Chat

```typescript
import { createZyraxonClient } from '@zyraxon-ai/sdk'

const client = createZyraxonClient({
  baseUrl: 'http://localhost:3000',
})

async function chat() {
  const response = await client.chat({
    message: 'Write a Python function to sort a list',
  })

  console.log(response.text)
}

chat()
```

### Streaming Response

```typescript
const stream = await client.chatStream({
  message: 'Explain quantum computing',
})

for await (const chunk of stream) {
  process.stdout.write(chunk.text)
}
```

### File Operations

```typescript
// Read a file
const file = await client.readFile({ path: 'README.md' })
console.log(file.content)

// Write a file
await client.writeFile({
  path: 'output.txt',
  content: 'Hello from ZYRAXON SDK!',
})
```

---

## Contributing

Contributions are welcome! Please read our [Contributing Guide](../../../CONTRIBUTING.md) before submitting a Pull Request.

---

## License

This project is licensed under the **Zyraxon Sovereign License — X Edition (ZSL-X)**.

---

*Created by OMG / Lx Sayidi — [GitHub](https://github.com/onelpawarai-X)*
