/**
 * Test: Local Model Provider
 * Scans for GGUF models, detects backends, runs inference
 */
import { scanForModels, detectBackends, downloadModel, quickTest, getModelDir, generateLocally } from "../src/x/local-model-provider"
import fs from "fs"
import path from "path"

const MODEL_DIR = getModelDir()

async function main() {
  console.log("=== ZYRAXON Local Model Provider Test ===\n")

  // Step 1: Check backends
  console.log("1. Detecting backends...")
  const backends = await detectBackends()
  const available = backends.filter(b => b.available)
  console.log("   Available:", available.length > 0 ? available.map(b => b.name).join(", ") : "NONE")
  for (const b of backends) {
    console.log(`   - ${b.name}: ${b.available ? "YES" : "no"}${b.path ? " (" + b.path + ")" : ""}`)
  }
  if (available.length === 0) {
    console.log("\n   No backend found! Portable llama.cpp is at C:\\zyraxon-workspace\\llama-cpp\\")
    process.exit(1)
  }

  // Step 2: Scan for existing models
  console.log("\n2. Scanning for models...")
  const existingModels = await scanForModels()
  console.log("   Found:", existingModels.length, "models")
  for (const m of existingModels) {
    const sizeMB = (m.sizeBytes / 1024 / 1024).toFixed(1)
    console.log(`   - ${m.name} (${sizeMB}MB, ${m.quantization ?? "?"}, ${m.family ?? "?"})`)
  }

  if (existingModels.length === 0) {
    console.log("\n   No models found! Place .gguf files in:", MODEL_DIR)
    process.exit(1)
  }

  // Step 3: Run inference with first model
  const testModel = existingModels[0]
  console.log("\n3. Running inference test...")
  console.log("   Model:", testModel.name)
  console.log("   Prompt: 'What is 2+2?'\n")

  const result = await generateLocally({
    model: testModel,
    prompt: "What is 2+2? Answer in one word.",
    maxTokens: 50,
    temperature: 0.3,
  })

  console.log("   Response:", result.text)
  console.log("   Speed:", result.tokensPerSec, "tokens/sec")
  console.log("   Tokens:", result.totalTokens)
  console.log("   Time:", result.evalTimeMs, "ms")
  console.log("   Backend:", result.backend)

  console.log("\n=== Test Complete ===")
}

main().catch(console.error)
