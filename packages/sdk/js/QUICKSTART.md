# ZYRAXON SDK — Quick Start Guide

Get up and running with the ZYRAXON AI SDK in just a few minutes. This guide will walk you through the installation, basic setup, and your first AI interaction.

---

## Prerequisites

Before you begin, make sure you have the following installed:

- **Node.js** 18 or higher (or **Bun** 1.0+)
- **ZYRAXON AI Server** running on your machine (or a remote server)

---

## Step 1: Install the SDK

Choose your preferred package manager and install the SDK:

```bash
# Using npm
npm install @zyraxon-ai/sdk

# Using bun (recommended)
bun add @zyraxon-ai/sdk

# Using yarn
yarn add @zyraxon-ai/sdk
```

---

## Step 2: Create a Client

Import the SDK and create a client instance that connects to your ZYRAXON server:

```typescript
import { createZyraxonClient } from '@zyraxon-ai/sdk'

const client = createZyraxonClient({
  baseUrl: 'http://localhost:3000',  // Default ZYRAXON server port
})
```

---

## Step 3: Start Chatting

Now you can send messages to the AI and receive responses:

```typescript
async function main() {
  const response = await client.chat({
    message: 'Hello! What can you help me with today?',
  })

  console.log('AI Response:', response.text)
}

main()
```

---

## Complete Example

Here is a complete, working example that you can copy and run:

```typescript
// example.ts
import { createZyraxonClient } from '@zyraxon-ai/sdk'

async function main() {
  // Create the client
  const client = createZyraxonClient({
    baseUrl: 'http://localhost:3000',
  })

  // Send a message
  const response = await client.chat({
    message: 'Write a simple Python function to calculate the Fibonacci sequence',
    model: 'big-pickle',
  })

  // Print the response
  console.log('Response:')
  console.log(response.text)

  // Print usage information
  console.log('\nUsage:')
  console.log(`Prompt tokens: ${response.usage.promptTokens}`)
  console.log(`Completion tokens: ${response.usage.completionTokens}`)
  console.log(`Total tokens: ${response.usage.totalTokens}`)
}

main()
```

---

## Streaming Responses

For a better user experience, you can stream responses so they appear in real-time:

```typescript
import { createZyraxonClient } from '@zyraxon-ai/sdk'

async function streamExample() {
  const client = createZyraxonClient({
    baseUrl: 'http://localhost:3000',
  })

  const stream = await client.chatStream({
    message: 'Explain the concept of object-oriented programming',
  })

  for await (const chunk of stream) {
    process.stdout.write(chunk.text)
  }

  console.log('\n')
}

streamExample()
```

---

## Working with Files

The SDK can read and write files directly on the server:

```typescript
import { createZyraxonClient } from '@zyraxon-ai/sdk'

async function fileOperations() {
  const client = createZyraxonClient({
    baseUrl: 'http://localhost:3000',
    directory: '/path/to/your/project',
  })

  // Read a file
  const file = await client.readFile({
    path: 'src/index.ts',
  })
  console.log('File content:', file.content)

  // Write a file
  await client.writeFile({
    path: 'output/result.txt',
    content: 'This file was created by ZYRAXON SDK!',
  })

  console.log('File operations completed!')
}

fileOperations()
```

---

## Next Steps

Now that you have the basics down, here are some things you can explore:

1. **[Full API Reference](../SDK.md#api-reference)** — Learn about all available methods and options
2. **[Advanced Examples](../SDK.md#examples)** — See complete, real-world use cases
3. **[Configuration Guide](../SDK.md#configuration)** — Customize the SDK for your needs
4. **[TypeScript Support](../SDK.md#typescript-support)** — Use the SDK with full type safety

---

## Need Help?

If you run into any issues or have questions:

- **GitHub Issues**: [https://github.com/onelpawarai-X/ZYRAXON-AI/issues](https://github.com/onelpawarai-X/ZYRAXON-AI/issues)
- **Documentation**: [https://zyraxonai.lovable.app](https://zyraxonai.lovable.app)
- **Community**: Join our Discord server for real-time help

---

*Created by OMG / Lx Sayidi — [GitHub](https://github.com/onelpawarai-X)*
