/**
 * ZYRAXON X - Knowledge Base Builder
 * Extracts text from PDFs and generates knowledge-base.json
 * Run: node scripts/build-knowledge.mjs
 */

import { readdir, readFile, writeFile, stat } from "fs/promises"
import { join, basename } from "path"
import { fileURLToPath } from "url"

const __dirname = fileURLToPath(new URL(".", import.meta.url))
const KNOWLEDGE_DIR = join(__dirname, "..", "src", "x", "knowledge")
const OUTPUT_FILE = join(KNOWLEDGE_DIR, "knowledge-base.json")

const CATEGORIES = ["aircraft", "vehicles", "iot", "space", "robots"]

function extractTitle(filename) {
  return filename
    .replace(/\.pdf$/i, "")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, c => c.toUpperCase())
}

function generateSummary(content) {
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 20)
  return sentences.slice(0, 3).join(". ").substring(0, 500)
}

function extractTags(content, filename) {
  const tags = []
  const patterns = [
    "engine", "motor", "battery", "sensor", "control",
    "navigation", "communication", "hydraulic", "electrical",
    "fuel", "brake", "steering", "propulsion", "orbit",
    "satellite", "rocket", "drone", "aircraft", "vehicle",
    "mqtt", "wifi", "bluetooth", "serial", "gpio",
    "emergency", "safety", "maintenance", "diagnostic",
    "flight", "launch", "telemetry", "autopilot", "thrust",
    "wiring", "circuit", "power", "voltage", "current",
    "temperature", "pressure", "flow", "pump", "valve",
    "servo", "actuator", "relay", "stepper", "encoder",
    "lidar", "camera", "imu", "gps", "compass",
    "robot", "manipulator", "gripper", "kinematic", "planning",
  ]
  const text = (filename + " " + content.substring(0, 3000)).toLowerCase()
  for (const p of patterns) {
    if (text.includes(p)) tags.push(p)
  }
  return [...new Set(tags)].slice(0, 20)
}

async function extractPdfText(filePath) {
  try {
    const data = await readFile(filePath)
    const bytes = new Uint8Array(data)

    let text = ""
    let inStream = false
    let buffer = ""

    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i]
      if (b === 40) {
        inStream = true
        buffer = ""
      } else if (b === 41 && inStream) {
        inStream = false
        text += buffer
        buffer = ""
      } else if (inStream && b >= 32 && b <= 126) {
        buffer += String.fromCharCode(b)
      } else if (!inStream && b >= 32 && b <= 126) {
        text += String.fromCharCode(b)
      } else if (b === 10 || b === 13) {
        text += "\n"
      }
    }

    text = text
      .replace(/\s+/g, " ")
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/\n\s*\n/g, "\n\n")
      .trim()

    return text
  } catch (e) {
    console.warn(`  WARN: Could not extract text from ${basename(filePath)}: ${e.message}`)
    return ""
  }
}

async function processCategory(category) {
  const dir = join(KNOWLEDGE_DIR, category)
  let files
  try {
    files = (await readdir(dir)).filter(f => f.toLowerCase().endsWith(".pdf"))
  } catch {
    console.log(`  SKIP: ${category}/ directory not found`)
    return []
  }

  console.log(`  Processing ${files.length} PDFs in ${category}/...`)
  const entries = []

  for (let i = 0; i < files.length; i++) {
    const filename = files[i]
    const filePath = join(dir, filename)
    const fileStat = await stat(filePath)

    process.stdout.write(`    [${i + 1}/${files.length}] ${filename}... `)

    const content = await extractPdfText(filePath)
    const truncatedContent = content.substring(0, 8000)

    const entry = {
      id: `${category}_${filename}`,
      category,
      filename,
      title: extractTitle(filename),
      source: category.charAt(0).toUpperCase() + category.slice(1),
      content: truncatedContent,
      summary: generateSummary(content),
      tags: extractTags(content, filename),
      addedAt: Date.now(),
      sizeBytes: fileStat.size,
    }

    entries.push(entry)
    console.log(`${(content.length / 1024).toFixed(1)}KB text`)
  }

  return entries
}

async function main() {
  console.log("=== ZYRAXON X Knowledge Base Builder ===\n")
  console.log(`Source: ${KNOWLEDGE_DIR}`)
  console.log(`Output: ${OUTPUT_FILE}\n`)

  const allEntries = []
  for (const category of CATEGORIES) {
    const entries = await processCategory(category)
    allEntries.push(...entries)
    console.log()
  }

  console.log(`Total entries: ${allEntries.length}`)
  console.log(`Writing knowledge-base.json...`)

  await writeFile(OUTPUT_FILE, JSON.stringify(allEntries, null, 2), "utf-8")

  const stats = await stat(OUTPUT_FILE)
  console.log(`Done! File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`)
  console.log(`\nCategories:`)
  const byCat = {}
  for (const e of allEntries) {
    byCat[e.category] = (byCat[e.category] || 0) + 1
  }
  for (const [cat, count] of Object.entries(byCat)) {
    console.log(`  ${cat}: ${count}`)
  }
}

main().catch(console.error)
