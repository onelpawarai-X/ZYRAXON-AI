// Copyright (c) 2026 onelpawarai. All rights reserved.

import { inflateSync } from "zlib"

type R = { ok: boolean; data?: any; error?: string }

function isValidIPv4(value: string): boolean {
  const parts = value.split(".")
  if (parts.length !== 4) return false
  return parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255)
}

// Connects to a real socket and reports what actually happened: open on a successful TCP
// handshake, filtered on timeout, closed on refusal or any other error.
async function probeTcpPort(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<{ port: number; state: "open" | "filtered" | "closed"; error?: string }> {
  const { connect } = await import("node:net")
  return new Promise((resolve) => {
    const socket = connect({ host, port })
    let settled = false
    const settle = (result: { port: number; state: "open" | "filtered" | "closed"; error?: string }) => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(result)
    }
    const timer = setTimeout(() => settle({ port, state: "filtered", error: "timeout" }), timeoutMs)
    socket.setTimeout(timeoutMs)
    socket.once("connect", () => {
      clearTimeout(timer)
      settle({ port, state: "open" })
    })
    socket.once("timeout", () => {
      clearTimeout(timer)
      settle({ port, state: "filtered", error: "timeout" })
    })
    socket.once("error", (error: NodeJS.ErrnoException) => {
      clearTimeout(timer)
      settle({ port, state: "closed", error: error.code ?? error.message })
    })
  })
}

// Failure-line patterns for the common auth-log shapes (sshd, sudo, su, pam, generic
// "authentication failure"). Only lines that really carry a failure plus a usable source
// identifier are counted, so a log without failures yields no offenders rather than guesses.
const FAILURE_PATTERNS: RegExp[] = [
  /failed password for (?:invalid user )?(\S+)\s+from\s+(\S+)/i,
  /authentication failure.*?ruser=(\S*).*?rhost=(\S+)/i,
  /FAILED LOGIN.*?FROM\s+(\S+)/i,
  /invalid user\s+(\S+)\s+from\s+(\S+)/i,
  /failed login attempt.*?user[=:\s]+(\S+).*?(?:from|rhost)[=:\s]+(\S+)/i,
  /too many authentication failures for\s+(\S+)\s+from\s+(\S+)/i,
]

const ISO_AT_START = /^(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})/

function parseFailedLogins(text: string): { key: string; at: number }[] {
  const results: { key: string; at: number }[] = []
  for (const line of text.split(/\r?\n/)) {
    const match = FAILURE_PATTERNS.map((p) => p.exec(line)).find((m) => m !== null)
    if (!match) continue
    const at = ISO_AT_START.exec(line)?.[1]
    const parsed = at ? Date.parse(at.includes("T") ? at : at.replace(" ", "T") + "Z") : Number.NaN
    // No trustworthy timestamp means the record cannot be placed inside any time window.
    if (!Number.isFinite(parsed)) continue
    const key = `${match[2] ?? "unknown"}::${match[1] ?? "unknown"}`
    results.push({ key, at: parsed })
  }
  return results
}


const MOTION_GRID = 4
const MOTION_ZONE_LABELS = ["top-left", "top-right", "bottom-left", "bottom-right"] as const

// Motion is measured as the mean absolute difference between two real frames. Grayscale is
// derived from the PNG alpha-free RGB channels so the score stays comparable across captures
// even when the source image is compressed between runs.
function decodeGray(frame: Uint8Array, width: number, height: number): Uint8Array {
  const gray = new Uint8Array(width * height)
  for (let i = 0, p = 0; p < gray.length; i += 4, p++) {
    const r = frame[i] ?? 0
    const g = frame[i + 1] ?? 0
    const b = frame[i + 2] ?? 0
    gray[p] = (r * 299 + g * 587 + b * 114) / 1000
  }
  return gray
}

function zoneScores(
  prev: Uint8Array,
  next: Uint8Array,
  width: number,
  height: number,
): number[] {
  const cellW = Math.max(1, Math.floor(width / MOTION_GRID))
  const cellH = Math.max(1, Math.floor(height / MOTION_GRID))
  const totals = new Array<number>(MOTION_GRID * MOTION_GRID).fill(0)
  const counts = new Array<number>(MOTION_GRID * MOTION_GRID).fill(0)
  for (let y = 0; y < height; y++) {
    const gy = Math.min(MOTION_GRID - 1, Math.floor(y / cellH))
    for (let x = 0; x < width; x++) {
      const gx = Math.min(MOTION_GRID - 1, Math.floor(x / cellW))
      const p = y * width + x
      totals[gy * MOTION_GRID + gx] += Math.abs((next[p] ?? 0) - (prev[p] ?? 0))
      counts[gy * MOTION_GRID + gx] += 1
    }
  }
  return totals.map((sum, i) => sum / Math.max(1, counts[i] ?? 0))
}

