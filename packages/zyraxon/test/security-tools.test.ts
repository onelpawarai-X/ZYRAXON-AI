// Copyright (c) 2026 onelpawarai. All rights reserved.

import { describe, expect, test } from "bun:test"
import { currentPlatform } from "../src/x/desktop-control"
import { CyberSecurityMonitor, SurveillanceSystem } from "../src/x/security-tools"

// Motion detection compares two real screen captures, so it needs an actual desktop to
// read. A runner has none, and a developer does not expect a test run to photograph their
// screen, so require the same explicit opt-in the desktop control suite uses.
const drivesRealInput = currentPlatform() === "windows" && process.env.ZYRAXON_DESKTOP_CONTROL_TESTS === "1"

describe("CyberSecurityMonitor port probing uses real TCP results", () => {
  test("reports the real state of a port that is actually listening", async () => {
    const monitor = new CyberSecurityMonitor()
    const server = Bun.serve({ port: 0, fetch: () => new Response("ok") })
    const port = server.port
    monitor.addHost("h1", "127.0.0.1")

    const result = await monitor.probeHostPorts("h1", [port], 2000)
    server.stop(true)

    expect(result.ok).toBe(true)
    expect(result.data.openPorts).toEqual([port])
    expect(result.data.results[0].state).toBe("open")
  })

  test("every probed port is accounted for and no scan verdict is invented", async () => {
    const monitor = new CyberSecurityMonitor()
    const server = Bun.serve({ port: 0, fetch: () => new Response("ok") })
    monitor.addHost("h1", "127.0.0.1")

    const result = await monitor.probeHostPorts("h1", [server.port, 9], 2000)
    server.stop(true)

    expect(result.data.probed).toBe(2)
    expect(result.data.results).toHaveLength(2)
    expect(result.data.openPorts.length + result.data.filteredPorts.length + result.data.closedPorts.length).toBe(2)
    // Reachability is all this reports; it must not claim to have spotted an incoming scanner.
    expect(result.data.detected).toBeUndefined()
  })

  test("a port with nothing listening reports closed rather than failing", async () => {
    const monitor = new CyberSecurityMonitor()
    monitor.addHost("h1", "127.0.0.1")
    // Bind then immediately release, so the port is almost certainly free.
    const probe = Bun.serve({ port: 0, fetch: () => new Response("ok") })
    const port = probe.port
    probe.stop(true)
    await Bun.sleep(50)

    const result = await monitor.probeHostPorts("h1", [port], 1000)

    expect(result.ok).toBe(true)
    expect(result.data.openPorts).toEqual([])
    expect(result.data.results[0].state).toBe("closed")
  })

  test("rejects an empty port list instead of inventing a verdict", async () => {
    const monitor = new CyberSecurityMonitor()
    monitor.addHost("h1", "127.0.0.1")

    const result = await monitor.probeHostPorts("h1", [], 500)
    expect(result.ok).toBe(false)
    expect(result.error).toContain("non-empty")
  })

  test("rejects a host without a real address", async () => {
    const monitor = new CyberSecurityMonitor()
    monitor.addHost("h1", "not-an-ip")

    const result = await monitor.probeHostPorts("h1", [80], 500)
    expect(result.ok).toBe(false)
    expect(result.error).toContain("IPv4")
  })

  test("unknown host is an explicit error", async () => {
    const monitor = new CyberSecurityMonitor()
    const result = await monitor.probeHostPorts("missing", [80], 500)
    expect(result.ok).toBe(false)
    expect(result.error).toBe("Host not found")
  })
})

