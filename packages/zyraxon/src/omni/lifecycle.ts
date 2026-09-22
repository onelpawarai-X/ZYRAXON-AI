// ZYRAXON OMNI-KERNEL Lifecycle Integration
// Wraps tool execution with OMNI-KERNEL hooks:
// - processBeforeToolCall: secret redaction + prediction
// - processAfterToolCall: memory recording + learning + repair
// - processBeforeFileEdit: shadow clone dry-run validation

import { OmniKernelService, type ToolCallContext, type ToolResultContext, type FileEditContext } from "@zyraxon-ai/core/omni"

let _kernel: OmniKernelService | null = null
let _initAttempted = false

function getKernel(): OmniKernelService | null {
  if (_kernel) return _kernel
  if (_initAttempted) return null
  _initAttempted = true
  try {
    _kernel = new OmniKernelService()
    _kernel.init()
    return _kernel
  } catch {
    return null
  }
}

export interface LifecycleBeforeResult {
  sanitizedArgs: unknown
  prediction: {
    predictedFiles: string[]
    predictedCommands: string[]
    confidence: number
  }
  hookApplied: boolean
}

export interface LifecycleAfterResult {
  recorded: boolean
  repairProposal: unknown | null
  learned: boolean
  hookApplied: boolean
}

export interface LifecycleFileEditResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  repairProposal: unknown | null
  hookApplied: boolean
}

/**
 * Called BEFORE every tool execution.
 * Runs secret redaction and file/command prediction.
 */
export async function omniBeforeToolCall(toolName: string, args: unknown, sessionId?: string): Promise<LifecycleBeforeResult> {
  const kernel = getKernel()
  if (!kernel) {
    return {
      sanitizedArgs: args,
      prediction: { predictedFiles: [], predictedCommands: [], confidence: 0 },
      hookApplied: false,
    }
  }
  try {
    const context: ToolCallContext = { toolName, args, sessionId }
    const result = await kernel.processBeforeToolCall(context)
    return {
      sanitizedArgs: result.sanitizedArgs,
      prediction: result.prediction,
      hookApplied: true,
    }
  } catch {
    return {
      sanitizedArgs: args,
      prediction: { predictedFiles: [], predictedCommands: [], confidence: 0 },
      hookApplied: false,
    }
  }
}

/**
 * Called AFTER every tool execution.
 * Records result, learns patterns, proposes repairs on failure.
 */
export async function omniAfterToolCall(
  toolName: string,
  result: unknown,
  success: boolean,
  latency: number,
  sessionId?: string,
): Promise<LifecycleAfterResult> {
  const kernel = getKernel()
  if (!kernel) {
    return { recorded: false, repairProposal: null, learned: false, hookApplied: false }
  }
  try {
    const context: ToolResultContext = { toolName, result, success, latency, sessionId }
    const outcome = await kernel.processAfterToolCall(context)
    return {
      recorded: outcome.recorded,
      repairProposal: outcome.repairProposal,
      learned: outcome.learned,
      hookApplied: true,
    }
  } catch {
    return { recorded: false, repairProposal: null, learned: false, hookApplied: false }
  }
}

/**
 * Called BEFORE file edit operations (write, edit tools).
 * Runs shadow clone dry-run to validate changes.
 */
export async function omniBeforeFileEdit(filePath: string, oldContent: string, newContent: string): Promise<LifecycleFileEditResult> {
  const kernel = getKernel()
  if (!kernel) {
    return { valid: true, errors: [], warnings: [], repairProposal: null, hookApplied: false }
  }
  try {
    const context: FileEditContext = { filePath, oldContent, newContent }
    const result = await kernel.processBeforeFileEdit(context)
    return {
      valid: result.valid,
      errors: result.errors,
      warnings: result.warnings,
      repairProposal: result.repairProposal,
      hookApplied: true,
    }
  } catch {
    return { valid: true, errors: [], warnings: [], repairProposal: null, hookApplied: false }
  }
}

/**
 * Get OMNI-KERNEL metrics for observability.
 */
export function omniGetMetrics() {
  const kernel = getKernel()
  if (!kernel) {
    return { totalToolCalls: 0, successRate: 0, avgLatency: 0, fileEditsChecked: 0 }
  }
  return kernel.getMetrics()
}

/**
 * Shutdown the OMNI-KERNEL cleanly.
 */
export function omniShutdown() {
  if (_kernel) {
    _kernel.shutdown()
    _kernel = null
    _initAttempted = false
  }
}