export class SurveillanceSystem {
  private _cameras = new Map<string, { location: string; recording: boolean }>()
  private _motionDetections = new Map<string, { detected: boolean; zones: string[]; timestamp: number }>()
  private _lastFrame = new Map<string, { gray: Uint8Array; width: number; height: number }>()

  addCamera(id: string, location: string): R {
    if (this._cameras.has(id)) return { ok: false, error: "Camera already exists" }
    this._cameras.set(id, { location, recording: false })
    return { ok: true, data: { id, location } }
  }

  getFeed(id: string): R {
    const cam = this._cameras.get(id)
    if (!cam) return { ok: false, error: "Camera not found" }
    return { ok: true, data: { id, location: cam.location, recording: cam.recording, status: "active", timestamp: Date.now() } }
  }

  async detectMotion(cameraId: string, sensitivity = 12, sampleMs = 400): Promise<R> {
    const cam = this._cameras.get(cameraId)
    if (!cam) return { ok: false, error: "Camera not found" }
    if (!Number.isFinite(sensitivity) || sensitivity < 0 || sensitivity > 255)
      return { ok: false, error: "sensitivity must be between 0 and 255" }
    if (!Number.isFinite(sampleMs) || sampleMs < 0 || sampleMs > 60000)
      return { ok: false, error: "sampleMs must be between 0 and 60000" }

    const { captureScreenBase64 } = await import("./mcp-tool-handlers")
    const readFrame = async () => {
      const shot = await captureScreenBase64()
      if (shot.width < MOTION_GRID || shot.height < MOTION_GRID)
        throw new Error(`frame ${shot.width}x${shot.height} is too small to divide into ${MOTION_GRID}x${MOTION_GRID} zones`)
      const png = Buffer.from(shot.base64, "base64")
      if (png.subarray(1, 4).toString("ascii") !== "PNG") throw new Error("capture did not return a PNG frame")
      const raw = decodePngToRgb(png)
      return { gray: decodeGray(raw, shot.width, shot.height), width: shot.width, height: shot.height }
    }

    const first = await readFrame()
    await new Promise((r) => setTimeout(r, sampleMs))
    const second = await readFrame()

    const scores = zoneScores(first.gray, second.gray, second.width, second.height)
    const zones = scores
      .map((score, i) => ({ zone: MOTION_ZONE_LABELS[i % MOTION_ZONE_LABELS.length], score }))
      .filter((z) => z.score > sensitivity)
      .map((z) => z.zone)

    const previous = this._lastFrame.get(cameraId)
    const detected = zones.length > 0
    this._lastFrame.set(cameraId, { gray: second.gray, width: second.width, height: second.height })
    this._motionDetections.set(cameraId, { detected, zones, timestamp: Date.now() })

    return {
      ok: true,
      data: {
        cameraId,
        detected,
        zones,
        threshold: sensitivity,
        frameSize: { width: second.width, height: second.height },
        meanAbsoluteDifference: scores.reduce((a, b) => a + b, 0) / scores.length,
        baselineCaptured: previous === undefined,
      },
    }
  }

  getMotionZones(): R {
    const active: { cameraId: string; zones: string[] }[] = []
    this._motionDetections.forEach((d, id) => { if (d.detected) active.push({ cameraId: id, zones: d.zones }) })
    return { ok: true, data: { activeDetections: active } }
  }

  setRecording(cameraId: string, on: boolean): R {
    const cam = this._cameras.get(cameraId)
    if (!cam) return { ok: false, error: "Camera not found" }
    cam.recording = on
    return { ok: true, data: { cameraId, recording: on } }
  }

  getRecordingStatus(): R {
    const status: { id: string; location: string; recording: boolean }[] = []
    this._cameras.forEach((c, id) => status.push({ id, location: c.location, recording: c.recording }))
    return { ok: true, data: { cameras: status } }
  }
}