describe("CyberSecurityMonitor brute force reads real log evidence", () => {
  test("counts actual repeated failures from one source", async () => {
    const monitor = new CyberSecurityMonitor()
    monitor.addHost("h1", "127.0.0.1")
    // Stamped relative to now so the records always fall inside the analysis window.
    const at = (offsetSeconds: number) => new Date(Date.now() - offsetSeconds * 1000).toISOString()
    const lines = [
      `${at(4)} myhost sshd[1]: Failed password for root from 10.0.0.9 port 22 ssh2`,
      `${at(3)} myhost sshd[2]: Failed password for root from 10.0.0.9 port 22 ssh2`,
      `${at(2)} myhost sshd[3]: Failed password for root from 10.0.0.9 port 22 ssh2`,
      `${at(1)} myhost sshd[4]: Failed password for root from 10.0.0.9 port 22 ssh2`,
    ]
    const logPath = `${import.meta.dir}/tmp-brute.log`
    await Bun.write(logPath, lines.join("\n"))

    const result = await monitor.detectBruteForce("h1", logPath, 3600, 3)
    await Bun.file(logPath).delete()

    expect(result.ok).toBe(true)
    expect(result.data.analyzedFailures).toBe(4)
    expect(result.data.detected).toBe(true)
    expect(result.data.offenders[0].failures).toBe(4)
  })

  test("failures older than the window are outside the analysis", async () => {
    const monitor = new CyberSecurityMonitor()
    monitor.addHost("h1", "127.0.0.1")
    const stale = new Date(Date.now() - 7200 * 1000).toISOString()
    const lines = [
      `${stale} myhost sshd[1]: Failed password for root from 10.0.0.9 port 22 ssh2`,
      `${stale} myhost sshd[2]: Failed password for root from 10.0.0.9 port 22 ssh2`,
      `${stale} myhost sshd[3]: Failed password for root from 10.0.0.9 port 22 ssh2`,
    ]
    const logPath = `${import.meta.dir}/tmp-stale.log`
    await Bun.write(logPath, lines.join("\n"))

    const result = await monitor.detectBruteForce("h1", logPath, 3600, 3)
    await Bun.file(logPath).delete()

    expect(result.data.analyzedFailures).toBe(0)
    expect(result.data.detected).toBe(false)
  })

  test("a clean log reports no attackers", async () => {
    const monitor = new CyberSecurityMonitor()
    monitor.addHost("h1", "127.0.0.1")
    const logPath = `${import.meta.dir}/tmp-clean.log`
    await Bun.write(logPath, `${new Date().toISOString()} myhost sshd[1]: Accepted password for alice from 10.0.0.5`)

    const result = await monitor.detectBruteForce("h1", logPath, 3600, 3)
    await Bun.file(logPath).delete()

    expect(result.data.analyzedFailures).toBe(0)
    expect(result.data.detected).toBe(false)
  })

  test("missing log file is an explicit error, never a fake clean result", async () => {
    const monitor = new CyberSecurityMonitor()
    monitor.addHost("h1", "127.0.0.1")

    const result = await monitor.detectBruteForce("h1", `${import.meta.dir}/does-not-exist.log`)
    expect(result.ok).toBe(false)
    expect(result.error).toContain("not found")
  })

  test("logPath is required so the tool cannot invent evidence", async () => {
    const monitor = new CyberSecurityMonitor()
    monitor.addHost("h1", "127.0.0.1")

    const result = await monitor.detectBruteForce("h1")
    expect(result.ok).toBe(false)
    expect(result.error).toContain("logPath")
  })
})

describe("SurveillanceSystem state persists across calls", () => {
  test("a camera added first is still known to a later call", () => {
    const system = new SurveillanceSystem()
    expect(system.addCamera("cam1", "gate").ok).toBe(true)

    const status = system.getRecordingStatus()
    expect(status.ok).toBe(true)
    expect(status.data.cameras).toEqual([{ id: "cam1", location: "gate", recording: false }])
  })

  test("recording state survives a later call", () => {
    const system = new SurveillanceSystem()
    system.addCamera("cam1", "gate")
    system.setRecording("cam1", true)

    expect(system.getFeed("cam1").data.recording).toBe(true)
  })

  test("motion on an unknown camera is an explicit error", async () => {
    const system = new SurveillanceSystem()
    const result = await system.detectMotion("nope")
    expect(result.ok).toBe(false)
    expect(result.error).toBe("Camera not found")
  })

  test("an out of range threshold is rejected before any capture happens", async () => {
    const system = new SurveillanceSystem()
    system.addCamera("cam1", "gate")

    const result = await system.detectMotion("cam1", 9999, 400)
    expect(result.ok).toBe(false)
    expect(result.error).toContain("sensitivity")
  })

  // Both motion tests below take two real screen captures, so they need a desktop to
  // capture. A runner has none, so they follow the same opt-in as the desktop control suite.
  test.skipIf(!drivesRealInput)("real motion is measured from two real screen frames", async () => {
    const system = new SurveillanceSystem()
    system.addCamera("cam1", "gate")

    const result = await system.detectMotion("cam1", 12, 400)

    // Two real captures have to succeed before any verdict exists.
    expect(result.ok).toBe(true)
    expect(result.data.frameSize.width).toBeGreaterThan(0)
    expect(result.data.frameSize.height).toBeGreaterThan(0)
    expect(typeof result.data.meanAbsoluteDifference).toBe("number")
    expect(result.data.baselineCaptured).toBe(true)
    expect(Array.isArray(result.data.zones)).toBe(true)
  }, 30000)

  test.skipIf(!drivesRealInput)("a still screen between two captures reports no motion", async () => {
    const system = new SurveillanceSystem()
    system.addCamera("cam1", "gate")

    const first = await system.detectMotion("cam1", 12, 200)
    const second = await system.detectMotion("cam1", 12, 200)

    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    // A quiet screen measured against itself must not invent activity.
    if (second.data.meanAbsoluteDifference < 12) expect(second.data.detected).toBe(false)
  }, 30000)
})
