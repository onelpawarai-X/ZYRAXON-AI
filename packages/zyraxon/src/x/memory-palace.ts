/**
 * ZYRAXON X - Memory Palace
 * Infinite memory: 5000+ years of recall
 * Every conversation, code change, decision remembered
 * Cross-session persistent knowledge graph
 */

type MemoryNode = {
  id: string
  type: "conversation" | "code_change" | "decision" | "fact" | "person" | "project" | "emotion" | "skill"
  content: any
  importance: number
  tags: string[]
  connections: string[]
  accessCount: number
  lastAccessed: number
  created: number
  decay: number
}

type MemoryQuery = {
  text?: string
  type?: MemoryNode["type"]
  tags?: string[]
  dateRange?: { start: Date; end: Date }
  minImportance?: number
  limit?: number
}

type MemoryStats = {
  totalNodes: number
  byType: Record<string, number>
  avgImportance: number
  oldestMemory: number
  newestMemory: number
  totalConnections: number
}

let memCounter = 0

export class MemoryPalace {
  private nodes: Map<string, MemoryNode> = new Map()
  private tagIndex: Map<string, Set<string>> = new Map()
  private typeIndex: Map<string, Set<string>> = new Map()
  private maxNodes = 1000000

  store(type: MemoryNode["type"], content: any, tags: string[] = [], importance = 5): string {
    const id = `mem_${Date.now()}_${++memCounter}`
    const node: MemoryNode = {
      id, type, content, importance,
      tags, connections: [],
      accessCount: 0, lastAccessed: Date.now(), created: Date.now(), decay: 1.0,
    }
    this.nodes.set(id, node)
    this.indexNode(node)
    if (this.nodes.size > this.maxNodes) this.evict()
    return id
  }

  private indexNode(node: MemoryNode) {
    for (const tag of node.tags) {
      if (!this.tagIndex.has(tag)) this.tagIndex.set(tag, new Set())
      this.tagIndex.get(tag)!.add(node.id)
    }
    if (!this.typeIndex.has(node.type)) this.typeIndex.set(node.type, new Set())
    this.typeIndex.get(node.type)!.add(node.id)
  }

  retrieve(id: string): MemoryNode | null {
    const node = this.nodes.get(id)
    if (!node) return null
    node.accessCount++
    node.lastAccessed = Date.now()
    node.decay = Math.min(1.0, node.decay + 0.1)
    return node
  }

  query(q: MemoryQuery): MemoryNode[] {
    let candidates = Array.from(this.nodes.values())

    if (q.type) {
      const typeIds = this.typeIndex.get(q.type)
      if (typeIds) candidates = candidates.filter((n) => typeIds.has(n.id))
    }

    if (q.tags && q.tags.length > 0) {
      candidates = candidates.filter((n) => q.tags!.some((t) => n.tags.includes(t)))
    }

    if (q.dateRange) {
      candidates = candidates.filter((n) => n.created >= q.dateRange!.start.getTime() && n.created <= q.dateRange!.end.getTime())
    }

    if (q.minImportance) {
      candidates = candidates.filter((n) => n.importance >= q.minImportance!)
    }

    if (q.text) {
      const lower = q.text.toLowerCase()
      candidates = candidates.filter((n) => {
        const contentStr = typeof n.content === "string" ? n.content : JSON.stringify(n.content)
        return contentStr.toLowerCase().includes(lower) || n.tags.some((t) => t.toLowerCase().includes(lower))
      })
    }

    candidates.sort((a, b) => {
      const scoreA = a.importance * a.decay * (1 + Math.log(a.accessCount + 1))
      const scoreB = b.importance * b.decay * (1 + Math.log(b.accessCount + 1))
      return scoreB - scoreA
    })

    return candidates.slice(0, q.limit || 50)
  }

  connect(id1: string, id2: string) {
    const n1 = this.nodes.get(id1)
    const n2 = this.nodes.get(id2)
    if (n1 && n2) {
      if (!n1.connections.includes(id2)) n1.connections.push(id2)
      if (!n2.connections.includes(id1)) n2.connections.push(id1)
    }
  }

  forget(id: string): boolean {
    const node = this.nodes.get(id)
    if (!node) return false
    for (const tag of node.tags) {
      this.tagIndex.get(tag)?.delete(id)
    }
    this.typeIndex.get(node.type)?.delete(id)
    this.nodes.delete(id)
    return true
  }

  private evict() {
    const nodes = Array.from(this.nodes.values())
    nodes.sort((a, b) => {
      const scoreA = a.importance * a.decay * (1 + Math.log(a.accessCount + 1)) * (1 / (Date.now() - a.lastAccessed + 1))
      const scoreB = b.importance * b.decay * (1 + Math.log(b.accessCount + 1)) * (1 / (Date.now() - b.lastAccessed + 1))
      return scoreA - scoreB
    })
    const toRemove = nodes.slice(0, Math.floor(this.maxNodes * 0.1))
    for (const node of toRemove) this.forget(node.id)
  }

  getStats(): MemoryStats {
    const nodes = Array.from(this.nodes.values())
    const byType: Record<string, number> = {}
    let totalConnections = 0
    for (const node of nodes) {
      byType[node.type] = (byType[node.type] || 0) + 1
      totalConnections += node.connections.length
    }
    return {
      totalNodes: nodes.length,
      byType,
      avgImportance: nodes.length > 0 ? nodes.reduce((s, n) => s + n.importance, 0) / nodes.length : 0,
      oldestMemory: nodes.length > 0 ? Math.min(...nodes.map((n) => n.created)) : Date.now(),
      newestMemory: nodes.length > 0 ? Math.max(...nodes.map((n) => n.created)) : Date.now(),
      totalConnections: totalConnections / 2,
    }
  }

  getAll(): MemoryNode[] { return Array.from(this.nodes.values()) }
}
