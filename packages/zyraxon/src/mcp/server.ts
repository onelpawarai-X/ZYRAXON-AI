// ZYRAXON MCP Server — Ultra Tool Registry
// Provides unified access to all tool categories including DARK EMPEROR ULTRA tools
// and OMNI-KERNEL ULTRA-15 mechanisms

import { ultraTools } from "./ultra-tools"
import { ultraCodeGen } from "./ultra-codegen"
import { ultraSecuritySweep } from "./ultra-security-sweep"
import { ultraPerformance } from "./ultra-performance"
import { ultraRefactor } from "./ultra-refactor"
import { ultraTestGen } from "./ultra-test-gen"
import { ultraAutoDeploy } from "./ultra-autodeploy"
import { omniTools } from "./omni-tools"

// ============================================
// ULTRA TOOL REGISTRY — Permission-controlled
// ============================================

export type UltraToolFn = (args: Record<string, unknown>) => Promise<{
  success: boolean
  output: string
  error?: string
  details?: Record<string, unknown>
}>

export interface UltraToolEntry {
  execute: UltraToolFn
  permission: string
  description: string
  privileged: boolean
}

// Permission constants for privileged operations
export const PERMISSIONS = {
  FILE_READ: "tool.ultra.file.read",
  FILE_WRITE: "tool.ultra.file.write",
  EXEC_COMMAND: "tool.ultra.exec.command",
  CODE_GENERATE: "tool.ultra.code.generate",
  SECURITY_SCAN: "tool.ultra.security.scan",
  DEPLOY: "tool.ultra.deploy",
  PERFORMANCE_ANALYZE: "tool.ultra.performance.analyze",
  REFACTOR: "tool.ultra.refactor",
  TEST_GEN: "tool.ultra.test.generate",
  DEBUG: "tool.ultra.debug",
  DOC_GEN: "tool.ultra.doc.generate",
  OMNI_COMPOSE: "tool.omni.compose",
  OMNI_EXECUTE: "tool.omni.execute",
  OMNI_DEPLOY: "tool.omni.deploy",
} as const

// ============================================
// DARK EMPEROR ULTRA TOOLS (8 tools)
// Each with permission source and description
// ============================================

export const ULTRA_TOOLS: Record<string, UltraToolEntry> = {
  ultraCodeGen: {
    execute: ultraCodeGen,
    permission: PERMISSIONS.CODE_GENERATE,
    description: "Advanced code generation with AST analysis, complexity theory, and type theory",
    privileged: true,
  },
  ultraSecuritySweep: {
    execute: ultraSecuritySweep,
    permission: PERMISSIONS.SECURITY_SCAN,
    description: "Real cryptographic and security analysis engine with number theory",
    privileged: true,
  },
  ultraPerformance: {
    execute: ultraPerformance,
    permission: PERMISSIONS.PERFORMANCE_ANALYZE,
    description: "Statistical analysis, queuing theory, memory profiling, algorithm benchmarking",
    privileged: true,
  },
  ultraRefactor: {
    execute: ultraRefactor,
    permission: PERMISSIONS.REFACTOR,
    description: "Category theory, cyclomatic/cognitive/Halstead complexity, AST transformations",
    privileged: true,
  },
  ultraTestGen: {
    execute: ultraTestGen,
    permission: PERMISSIONS.TEST_GEN,
    description: "NIST ACTS pairwise, boundary value, mutation testing, property-based generation",
    privileged: true,
  },
  ultraAutoDeploy: {
    execute: ultraAutoDeploy,
    permission: PERMISSIONS.DEPLOY,
    description: "DAG analysis, circuit breakers, canary deployments, risk assessment",
    privileged: true,
  },
  ultraDocGen: {
    execute: ultraTools.ultraDocGen,
    permission: PERMISSIONS.DOC_GEN,
    description: "Comprehensive documentation generation with JSDoc extraction and dependency mapping",
    privileged: false,
  },
  ultraDebug: {
    execute: ultraTools.ultraDebug,
    permission: PERMISSIONS.DEBUG,
    description: "Null dereference detection, resource leak analysis, race condition identification",
    privileged: true,
  },
}

// ============================================
// OMNI-KERNEL ULTRA-15 MECHANISMS (15 tools)
// ============================================

