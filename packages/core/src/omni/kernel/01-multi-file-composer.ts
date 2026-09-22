import { readFile, readdir, stat } from "node:fs/promises"
import { join, relative, extname, dirname, basename } from "node:path"

/**
 * KERNEL 01: Multi-File Composer
 * Algorithm: Topological Sort (Kahn's) + Betweenness Centrality (Brandes) + Jaccard Similarity + Edit Distance
 * Input: File paths, import relationships, export symbols
 * Output: Ordered edit plan, impact scores, related files, clusters
 * Boundary: Empty file list → empty results; circular deps → DFS fallback; max depth 10
 * Verification: For A→B→C graph, topological sort = [C, B, A]; centrality of B = highest
 */

export interface FileNode {
  path: string
  imports: string[]
  exports: string[]
  size: number
  lastModified: number
  language: string
  cyclomaticComplexity: number
  halsteadVolume: number
  maintainabilityIndex: number
}

export interface DependencyEdge {
  source: string
  target: string
  weight: number
  type: "import" | "re-export" | "dynamic"
}

export interface EditPlan {
  order: string[]
  impacts: Map<string, number>
  clusters: string[][]
  criticalPath: string[]
  estimatedRisk: number
}

export interface ImpactScore {
  file: string
  directDependents: number
  transitiveDependents: number
  centrality: number
  riskScore: number
  changePropagations: number
}

function deterministicHash(input: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

function jaccardSimilarity(setA: Set<string>, setB: Set<string>): number {
  if (setA.size === 0 && setB.size === 0) return 1
  const intersection = new Set([...setA].filter((x) => setB.has(x)))
  const union = new Set([...setA, ...setB])
  return union.size === 0 ? 0 : intersection.size / union.size
}

function shannonEntropy(values: number[]): number {
  const total = values.reduce((s, v) => s + v, 0)
  if (total === 0) return 0
  let entropy = 0
  for (const v of values) {
    if (v > 0) {
      const p = v / total
      entropy -= p * Math.log2(p)
    }
  }
  return entropy
}

function levenshteinDistance(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = 0; i <= m; i++) dp[i][0] = i
  for (let j = 0; j <= n; j++) dp[0][j] = j
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1]
      else dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])
    }
  }
  return dp[m][n]
}

export class MultiFileComposer {
  private fileGraph: Map<string, FileNode> = new Map()
  private reverseGraph: Map<string, Set<string>> = new Map()
  private adjacencyMatrix: number[][] = []
  private nodeIndex: Map<string, number> = new Map()
  private editedFiles: Set<string> = new Set()

  async analyzeDirectory(dirPath: string, maxDepth: number = 10): Promise<string[]> {
    const files: string[] = []
    await this.walkDirectory(dirPath, dirPath, files, 0, maxDepth)
    return files
  }