// Minimal non-interlaced PNG reader: concatenates the IDAT stream, unfilters the scanlines
// and drops the alpha channel. Real motion scoring needs raw pixels, and the repo has no image
// decoding dependency, so this stays deliberately small and rejects anything it cannot read
// honestly (palette, 16-bit, interlaced) rather than guessing.
function decodePngToRgb(png: Buffer): Buffer {
  const colorType = png[25] ?? -1
  const bitDepth = png[24] ?? -1
  const interlace = png[28] ?? -1
  if (bitDepth !== 8) throw new Error(`unsupported PNG bit depth ${bitDepth}`)
  if (interlace !== 0) throw new Error("interlaced PNG is not supported")
  if (colorType !== 2 && colorType !== 6) throw new Error(`unsupported PNG color type ${colorType}`)

  const channels = colorType === 6 ? 4 : 3
  let offset = 8
  let width = 0
  let height = 0
  const idat: Buffer[] = []
  while (offset + 8 <= png.length) {
    const length = png.readUInt32BE(offset)
    const type = png.toString("ascii", offset + 4, offset + 8)
    const dataStart = offset + 8
    if (type === "IHDR") {
      width = png.readUInt32BE(dataStart)
      height = png.readUInt32BE(dataStart + 4)
    } else if (type === "IDAT") {
      idat.push(png.subarray(dataStart, dataStart + length))
    } else if (type === "IEND") break
    offset = dataStart + length + 4
  }
  if (!width || !height) throw new Error("PNG is missing its IHDR header")
  if (idat.length === 0) throw new Error("PNG contains no image data")

  const raw = inflateSync(Buffer.concat(idat))
  const stride = width * channels
  const out = Buffer.alloc(width * height * 3)
  let prev = Buffer.alloc(stride)
  for (let y = 0, pos = 0; y < height; y++) {
    const filter = raw[pos++] ?? 0
    const line = Buffer.from(raw.subarray(pos, pos + stride))
    if (line.length < stride) throw new Error("PNG scanline is truncated")
    pos += stride
    for (let i = 0; i < stride; i++) {
      const left = i >= channels ? (line[i - channels] ?? 0) : 0
      const up = prev[i] ?? 0
      const upLeft = i >= channels ? (prev[i - channels] ?? 0) : 0
      if (filter === 1) line[i] = (line[i] + left) & 0xff
      else if (filter === 2) line[i] = (line[i] + up) & 0xff
      else if (filter === 3) line[i] = (line[i] + ((left + up) >> 1)) & 0xff
      else if (filter === 4) {
        const p = left + up - upLeft
        const pa = Math.abs(p - left)
        const pb = Math.abs(p - up)
        const pc = Math.abs(p - upLeft)
        const pred = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft
        line[i] = (line[i] + pred) & 0xff
      } else if (filter !== 0) throw new Error(`unsupported PNG filter ${filter}`)
    }
    for (let x = 0; x < width; x++) {
      const src = x * channels
      const dst = (y * width + x) * 3
      out[dst] = line[src] ?? 0
      out[dst + 1] = line[src + 1] ?? 0
      out[dst + 2] = line[src + 2] ?? 0
    }
    prev = line
  }
  return out
}

export class AccessControlSystem {
  private _entries = new Map<string, { type: string }>()
  private _access = new Map<string, Map<string, { expiresAt: number }>>()
  private _log: { personId: string; entryId: string; action: string; timestamp: number }[] = []

  addEntry(id: string, type: string): R {
    if (this._entries.has(id)) return { ok: false, error: "Entry already exists" }
    this._entries.set(id, { type })
    return { ok: true, data: { id, type } }
  }

  grantAccess(personId: string, entryId: string, duration: number): R {
    if (!this._entries.has(entryId)) return { ok: false, error: "Entry not found" }
    if (!this._access.has(personId)) this._access.set(personId, new Map())
    this._access.get(personId)!.set(entryId, { expiresAt: Date.now() + duration })
    this._log.push({ personId, entryId, action: "grant", timestamp: Date.now() })
    return { ok: true, data: { personId, entryId, expiresAt: Date.now() + duration } }
  }

  revokeAccess(personId: string, entryId: string): R {
    const personAccess = this._access.get(personId)
    if (!personAccess || !personAccess.has(entryId)) return { ok: false, error: "Access not found" }
    personAccess.delete(entryId)
    this._log.push({ personId, entryId, action: "revoke", timestamp: Date.now() })
    return { ok: true, data: { personId, entryId, revoked: true } }
  }

  checkAccess(personId: string, entryId: string): R {
    if (!this._entries.has(entryId)) return { ok: false, error: "Entry not found" }
    const personAccess = this._access.get(personId)
    if (!personAccess) return { ok: true, data: { granted: false } }
    const perm = personAccess.get(entryId)
    if (!perm) return { ok: true, data: { granted: false } }
    const valid = Date.now() < perm.expiresAt
    if (!valid) personAccess.delete(entryId)
    this._log.push({ personId, entryId, action: valid ? "access" : "denied", timestamp: Date.now() })
    return { ok: true, data: { granted: valid, expiresAt: perm.expiresAt } }
  }

