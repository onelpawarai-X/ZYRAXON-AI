# ZYRAXON AI SDK

> **The official JavaScript/TypeScript SDK for ZYRAXON AI — Build AI-powered applications with ease**

The ZYRAXON AI SDK provides a comprehensive set of tools and APIs for developers who want to integrate ZYRAXON's powerful AI capabilities into their own applications. Whether you are building a chatbot, a code editor, a voice assistant, or any other AI-powered application, this SDK gives you everything you need to get started quickly and efficiently.

---

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [API Reference](#api-reference)
- [Examples](#examples)
- [Advanced Usage](#advanced-usage)
- [TypeScript Support](#typescript-support)
- [Troubleshooting](#troubleshooting)
- [License](#license)

---

## Installation

You can install the ZYRAXON AI SDK using your preferred package manager. The SDK supports Node.js 18 and above, as well as modern runtimes like Bun and Deno.

```bash
# Using npm
npm install @zyraxon-ai/sdk

# Using bun (recommended for ZYRAXON projects)
bun add @zyraxon-ai/sdk

# Using yarn
yarn add @zyraxon-ai/sdk

# Using pnpm
pnpm add @zyraxon-ai/sdk
```

---

## Quick Start

### Basic Usage

The simplest way to get started with the ZYRAXON AI SDK is to create a client and start chatting with the AI. The client handles all the communication with the ZYRAXON server, including authentication, session management, and error handling.

```typescript
import { createZyraxonClient } from '@zyraxon-ai/sdk'

// Create a client instance
const client = createZyraxonClient({
  baseUrl: 'http://localhost:3000',  // ZYRAXON server URL
})

// Send a chat message
async function chat() {
  const response = await client.chat({
    message: 'Hello ZYRAXON! Can you help me write a Python script?',
    model: 'big-pickle',  // Optional: specify the model to use
  })

  console.log('AI Response:', response.text)
  console.log('Usage:', response.usage)
}

chat()
```

### Using with Server

If you want to run both the ZYRAXON server and your application together, you can use the `createZyraxon` function which starts the server and creates a client in one step.

```typescript
import { createZyraxon } from '@zyraxon-ai/sdk'

async function main() {
  // Start the server and create a client
  const { client, server } = await createZyraxon({
    port: 3000,
    hostname: '127.0.0.1',
  })

  console.log('Server running on:', server.url)

  // Now use the client
  const response = await client.chat({
    message: 'What can you do?',
  })

  console.log(response.text)
}

main()
```

---

## Configuration

The ZYRAXON AI SDK provides several configuration options to customize its behavior according to your needs.

### Client Configuration

```typescript
import { createZyraxonClient } from '@zyraxon-ai/sdk'

const client = createZyraxonClient({
  // Base URL of the ZYRAXON server
  baseUrl: 'http://localhost:3000',

  // API key for authentication (optional)
  apiKey: 'your-api-key',

  // Working directory for file operations
  directory: '/path/to/your/project',

  // Request timeout in milliseconds (default: 30000)
  timeout: 60000,

  // Custom headers
  headers: {
    'X-Custom-Header': 'value',
  },
})
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `baseUrl` | `string` | `http://localhost:3000` | The base URL of the ZYRAXON server |
| `apiKey` | `string` | `undefined` | API key for authentication |
| `directory` | `string` | `undefined` | Working directory for file operations |
| `timeout` | `number` | `30000` | Request timeout in milliseconds |
| `headers` | `Record<string, string>` | `{}` | Custom HTTP headers |
| `fetch` | `Function` | `globalThis.fetch` | Custom fetch implementation |

---

## API Reference

### Client Methods

#### `client.chat(options)`

Send a chat message to the AI and receive a response.

```typescript
const response = await client.chat({
  message: 'Write a function to calculate factorial',
  model: 'big-pickle',  // Optional
  temperature: 0.7,     // Optional
  maxTokens: 2000,      // Optional
})

console.log(response.text)
console.log(response.usage)  // Token usage information
```

#### `client.chatStream(options)`

Send a chat message and receive a streaming response. This is useful for displaying responses in real-time.

```typescript
const stream = await client.chatStream({
  message: 'Explain quantum computing in simple terms',
})

for await (const chunk of stream) {
  process.stdout.write(chunk.text)
}
```

#### `client.readFile(options)`

Read a file from the working directory.

```typescript
const file = await client.readFile({
  path: 'src/index.ts',
})

console.log(file.content)
console.log(file.encoding)
```

#### `client.writeFile(options)`

Write content to a file in the working directory.

```typescript
await client.writeFile({
  path: 'output/result.txt',
  content: 'Hello, World!',
  encoding: 'utf-8',
})
```

#### `client.runCommand(options)`

Execute a shell command on the server.

```typescript
const result = await client.runCommand({
  command: 'ls -la',
  timeout: 10000,
})

console.log(result.stdout)
console.log(result.stderr)
console.log(result.exitCode)
```

#### `client.createSession(options)`

Create a new conversation session.

```typescript
const session = await client.createSession({
  name: 'My Project Session',
  description: 'Working on the new feature',
})

console.log(session.id)
```

#### `client.chatInSession(options)`

Send a message in an existing session.

```typescript
const response = await client.chatInSession({
  sessionId: 'session-id',
  message: 'Continue from where we left off',
})
```

#### `client.saveMemory(options)`

Store a key-value pair in the AI's memory.

```typescript
await client.saveMemory({
  key: 'user_preference',
  value: 'dark_mode',
  category: 'settings',
})
```

#### `client.getMemory(options)`

Retrieve a value from the AI's memory.

```typescript
const memory = await client.getMemory({
  key: 'user_preference',
})

console.log(memory.value)  // 'dark_mode'
```

---

## Examples

### Example 1: Web Application Chat Interface

Here is a complete example of how to build a chat interface for a web application using the ZYRAXON AI SDK.

```typescript
// server.ts
import { createZyraxonClient } from '@zyraxon-ai/sdk'
import express from 'express'

const app = express()
app.use(express.json())

const client = createZyraxonClient({
  baseUrl: 'http://localhost:3000',
})

app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body

    const response = await client.chat({
      message,
      model: 'big-pickle',
    })

    res.json({
      success: true,
      data: {
        text: response.text,
        usage: response.usage,
      },
    })
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    })
  }
})

app.listen(4000, () => {
  console.log('Chat API running on http://localhost:4000')
})
```

### Example 2: CLI Tool

Create a command-line tool that uses ZYRAXON AI to answer questions.

```typescript
#!/usr/bin/env node
// cli.ts
import { createZyraxonClient } from '@zyraxon-ai/sdk'

const client = createZyraxonClient({
  baseUrl: 'http://localhost:3000',
})

async function main() {
  const args = process.argv.slice(2)
  const command = args[0]
  const prompt = args.slice(1).join(' ')

  if (command === 'ask' && prompt) {
    console.log('Thinking...')

    const response = await client.chat({
      message: prompt,
      model: 'big-pickle',
    })

    console.log('\nAnswer:')
    console.log(response.text)
  } else {
    console.log('Usage: zyraxon-ai ask <your question>')
  }
}

main()
```

### Example 3: Discord Bot

Build a Discord bot that responds to messages using ZYRAXON AI.

```typescript
// discord-bot.ts
import { createZyraxonClient } from '@zyraxon-ai/sdk'
import { Client, GatewayIntentBits } from 'discord.js'

const client = createZyraxonClient({
  baseUrl: 'http://localhost:3000',
})

const discord = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
})

discord.on('messageCreate', async (message) => {
  // Ignore bot messages
  if (message.author.bot) return

  // Only respond to messages that mention the bot
  if (!message.mentions.has(discord.user)) return

  // Extract the question from the message
  const question = message.content.replace(/<@!?\d+>/g, '').trim()

  if (!question) {
    message.reply('Please ask me a question!')
    return
  }

  try {
    // Get AI response
    const response = await client.chat({
      message: question,
      model: 'big-pickle',
    })

    // Reply with the AI response
    message.reply(response.text)
  } catch (error) {
    message.reply('Sorry, I encountered an error processing your request.')
  }
})

discord.login('your-discord-bot-token')
```

### Example 4: File Processing Pipeline

Use the SDK to process multiple files and generate reports.

```typescript
// file-processor.ts
import { createZyraxonClient } from '@zyraxon-ai/sdk'
import fs from 'fs/promises'

const client = createZyraxonClient({
  baseUrl: 'http://localhost:3000',
  directory: '/path/to/project',
})

async function analyzeCodebase() {
  // Read all TypeScript files
  const files = await client.runCommand({
    command: 'find src -name "*.ts" -type f',
  })

  const fileList = files.stdout.split('\n').filter(Boolean)

  // Analyze each file
  const analysis = []
  for (const file of fileList) {
    const fileContent = await client.readFile({ path: file })

    const response = await client.chat({
      message: `Analyze this code and suggest improvements:\n\n${fileContent.content}`,
      model: 'big-pickle',
    })

    analysis.push({
      file,
      suggestions: response.text,
    })
  }

  // Generate report
  const report = analysis
    .map((a) => `## ${a.file}\n\n${a.suggestions}`)
    .join('\n\n---\n\n')

  await client.writeFile({
    path: 'CODE_REVIEW_REPORT.md',
    content: report,
  })

  console.log('Code review report generated!')
}

analyzeCodebase()
```

---

## Advanced Usage

### Custom Error Handling

The SDK provides detailed error information that you can use to handle failures gracefully.

```typescript
import { createZyraxonClient, ZyraxonError } from '@zyraxon-ai/sdk'

const client = createZyraxonClient()

try {
  const response = await client.chat({
    message: 'Hello',
  })
} catch (error) {
  if (error instanceof ZyraxonError) {
    console.error('ZYRAXON Error:', error.message)
    console.error('Error Code:', error.code)
    console.error('Status:', error.status)

    // Handle specific error types
    switch (error.code) {
      case 'AUTHENTICATION_FAILED':
        // Handle auth error
        break
      case 'RATE_LIMIT_EXCEEDED':
        // Handle rate limiting
        break
      case 'SERVER_UNAVAILABLE':
        // Handle server down
        break
    }
  } else {
    console.error('Unexpected error:', error)
  }
}
```

### Streaming Responses

For better user experience, you can stream responses instead of waiting for the complete response.

```typescript
async function streamChat(message: string) {
  const stream = await client.chatStream({
    message,
    temperature: 0.7,
  })

  let fullResponse = ''

  for await (const chunk of stream) {
    // Display each chunk as it arrives
    process.stdout.write(chunk.text)
    fullResponse += chunk.text
  }

  console.log('\n\nComplete response:', fullResponse)
}
```

### Session Management

Maintain conversation context across multiple messages using sessions.

```typescript
async function multiTurnConversation() {
  // Create a new session
  const session = await client.createSession({
    name: 'Coding Session',
  })

  // First message
  const response1 = await client.chatInSession({
    sessionId: session.id,
    message: 'I want to build a REST API with Express.js',
  })

  console.log('Response 1:', response1.text)

  // Follow-up message (context is maintained)
  const response2 = await client.chatInSession({
    sessionId: session.id,
    message: 'Now add authentication middleware',
  })

  console.log('Response 2:', response2.text)

  // Another follow-up
  const response3 = await client.chatInSession({
    sessionId: session.id,
    message: 'Write tests for the API',
  })

  console.log('Response 3:', response3.text)
}
```

### Working with Files

The SDK provides powerful file operations for code generation and manipulation.

```typescript
async function generateProject() {
  // Create project structure
  const structure = {
    'package.json': JSON.stringify({
      name: 'my-project',
      version: '1.0.0',
      scripts: {
        dev: 'ts-node src/index.ts',
        build: 'tsc',
      },
    }, null, 2),

    'src/index.ts': `
import express from 'express'

const app = express()
app.use(express.json())

app.get('/', (req, res) => {
  res.json({ message: 'Hello World' })
})

app.listen(3000, () => {
  console.log('Server running on port 3000')
})
`,

    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        target: 'ES2020',
        module: 'commonjs',
        outDir: './dist',
        rootDir: './src',
      },
    }, null, 2),
  }

  // Write all files
  for (const [path, content] of Object.entries(structure)) {
    await client.writeFile({ path, content })
    console.log(`Created: ${path}`)
  }

  console.log('Project structure created!')
}
```

---

## TypeScript Support

The ZYRAXON AI SDK is written in TypeScript and provides complete type definitions. This means you get full autocompletion and type checking in your IDE.

```typescript
import type {
  ZyraxonClientConfig,
  ChatResponse,
  ChatOptions,
  StreamResponse,
} from '@zyraxon-ai/sdk'

// All types are available for type annotations
const config: ZyraxonClientConfig = {
  baseUrl: 'http://localhost:3000',
}

const options: ChatOptions = {
  message: 'Hello',
  model: 'big-pickle',
  temperature: 0.7,
}

const response: ChatResponse = await client.chat(options)

// Full type inference
console.log(response.text)      // string
console.log(response.usage)     // { promptTokens, completionTokens, totalTokens }
```

---

## Troubleshooting

### Common Issues

#### Connection Refused

If you see "Connection refused" errors, make sure the ZYRAXON server is running:

```bash
# Check if the server is running
curl http://localhost:3000/health

# Start the server if it's not running
bun run --cwd packages/zyraxon script/build.ts
```

#### Authentication Errors

If you get authentication errors, make sure you are providing the correct API key:

```typescript
const client = createZyraxonClient({
  baseUrl: 'http://localhost:3000',
  apiKey: 'your-correct-api-key',  // Check your API key
})
```

#### Timeout Errors

If requests are timing out, increase the timeout value:

```typescript
const client = createZyraxonClient({
  baseUrl: 'http://localhost:3000',
  timeout: 120000,  // 2 minutes timeout
})
```

#### CORS Errors

If you are running the SDK in a browser and getting CORS errors, you may need to configure the ZYRAXON server to allow cross-origin requests:

```typescript
// On the server side
const { client, server } = await createZyraxon({
  port: 3000,
  cors: ['http://localhost:4000'],  // Allow your frontend origin
})
```

---

## License

This project is licensed under the **Zyraxon Sovereign License — X Edition (ZSL-X)**.

- Free for all uses including commercial
- Attribution required when redistributing
- Automatically transitions to MEKRA-X on January 1, 2028

For more details, see the [LICENSE](./LICENSE) file.

---

## Links

- [ZYRAXON AI Website](https://zyraxonai.lovable.app)
- [GitHub Repository](https://github.com/onelpawarai-X/ZYRAXON-AI)
- [Cloud Agent](https://zyraxon-pro.ai.studio)
- [YouTube Channel](https://youtube.com/@zyraxon-aix)

---

*Created by OMG / Lx Sayidi — [GitHub](https://github.com/onelpawarai-X)*
