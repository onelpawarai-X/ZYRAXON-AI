#!/usr/bin/env node
// ZYRAXON Tool Counter — Single source of truth
// Usage: node verify-tool-count.cjs
// Any AI or user can run this to get the SAME number

const fs = require("fs");
const path = require("path");

const base = path.resolve(__dirname, "..");
const registryPath = path.join(base, "packages", "zyraxon", "src", "x", "x-tool-registry.ts");

// Read TOOL_TIER_MAP — this is the SINGLE SOURCE OF TRUTH
const content = fs.readFileSync(registryPath, "utf-8");

// Extract TOOL_TIER_MAP block
const tierStart = content.indexOf("const TOOL_TIER_MAP");
let braceCount = 0;
let tierEnd = -1;
for (let i = tierStart; i < content.length; i++) {
  if (content[i] === "{") braceCount++;
  if (content[i] === "}") {
    braceCount--;
    if (braceCount === 0) { tierEnd = i; break; }
  }
}
const tierBlock = content.substring(tierStart, tierEnd + 1);

// Remove comments
const cleanBlock = tierBlock.replace(/\/\/[^\n]*/g, "");

// Count entries by tier
const freeCount = (cleanBlock.match(/:\s*"free"/g) || []).length;
const proCount = (cleanBlock.match(/:\s*"pro"/g) || []).length;
const maxCount = (cleanBlock.match(/:\s*"max"/g) || []).length;
const ultraCount = (cleanBlock.match(/:\s*"ultra"/g) || []).length;
const total = freeCount + proCount + maxCount + ultraCount;

// Count unique keys
const keyMatches = cleanBlock.match(/(\w+):\s*"(free|pro|max|ultra)"/g) || [];
const keys = keyMatches.map(m => m.split(":")[0].trim());
const uniqueKeys = [...new Set(keys)].sort();
const duplicates = keys.length - uniqueKeys.length;

console.log("═══════════════════════════════════════════════════════");
console.log("ZYRAXON TOOL COUNT VERIFICATION");
console.log("═══════════════════════════════════════════════════════");
console.log("");
console.log("Source: TOOL_TIER_MAP in x-tool-registry.ts");
console.log("");
console.log("By Tier:");
console.log(`  Free:  ${freeCount}`);
console.log(`  Pro:   ${proCount}`);
console.log(`  Max:   ${maxCount}`);
console.log(`  Ultra: ${ultraCount}`);
console.log("  ─────────────────────────────────");
console.log(`  TOTAL: ${total}`);
console.log("");
if (duplicates > 0) {
  console.log(`WARNING: ${duplicates} duplicate keys found!`);
}
console.log("═══════════════════════════════════════════════════════");
console.log(`GRAND TOTAL TOOLS:            ${total}`);
console.log("═══════════════════════════════════════════════════════");
console.log("");
console.log("This count is REAL and VERIFIABLE.");
console.log("Any AI running this script will get the same number.");