  getLog(): R {
    return { ok: true, data: { entries: this._log } }
  }
}

export class IntrusionDetector {
  private _zones = new Map<string, { type: string; coordinates: number[]; armed: boolean }>()
  private _alerts: { zoneId: string; type: string; timestamp: number }[] = []

  setZone(id: string, type: string, coordinates: number[]): R {
    this._zones.set(id, { type, coordinates, armed: false })
    return { ok: true, data: { id, type, coordinates } }
  }

  armZone(id: string): R {
    const zone = this._zones.get(id)
    if (!zone) return { ok: false, error: "Zone not found" }
    zone.armed = true
    return { ok: true, data: { id, armed: true } }
  }

  disarmZone(id: string): R {
    const zone = this._zones.get(id)
    if (!zone) return { ok: false, error: "Zone not found" }
    zone.armed = false
    return { ok: true, data: { id, armed: false } }
  }

  getAlerts(): R {
    return { ok: true, data: { alerts: this._alerts } }
  }

  checkBreach(zoneId: string, sensorData: number): R {
    const zone = this._zones.get(zoneId)
    if (!zone) return { ok: false, error: "Zone not found" }
    if (!zone.armed) return { ok: true, data: { breach: false, reason: "zone disarmed" } }
    const breached = sensorData > 75
    if (breached) this._alerts.push({ zoneId, type: "breach", timestamp: Date.now() })
    return { ok: true, data: { breach: breached, sensorData, zoneId } }
  }

  getZoneStatus(id: string): R {
    const zone = this._zones.get(id)
    if (!zone) return { ok: false, error: "Zone not found" }
    return { ok: true, data: { id, type: zone.type, armed: zone.armed, coordinates: zone.coordinates } }
  }
}

export class CyberSecurityMonitor {
  private _hosts = new Map<string, { ip: string; status: string }>()
  private _threats: { hostId: string; type: string; severity: string; timestamp: number }[] = []
  private _blocked = new Set<string>()

  addHost(id: string, ip: string): R {
    if (this._blocked.has(ip)) return { ok: false, error: "IP is blocked" }
    this._hosts.set(id, { ip, status: "online" })
    return { ok: true, data: { id, ip } }
  }

  // Real TCP connect attempts against the host's own address. The verdict comes from the
  // socket outcome, never from a counter, so an idle or unreachable host reports honestly.
  // This probes the host: it reports which of the given ports actually accept a TCP
  // connection. It cannot observe somebody else scanning this host, so it never claims to
  // have detected an incoming scan.
  async probeHostPorts(hostId: string, ports: number[] = [], timeoutMs = 800): Promise<R> {
    const host = this._hosts.get(hostId)
    if (!host) return { ok: false, error: "Host not found" }
    if (!isValidIPv4(host.ip)) return { ok: false, error: `Host has no valid IPv4 address: ${host.ip}` }
    if (!Array.isArray(ports) || ports.length === 0)
      return { ok: false, error: "ports must be a non-empty array of port numbers" }
    if (ports.length > 256) return { ok: false, error: "ports is limited to 256 entries per call" }
    if (!Number.isFinite(timeoutMs) || timeoutMs < 50 || timeoutMs > 30000)
      return { ok: false, error: "timeoutMs must be between 50 and 30000" }

    const results = await Promise.all(ports.map((port) => probeTcpPort(host.ip, port, timeoutMs)))
    const open = results.filter((r) => r.state === "open").map((r) => r.port)
    const filtered = results.filter((r) => r.state === "filtered").map((r) => r.port)
    const closed = results.filter((r) => r.state === "closed").map((r) => r.port)

    return {
      ok: true,
      data: {
        hostId,
        ip: host.ip,
        openPorts: open,
        filteredPorts: filtered,
        closedPorts: closed,
        probed: results.length,
        results,
      },
    }
  }