export const OMNI_TOOLS: Record<string, UltraToolEntry> = {
  multiFileCompose: {
    execute: omniTools.omniMultiFileCompose,
    permission: PERMISSIONS.OMNI_COMPOSE,
    description: "Parallel edit across 10+ interconnected files with atomic operations",
    privileged: true,
  },
  terminalAutonomy: {
    execute: omniTools.omniTerminalAutonomy,
    permission: PERMISSIONS.OMNI_EXECUTE,
    description: "Auto-test, trace data flow, fix bugs with terminal-native autonomy",
    privileged: true,
  },
  backgroundLoop: {
    execute: omniTools.omniBackgroundLoop,
    permission: PERMISSIONS.OMNI_EXECUTE,
    description: "Parallel sub-agent spawning for background task execution",
    privileged: true,
  },
  behaviorCascade: {
    execute: omniTools.omniBehaviorCascade,
    permission: PERMISSIONS.OMNI_EXECUTE,
    description: "User flow-state detection with behavior cascade analysis",
    privileged: false,
  },
  gitPair: {
    execute: omniTools.omniGitPair,
    permission: PERMISSIONS.OMNI_EXECUTE,
    description: "Auto-commit with paired rollback capabilities",
    privileged: true,
  },
  sandboxRuntime: {
    execute: omniTools.omniSandboxRuntime,
    permission: PERMISSIONS.OMNI_EXECUTE,
    description: "Isolated container execution with sandboxed runtime",
    privileged: true,
  },
  ideaToDeploy: {
    execute: omniTools.omniIdeaToDeploy,
    permission: PERMISSIONS.OMNI_DEPLOY,
    description: "Full project generation from idea to deployment",
    privileged: true,
  },
  costRouter: {
    execute: omniTools.omniCostRouter,
    permission: PERMISSIONS.OMNI_EXECUTE,
    description: "25+ provider auto-routing with cost optimization",
    privileged: false,
  },
  liveObservability: {
    execute: omniTools.omniLiveObservability,
    permission: PERMISSIONS.OMNI_EXECUTE,
    description: "Crash capture and analysis with live observability",
    privileged: false,
  },
  knowledgeGraph: {
    execute: omniTools.omniKnowledgeGraph,
    permission: PERMISSIONS.OMNI_EXECUTE,
    description: "Hybrid pattern memory with knowledge graph construction",
    privileged: false,
  },
  securityScan: {
    execute: omniTools.omniSecurityScan,
    permission: PERMISSIONS.SECURITY_SCAN,
    description: "OWASP Top 10 scanning with security vulnerability detection",
    privileged: true,
  },
  silentPrecompile: {
    execute: omniTools.omniSilentPrecompile,
    permission: PERMISSIONS.OMNI_EXECUTE,
    description: "Background syntax verification with silent precompilation",
    privileged: false,
  },
  visualContextSync: {
    execute: omniTools.omniVisualContextSync,
    permission: PERMISSIONS.OMNI_EXECUTE,
    description: "Screen error detection with visual context synchronization",
    privileged: false,
  },
  selfEvolvingPrompt: {
    execute: omniTools.omniSelfEvolvingPrompt,
    permission: PERMISSIONS.OMNI_EXECUTE,
    description: "Dynamic prompt rules with self-evolving prompt engine",
    privileged: false,
  },
  zeroTrustStrip: {
    execute: omniTools.omniZeroTrustStrip,
    permission: PERMISSIONS.SECURITY_SCAN,
    description: "Credential scanning and stripping with zero-trust token model",
    privileged: true,
  },
}

// ============================================
// TOOL COUNT
// ============================================

export const TOOL_COUNT = {
  ultra: Object.keys(ULTRA_TOOLS).length,
  omni: Object.keys(OMNI_TOOLS).length,
  total: Object.keys(ULTRA_TOOLS).length + Object.keys(OMNI_TOOLS).length,
}

// ============================================
// LOOKUP HELPERS
// ============================================

/** Get an ultra tool by name with permission info */
export function getUltraTool(name: string): UltraToolEntry | null {
  return ULTRA_TOOLS[name] ?? null
}

/** Get an omni tool by name with permission info */
export function getOmniTool(name: string): UltraToolEntry | null {
  return OMNI_TOOLS[name] ?? null
}

/** Get all tools in a category */
export function getCategoryTools(category: "ultra" | "omni"): Record<string, UltraToolEntry> {
  return category === "ultra" ? ULTRA_TOOLS : OMNI_TOOLS
}

/** List all tool names across categories */
export function listAllTools(): string[] {
  return [
    ...Object.keys(ULTRA_TOOLS).map(n => `ultra.${n}`),
    ...Object.keys(OMNI_TOOLS).map(n => `omni.${n}`),
  ]
}

/** Check if a tool requires elevated permissions */
export function isPrivileged(name: string): boolean {
  return ULTRA_TOOLS[name]?.privileged ?? OMNI_TOOLS[name]?.privileged ?? false
}

/** Get permission string for a tool */
export function getToolPermission(name: string): string | null {
  return ULTRA_TOOLS[name]?.permission ?? OMNI_TOOLS[name]?.permission ?? null
}

// Export everything
export default { ULTRA_TOOLS, OMNI_TOOLS, TOOL_COUNT, getUltraTool, getOmniTool, getCategoryTools, listAllTools, isPrivileged, getToolPermission }