  private async walkDirectory(basePath: string, currentPath: string, files: string[], depth: number, maxDepth: number) {
    if (depth > maxDepth) return
    const entries = await readdir(currentPath, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "dist") continue
      const fullPath = join(currentPath, entry.name)
      if (entry.isDirectory()) {
        await this.walkDirectory(basePath, fullPath, files, depth + 1, maxDepth)
      } else if (this.isSupportedFile(entry.name)) {
        files.push(fullPath)
      }
    }
  }

  private isSupportedFile(name: string): boolean {
    return /\.(ts|tsx|js|jsx|json|css|scss|html|md|py|go|rs|vue|svelte)$/.test(name)
  }

  async buildDependencyGraph(files: string[]): Promise<Map<string, FileNode>> {
    this.fileGraph.clear()
    this.reverseGraph.clear()
    for (const file of files) {
      try {
        const content = await readFile(file, "utf-8")
        const node = this.parseFileNode(file, content)
        this.fileGraph.set(file, node)
        this.reverseGraph.set(file, new Set())
      } catch {}
    }
    this.resolveEdges()
    this.buildAdjacencyMatrix()
    return this.fileGraph
  }

  private parseFileNode(filePath: string, content: string): FileNode {
    const imports = this.extractImports(content)
    const exports = this.extractExports(content)
    const lines = content.split("\n")
    const cyclomaticComplexity = this.computeCyclomaticComplexity(lines)
    const halsteadVolume = this.computeHalsteadVolume(content)
    const maintainabilityIndex = this.computeMaintainabilityIndex(lines.length, cyclomaticComplexity, halsteadVolume)
    return {
      path: filePath,
      imports,
      exports,
      size: content.length,
      lastModified: Date.now(),
      language: extname(filePath).slice(1),
      cyclomaticComplexity,
      halsteadVolume,
      maintainabilityIndex,
    }
  }

  private extractImports(content: string): string[] {
    const imports: string[] = []
    const patterns = [
      /import\s+(?:\{[^}]+\}|[\w*]+(?:\s*,\s*\{[^}]+\})?)\s+from\s+['"]([^'"]+)['"]/g,
      /import\s+['"]([^'"]+)['"]/g,
      /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
      /from\s+['"]([^'"]+)['"]/g,
      /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ]
    for (const pattern of patterns) {
      let match
      while ((match = pattern.exec(content)) !== null) {
        if (match[1] && match[1].startsWith(".")) imports.push(match[1])
      }
    }
    return [...new Set(imports)]
  }

  private extractExports(content: string): string[] {
    const exports: string[] = []
    const patterns = [
      /export\s+(?:default\s+)?(?:function|class|const|let|var|interface|type|enum|async)\s+(\w+)/g,
      /export\s+\{([^}]+)\}/g,
      /export\s+default\s+(\w+)/g,
    ]
    for (const pattern of patterns) {
      let match
      while ((match = pattern.exec(content)) !== null) {
        if (match[1]) {
          const names = match[1].split(",").map((n) => n.trim().split(/\s+as\s+/)[0].trim())
          exports.push(...names.filter(Boolean))
        }
      }
    }
    return [...new Set(exports)]
  }

  private computeCyclomaticComplexity(lines: string[]): number {
    let complexity = 1
    const branchPatterns = [
      /\bif\s*\(/, /\belse\s+if\b/, /\bfor\s*\(/, /\bwhile\s*\(/,
      /\bswitch\s*\(/, /\bcase\s+/, /\bcatch\s*\(/, /\?\s*[^?:]+:/,
      /&&/, /\|\|/, /\bdo\s*\(/, /\bfor\s+.*\bof\b/, /\bfor\s+.*\bin\b/,
    ]
    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) continue
      for (const pattern of branchPatterns) {
        const matches = trimmed.match(new RegExp(pattern.source, "g"))
        if (matches) complexity += matches.length
      }
    }
    return complexity
  }

  private computeHalsteadVolume(content: string): number {
    const operators = (content.match(/[+\-*/=<>!&|^%~?:]+|=>|\.\.\./g) ?? []).length
    const operands = (content.match(/\b[A-Za-z_]\w*\b/g) ?? []).length
    const vocabulary = operators + operands
    if (vocabulary === 0) return 0
    return vocabulary * Math.log2(vocabulary)
  }

  private computeMaintainabilityIndex(loc: number, cyclomatic: number, halstead: number): number {
    if (loc === 0 || halstead === 0) return 100
    const mi = Math.max(0, 171 - 5.2 * Math.log(halstead) - 0.23 * cyclomatic - 16.2 * Math.log(loc))
    return Math.min(100, mi)
  }

  private resolveEdges() {
    for (const [file, node] of this.fileGraph) {
      for (const imp of node.imports) {
        const resolved = this.resolveImportPath(file, imp)
        if (resolved && this.fileGraph.has(resolved)) {
          if (!this.reverseGraph.has(resolved)) this.reverseGraph.set(resolved, new Set())
          this.reverseGraph.get(resolved)!.add(file)
        }
      }
    }
  }

  private resolveImportPath(fromFile: string, importPath: string): string | null {
    const dir = dirname(fromFile)
    const resolved = join(dir, importPath)
    const extensions = [".ts", ".tsx", ".js", ".jsx", ".json", "/index.ts", "/index.js", "/index.tsx"]
    if (this.fileGraph.has(resolved)) return resolved
    for (const ext of extensions) {
      if (this.fileGraph.has(resolved + ext)) return resolved + ext
    }
    return null
  }

  private buildAdjacencyMatrix() {
    const nodes = Array.from(this.fileGraph.keys())
    this.nodeIndex.clear()
    nodes.forEach((node, idx) => this.nodeIndex.set(node, idx))
    const n = nodes.length
    this.adjacencyMatrix = Array.from({ length: n }, () => new Array(n).fill(0))
    for (const [file, node] of this.fileGraph) {
      const sourceIdx = this.nodeIndex.get(file)
      if (sourceIdx === undefined) continue
      for (const imp of node.imports) {
        const resolved = this.resolveImportPath(file, imp)
        if (resolved) {
          const targetIdx = this.nodeIndex.get(resolved)
          if (targetIdx !== undefined) this.adjacencyMatrix[sourceIdx][targetIdx] = 1
        }
      }
    }
  }

  topologicalSort(): string[] {
    const nodes = Array.from(this.fileGraph.keys())
    const inDegree = new Map<string, number>()
    const graph = new Map<string, string[]>()
    for (const node of nodes) {
      inDegree.set(node, 0)
      graph.set(node, [])
    }
    for (const [file, node] of this.fileGraph) {
      for (const imp of node.imports) {
        const resolved = this.resolveImportPath(file, imp)
        if (resolved && this.fileGraph.has(resolved)) {
          graph.get(resolved)!.push(file)
          inDegree.set(file, (inDegree.get(file) ?? 0) + 1)
        }
      }
    }
    const queue: string[] = []
    for (const [node, degree] of inDegree) {
      if (degree === 0) queue.push(node)
    }
    const sorted: string[] = []
    while (queue.length > 0) {
      const node = queue.shift()!
      sorted.push(node)
      for (const neighbor of graph.get(node) ?? []) {
        const newDegree = (inDegree.get(neighbor) ?? 1) - 1
        inDegree.set(neighbor, newDegree)
        if (newDegree === 0) queue.push(neighbor)
      }
    }
    if (sorted.length < nodes.length) {
      const remaining = nodes.filter((n) => !sorted.includes(n))
      const visited = new Set<string>()
      for (const node of remaining) this.dfsVisit(node, sorted, visited)
    }
    return sorted
  }

  private dfsVisit(node: string, sorted: string[], visited: Set<string>) {
    if (visited.has(node)) return
    visited.add(node)
    const neighbors = this.reverseGraph.get(node) ?? new Set()
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) this.dfsVisit(neighbor, sorted, visited)
    }
    sorted.push(node)
  }

  computeBetweennessCentrality(): Map<string, number> {
    const nodes = Array.from(this.fileGraph.keys())
    const centrality = new Map<string, number>()
    for (const node of nodes) centrality.set(node, 0)
    for (const source of nodes) {
      const distances = new Map<string, number>()
      const predecessors = new Map<string, string[]>()
      const sigma = new Map<string, number>()
      const delta = new Map<string, number>()
      for (const node of nodes) {
        distances.set(node, -1)
        sigma.set(node, 0)
        delta.set(node, 0)
      }
      distances.set(source, 0)
      sigma.set(source, 1)
      const queue: string[] = [source]
      const stack: string[] = []
      while (queue.length > 0) {
        const v = queue.shift()!
        stack.push(v)
        const neighbors = this.getNeighbors(v)
        for (const w of neighbors) {
          if ((distances.get(w) ?? -1) < 0) {
            distances.set(w, (distances.get(v) ?? 0) + 1)
            queue.push(w)
          }
          if ((distances.get(w) ?? 0) === (distances.get(v) ?? 0) + 1) {
            sigma.set(w, (sigma.get(w) ?? 0) + (sigma.get(v) ?? 0))
            if (!predecessors.has(w)) predecessors.set(w, [])
            predecessors.get(w)!.push(v)
          }
        }
      }
      while (stack.length > 0) {
        const w = stack.pop()!
        for (const v of predecessors.get(w) ?? []) {
          const sigmaV = sigma.get(v) ?? 1
          const sigmaW = sigma.get(w) ?? 1
          delta.set(v, (delta.get(v) ?? 0) + (sigmaV / sigmaW) * (1 + (delta.get(w) ?? 0)))
        }
        if (w !== source) centrality.set(w, (centrality.get(w) ?? 0) + (delta.get(w) ?? 0))
      }
    }
    const n = nodes.length
    if (n > 2) {
      const norm = 2 / ((n - 1) * (n - 2))
      for (const [node, val] of centrality) centrality.set(node, val * norm)
    }
    return centrality
  }

  private getNeighbors(node: string): string[] {
    const neighbors: string[] = []
    const nodeIdx = this.nodeIndex.get(node)
    if (nodeIdx === undefined) return neighbors
    for (let i = 0; i < this.adjacencyMatrix.length; i++) {
      if (this.adjacencyMatrix[nodeIdx][i] === 1) {
        const neighborNode = Array.from(this.nodeIndex.entries()).find(([, idx]) => idx === i)?.[0]
        if (neighborNode) neighbors.push(neighborNode)
      }
    }
    return neighbors
  }

  computeImpactScores(): ImpactScore[] {
    const centrality = this.computeBetweennessCentrality()
    const scores: ImpactScore[] = []
    for (const [file] of this.fileGraph) {
      const directDependents = this.reverseGraph.get(file)?.size ?? 0
      const transitiveDependents = this.countTransitiveDependents(file, new Set())
      const cent = centrality.get(file) ?? 0
      const node = this.fileGraph.get(file)!
      const riskScore = this.computeRiskScore(directDependents, transitiveDependents, cent, node.cyclomaticComplexity)
      const changePropagations = this.countChangePropagations(file)
      scores.push({ file, directDependents, transitiveDependents, centrality: cent, riskScore, changePropagations })
    }
    scores.sort((a, b) => b.riskScore - a.riskScore)
    return scores
  }

  private countTransitiveDependents(node: string, visited: Set<string>): number {
    if (visited.has(node)) return 0
    visited.add(node)
    const direct = this.reverseGraph.get(node) ?? new Set()
    let count = direct.size
    for (const dep of direct) count += this.countTransitiveDependents(dep, visited)
    return count
  }

  private countChangePropagations(file: string): number {
    const related = this.getRelatedFiles(file, 5)
    return related.length
  }

  private computeRiskScore(direct: number, transitive: number, centrality: number, complexity: number): number {
    const directScore = Math.min(direct / 10, 1.0) * 0.3
    const transitiveScore = Math.min(transitive / 50, 1.0) * 0.3
    const centralityScore = Math.min(centrality, 1.0) * 0.25
    const complexityScore = Math.min(complexity / 20, 1.0) * 0.15
    return directScore + transitiveScore + centralityScore + complexityScore
  }

  getRelatedFiles(filePath: string, limit: number = 10): string[] {
    const related = new Map<string, number>()
    const node = this.fileGraph.get(filePath)
    if (!node) return []
    const importSet = new Set(node.imports)
    const exportSet = new Set(node.exports)
    for (const [otherFile, otherNode] of this.fileGraph) {
      if (otherFile === filePath) continue
      const otherImportSet = new Set(otherNode.imports)
      const otherExportSet = new Set(otherNode.exports)
      const importSim = jaccardSimilarity(importSet, otherImportSet)
      const exportSim = jaccardSimilarity(exportSet, otherExportSet)
      const nameSim = 1 - levenshteinDistance(basename(filePath), basename(otherFile)) / Math.max(basename(filePath).length, basename(otherFile).length)
      const combinedSim = 0.4 * importSim + 0.3 * exportSim + 0.3 * nameSim
      if (combinedSim > 0.1) related.set(otherFile, combinedSim)
    }
    const directDeps = node.imports
    for (const dep of directDeps) {
      const resolved = this.resolveImportPath(filePath, dep)
      if (resolved && this.fileGraph.has(resolved)) related.set(resolved, (related.get(resolved) ?? 0) + 0.5)
    }
    const reverseDeps = this.reverseGraph.get(filePath) ?? new Set()
    for (const dep of reverseDeps) related.set(dep, (related.get(dep) ?? 0) + 0.5)
    return Array.from(related.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([file]) => file)
  }

  generateEditPlan(changedFiles: string[]): EditPlan {
    const impacts = new Map<string, number>()
    const impactScores = this.computeImpactScores()
    for (const score of impactScores) impacts.set(score.file, score.riskScore)
    const affectedSet = new Set(changedFiles)
    for (const file of changedFiles) {
      const related = this.getRelatedFiles(file, 5)
      for (const rel of related) affectedSet.add(rel)
    }
    const affected = Array.from(affectedSet)
    const sorted = this.topologicalSort().filter((f) => affectedSet.has(f))
    const clusters = this.clusterFiles(sorted)
    const criticalPath = this.findCriticalPath(sorted)
    const estimatedRisk = affected.reduce((sum, f) => sum + (impacts.get(f) ?? 0), 0) / Math.max(affected.length, 1)
    return { order: sorted, impacts, clusters, criticalPath, estimatedRisk }
  }

  private clusterFiles(files: string[]): string[][] {
    if (files.length === 0) return []
    const languageGroups = new Map<string, string[]>()
    for (const file of files) {
      const ext = extname(file).slice(1) || "unknown"
      if (!languageGroups.has(ext)) languageGroups.set(ext, [])
      languageGroups.get(ext)!.push(file)
    }
    const clusters: string[][] = []
    for (const [, group] of languageGroups) {
      const chunkSize = Math.max(1, Math.ceil(group.length / Math.ceil(group.length / 3)))
      for (let i = 0; i < group.length; i += chunkSize) clusters.push(group.slice(i, i + chunkSize))
    }
    return clusters
  }

  private findCriticalPath(sorted: string[]): string[] {
    if (sorted.length === 0) return []
    let longestPath: string[] = []
    for (const file of sorted) {
      const path = this.findLongestPathFrom(file, new Set())
      if (path.length > longestPath.length) longestPath = path
    }
    return longestPath
  }

  private findLongestPathFrom(node: string, visited: Set<string>): string[] {
    if (visited.has(node)) return [node]
    visited.add(node)
    const dependents = this.reverseGraph.get(node) ?? new Set()
    let longestSubPath: string[] = []
    for (const dep of dependents) {
      const subPath = this.findLongestPathFrom(dep, new Set(visited))
      if (subPath.length > longestSubPath.length) longestSubPath = subPath
    }
    return [node, ...longestSubPath]
  }

  markEdited(filePath: string) { this.editedFiles.add(filePath) }
  getEditedFiles(): string[] { return Array.from(this.editedFiles) }

  computeEditEntropy(): number {
    const fileExts = Array.from(this.fileGraph.values()).map((n) => n.language)
    const freq = new Map<string, number>()
    for (const ext of fileExts) freq.set(ext, (freq.get(ext) ?? 0) + 1)
    return shannonEntropy(Array.from(freq.values()))
  }

  getFileStats(): { totalFiles: number; totalEdges: number; avgComplexity: number; avgMaintainability: number; languageDistribution: Record<string, number> } {
    let totalEdges = 0, totalComplexity = 0, totalMaintainability = 0
    const langDist: Record<string, number> = {}
    for (const [, node] of this.fileGraph) {
      totalEdges += node.imports.length
      totalComplexity += node.cyclomaticComplexity
      totalMaintainability += node.maintainabilityIndex
      langDist[node.language] = (langDist[node.language] ?? 0) + 1
    }
    const n = this.fileGraph.size
    return { totalFiles: n, totalEdges, avgComplexity: n > 0 ? totalComplexity / n : 0, avgMaintainability: n > 0 ? totalMaintainability / n : 0, languageDistribution: langDist }
  }

  async learn(toolName: string, result: unknown) {
    const resultStr = typeof result === "string" ? result : JSON.stringify(result)
    const fileMatches = resultStr.match(/(?:\/[\w.-]+)+\.\w+/g) ?? []
    for (const fp of fileMatches.slice(0, 5)) this.editedFiles.add(fp)
  }
}