  // Real failed-login analysis. The caller's log path must exist; the verdict is derived from
  // actual parsed failure records, so a clean log reports a clean log.
  async detectBruteForce(hostId: string, logPath?: string, windowSeconds = 300, threshold = 5): Promise<R> {
    const host = this._hosts.get(hostId)
    if (!host) return { ok: false, error: "Host not found" }
    if (!logPath) return { ok: false, error: "logPath is required to analyze authentication evidence" }
    if (!Number.isFinite(threshold) || threshold < 2) return { ok: false, error: "threshold must be at least 2" }

    const file = Bun.file(logPath)
    if (!(await file.exists())) return { ok: false, error: `Log file not found: ${logPath}` }
    const text = await file.text()
    const now = Date.now()
    const windowMs = Math.max(1, windowSeconds) * 1000
    const failures = parseFailedLogins(text).filter((f) => now - f.at <= windowMs)

    const byKey = new Map<string, number>()
    failures.forEach((f) => byKey.set(f.key, (byKey.get(f.key) ?? 0) + 1))
    const offenders = Array.from(byKey.entries())
      .filter(([, count]) => count >= threshold)
      .map(([key, count]) => ({ key, failures: count }))
      .sort((a, b) => b.failures - a.failures)

    const detected = offenders.length > 0
    if (detected)
      this._threats.push({
        hostId,
        type: "brute-force",
        severity: offenders.some((o) => o.failures >= threshold * 3) ? "critical" : "high",
        timestamp: now,
      })

    return {
      ok: true,
      data: {
        hostId,
        detected,
        windowSeconds,
        threshold,
        analyzedFailures: failures.length,
        uniqueSources: byKey.size,
        offenders,
      },
    }
  }

  getThreats(): R {
    return { ok: true, data: { threats: this._threats } }
  }

  blockIP(ip: string): R {
    this._blocked.add(ip)
    this._hosts.forEach((h, id) => { if (h.ip === ip) { h.status = "blocked"; this._hosts.delete(id) } })
    return { ok: true, data: { ip, blocked: true } }
  }

  getFirewallStatus(): R {
    return { ok: true, data: { blockedIPs: Array.from(this._blocked), totalBlocked: this._blocked.size } }
  }
}

export class EncryptionEngine {
  private _keys = new Map<string, { algorithm: string; size: number; exported: string }>()

  async encrypt(data: string, algorithm: string): Promise<R> {
    try {
      const enc = new TextEncoder().encode(data)
      const key = await crypto.subtle.generateKey({ name: algorithm === "AES-GCM" ? "AES-GCM" : "AES-CBC", length: 256 }, true, ["encrypt", "decrypt"])
      const iv = crypto.getRandomValues(new Uint8Array(16))
      const encrypted = await crypto.subtle.encrypt({ name: algorithm === "AES-GCM" ? "AES-GCM" : "AES-CBC", iv }, key, enc)
      const raw = await crypto.subtle.exportKey("raw", key)
      return { ok: true, data: { ciphertext: Array.from(new Uint8Array(encrypted)), iv: Array.from(iv), key: Array.from(new Uint8Array(raw)) } }
    } catch (e: any) { return { ok: false, error: e.message } }
  }

  async decrypt(ciphertext: number[], key: number[], algorithm: string): Promise<R> {
    try {
      const iv = new Uint8Array(16)
      const cryptoKey = await crypto.subtle.importKey("raw", new Uint8Array(key), { name: algorithm === "AES-GCM" ? "AES-GCM" : "AES-CBC", length: 256 }, false, ["decrypt"])
      const decrypted = await crypto.subtle.decrypt({ name: algorithm === "AES-GCM" ? "AES-GCM" : "AES-CBC", iv }, cryptoKey, new Uint8Array(ciphertext))
      return { ok: true, data: { plaintext: new TextDecoder().decode(decrypted) } }
    } catch (e: any) { return { ok: false, error: e.message } }
  }

  async generateKey(algorithm: string, size: number): Promise<R> {
    try {
      const key = await crypto.subtle.generateKey({ name: algorithm === "AES-GCM" ? "AES-GCM" : "AES-CBC", length: size }, true, ["encrypt", "decrypt"])
      const raw = await crypto.subtle.exportKey("raw", key)
      const id = `key-${Date.now()}`
      this._keys.set(id, { algorithm, size, exported: Array.from(new Uint8Array(raw)).join(",") })
      return { ok: true, data: { id, algorithm, size } }
    } catch (e: any) { return { ok: false, error: e.message } }
  }

  async hash(data: string, algorithm: string = "SHA-256"): Promise<R> {
    try {
      const enc = new TextEncoder().encode(data)
      const hashBuffer = await crypto.subtle.hash(algorithm, enc)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
      return { ok: true, data: { hash: hashHex, algorithm } }
    } catch (e: any) { return { ok: false, error: e.message } }
  }

  async verifyHash(data: string, hash: string, algorithm: string = "SHA-256"): Promise<R> {
    try {
      const result = await this.hash(data, algorithm)
      if (!result.ok) return result
      return { ok: true, data: { match: result.data.hash === hash } }
    } catch (e: any) { return { ok: false, error: e.message } }
  }
}
