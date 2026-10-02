// Copyright (c) 2026 onelpawarai. All rights reserved.

import { spawn, execFile, execFileSync } from "node:child_process"
import { EventEmitter } from "node:events"
import { createConnection } from "node:net"
import { URL } from "node:url"
import { appendFileSync, mkdirSync } from "node:fs"
import { join } from "node:path"
import { app } from "electron"

export type StreamStatus = "idle" | "starting" | "streaming" | "stopping" | "error"

export type CaptureMode = "fullscreen" | "app"

export type AudioMode = "none" | "microphone" | "system"

export type StreamState = {
  status: StreamStatus
  error?: string
  viewerCount: number
  streamDuration: number
  rtmpUrl: string
  resolution: string
  captureMode: CaptureMode
  audioMode: AudioMode
  systemAudioAvailable: boolean
}

export type YouTubeStreamConfig = {
  streamKey: string
  streamUrl?: string
  youtubeApiKey?: string
  quality?: "4k" | "1440p" | "1080p" | "720p"
  captureMode?: CaptureMode
  audioMode?: AudioMode
}

/**
 * Ready-made endpoints. YouTube and Facebook both speak plain RTMP, so supporting a
 * platform is a matter of choosing its ingest host — the encoder path below does not
 * change at all. Facebook uses :80 and a stream key from Live Producer; its in-app
 * RTMP server is only reachable on a verified account, so if the connection fails the
 * error says so instead of hanging.
 */
export const STREAM_ENDPOINTS = {
  youtube: {
    label: "YouTube",
    url: "rtmp://a.rtmp.youtube.com/live2",
    keyUrl: "https://www.youtube.com/livemac?macm=YOUR_STREAM_KEY",
    help: "YouTube Studio > Create > Go live > Stream key.",
  },
  facebook: {
    label: "Facebook",
    url: "rtmp://rtmp.facebook.com:80/rtmp",
    keyUrl: "https://live.facebook.com/rtmp",
    help: "Facebook > Go Live > Live Producer > Stream Setup > Get Stream URL and key.",
  },
} as const

export type StreamPlatform = keyof typeof STREAM_ENDPOINTS

let _ffmpegPath: string | null = null

/** Loopback/capture devices that carry the whole system's audio. */
function isLoopbackDevice(device: string): boolean {
  const d = device.toLowerCase()
  return (
    d.includes("virtual") || d.includes("cable") || d.includes("loopback") ||
    d.includes("stereo mix") || d.includes("what u hear") || d.includes("blackhole")
  )
}

/**
 * A microphone a stream can actually record from. Loopback devices and the
 * "Stereo Mix" style captures are excluded so they are not mistaken for a mic.
 */
function isUsableMicrophone(device: string): boolean {
  const d = device.toLowerCase()
  if (!d) return false
  if (isLoopbackDevice(d)) return false
  if (d.includes("virtual-audio-capturer")) return false
  return true
}

/**
 * Primary display index for avfoundation. Index 1 is the first screen on a Mac with
 * more than one; index 0 is the capture probe and has no video.
 */
function macPrimaryDisplayIndex(): number {
  return process.env.ZYRAXON_CAPTURE_DISPLAY ? Number(process.env.ZYRAXON_CAPTURE_DISPLAY) : 1
}

/** True when the user has already granted Screen Recording to this app. */
async function macScreenRecordingGranted(): Promise<boolean> {
  return new Promise((resolve) => {
    // A short capture is the only reliable test; it either yields a frame or fails.
    try {
      const probe = execFileSync("ffmpeg", ["-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""], {
        timeout: 5000,
        stdio: ["pipe", "pipe", "pipe"],
      })
      resolve(Buffer.from(probe).length > 0)
    } catch {
      // ffmpeg exits non-zero after printing the device list; that still means it ran.
      resolve(true)
    }
  })
}

/** Physical size of the X11 screen, for x11grab's -video_size. */
function linuxDisplaySize(): string | null {
  try {
    const out = execFileSync("xrandr", ["--current"], { timeout: 5000, encoding: "utf8" })
    for (const line of out.split("\n")) {
      const m = line.match(/connected.*?(\d{3,5})x(\d{3,5})/)
      if (m) return `${m[1]}x${m[2]}`
    }
  } catch {}
  return null
}

function logStreamDebug(message: string) {
  try {
    const logDir = join(app.getPath("userData"), "logs")
    mkdirSync(logDir, { recursive: true })
    const ts = new Date().toISOString()
    appendFileSync(join(logDir, "stream-debug.log"), `[${ts}] ${message}\n`)
  } catch {}
}

function sanitizeStreamKey(key: string): string {
  return key.replace(/[\r\n\t]/g, "").replace(/\s+/g, "").trim()
}

function findFfmpeg(): string {
  if (_ffmpegPath) return _ffmpegPath
  try {
    execFileSync("ffmpeg", ["-version"], { timeout: 5000, stdio: "pipe" })
    _ffmpegPath = "ffmpeg"
    return _ffmpegPath
  } catch {
    throw new Error("ffmpeg not found. Please install ffmpeg and ensure it is in your PATH.")
  }
}

function probeAudioDevices(ffmpegPath: string): Promise<string[]> {
  // Probing with dshow listed nothing off Windows, so the microphone list was empty
  // everywhere else and every audio choice silently fell back to silence.
  const platform = process.platform
  if (platform === "darwin") {
    return new Promise((resolve) => {
      execFile(ffmpegPath, ["-hide_banner", "-f", "avfoundation", "-list_devices", "true", "-i", ""], { timeout: 10000 }, (_err, _stdout, stderr) => {
        const output = stderr || ""
        // avfoundation reports "No such device" on a non-zero exit but still lists them.
        const names = new Set<string>()
        const pattern = /\[\d+\]\s+(.+?)\s+\((?:audio|video)\)/g
        let match
        while ((match = pattern.exec(output)) !== null) names.add(match[1].trim())
        resolve([...names])
      })
    })
  }

  if (platform === "linux") {
    return new Promise((resolve) => {
      execFile(ffmpegPath, ["-hide_banner", "-f", "pulse", "-list_devices", "true", "-i", "dummy"], { timeout: 10000 }, (_err, _stdout, stderr) => {
        const output = stderr || ""
        const devices: string[] = []
        const pattern = /^device: ([^:]+):/gm
        let match
        while ((match = pattern.exec(output)) !== null) devices.push(match[1].trim())
        // "default" always works on PulseAudio and is the safe answer when probing
        // returned nothing useful.
        resolve(devices.length > 0 ? devices : ["default"])
      })
    })
  }

  return new Promise((resolve) => {
    execFile(ffmpegPath, ["-hide_banner", "-list_devices", "true", "-f", "dshow", "-i", "dummy"], { timeout: 10000 }, (_err, _stdout, stderr) => {
      const output = stderr || ""
      const devices: string[] = []
      const regex = /"([^"]+)" \(audio\)/g
      let match
      while ((match = regex.exec(output)) !== null) {
        devices.push(match[1])
      }
      resolve(devices)
    })
  })
}

function testRtmpConnectivity(rtmpUrl: string): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    try {
      const parsed = new URL(rtmpUrl)
      const host = parsed.hostname
      const port = parsed.port ? parseInt(parsed.port) : 1935
      const socket = createConnection({ host, port, timeout: 8000 })
      const timer = setTimeout(() => {
        socket.destroy()
        resolve({ ok: false, error: `Connection to ${host}:${port} timed out after 8s` })
      }, 8000)
      socket.on("connect", () => {
        clearTimeout(timer)
        socket.destroy()
        console.log(`[Stream] RTMP connectivity OK: ${host}:${port}`)
        resolve({ ok: true })
      })
      socket.on("error", (err: any) => {
        clearTimeout(timer)
        socket.destroy()
        resolve({ ok: false, error: `Cannot connect to ${host}:${port}: ${err.message}` })
      })
      socket.on("timeout", () => {
        clearTimeout(timer)
        socket.destroy()
        resolve({ ok: false, error: `Connection to ${host}:${port} timed out` })
      })
    } catch (err: any) {
      resolve({ ok: false, error: `Invalid RTMP URL: ${err.message}` })
    }
  })
}

async function findExactWindowTitle(title: string): Promise<string | null> {
  // This asked PowerShell, which does not exist off Windows, so "capture the app
  // window" silently never found anything there.
  if (process.platform !== "win32") return null
  return new Promise((resolve) => {
    execFile("powershell", [
      "-Command",
      `Get-Process | Where-Object { $_.MainWindowTitle -like "*${title}*" } | Select-Object -First 1 -ExpandProperty MainWindowTitle`,
    ], { timeout: 10000 }, (_err, stdout) => {
      const exact = (stdout || "").trim()
      resolve(exact.length > 0 ? exact : null)
    })
  })
}

export class YouTubeStreamManager extends EventEmitter {
  private process: ReturnType<typeof spawn> | null = null
  private status: StreamStatus = "idle"
  private error: string | undefined
  private viewerCount = 0
  private streamStartTime = 0
  private viewerPollTimer: ReturnType<typeof setInterval> | null = null
  private durationTimer: ReturnType<typeof setInterval> | null = null
  private config: YouTubeStreamConfig = { streamKey: "" }
  private currentCaptureMode: CaptureMode = "fullscreen"
  private currentAudioMode: AudioMode = "system"
  private _systemAudioAvailable = false
  private _probedDevices: string[] = []

  get systemAudioAvailable(): boolean { return this._systemAudioAvailable }
  get probedDevices(): string[] { return this._probedDevices }

  async probeDevices(): Promise<{ systemAudioAvailable: boolean; devices: string[] }> {
    const ffmpegPath = findFfmpeg()
    this._probedDevices = await probeAudioDevices(ffmpegPath)
    this._systemAudioAvailable = this._probedDevices.some(isLoopbackDevice)
    console.log("[Stream] Probed audio devices:", this._probedDevices)
    console.log("[Stream] System audio available:", this._systemAudioAvailable)
    return { systemAudioAvailable: this._systemAudioAvailable, devices: this._probedDevices }
  }

  getState(): StreamState {
    return {
      status: this.status,
      error: this.error,
      viewerCount: this.viewerCount,
      streamDuration: this.status === "streaming" ? Math.floor((Date.now() - this.streamStartTime) / 1000) : 0,
      rtmpUrl: this.getFullRtmpUrl(),
      resolution: this.getResolution(),
      captureMode: this.currentCaptureMode,
      audioMode: this.currentAudioMode,
      systemAudioAvailable: this._systemAudioAvailable,
    }
  }

  private getFullRtmpUrl(): string {
    const base = this.config.streamUrl || "rtmp://a.rtmp.youtube.com/live2"
    const key = this.config.streamKey
    if (!key) return base
    return `${base}/${key}`
  }

  private getResolution(): string {
    switch (this.config.quality) {
      case "4k": return "3840x2160"
      case "1440p": return "2560x1440"
      case "1080p": return "1920x1080"
      case "720p": return "1280x720"
      default: return "1920x1080"
    }
  }

  private getBitrate(): string {
    switch (this.config.quality) {
      case "4k": return "40000k"
      case "1440p": return "20000k"
      case "1080p": return "12000k"
      case "720p": return "6000k"
      default: return "12000k"
    }
  }

  private getMaxBitrate(): string {
    switch (this.config.quality) {
      case "4k": return "50000k"
      case "1440p": return "25000k"
      case "1080p": return "15000k"
      case "720p": return "8000k"
      default: return "15000k"
    }
  }

  private getScaleFilter(): string {
    switch (this.config.quality) {
      case "4k": return "scale=3840:2160:flags=lanczos"
      case "1440p": return "scale=2560:1440:flags=lanczos"
      case "1080p": return "scale=1920:1080:flags=lanczos"
      case "720p": return "scale=1280:720:flags=lanczos"
      // Anything unrecognised follows the resolution the encoder is actually told to
      // produce, instead of silently asking ffmpeg to upscale to 4K on a 1080p stream.
      default: return "scale=1920:1080:flags=lanczos"
    }
  }

  /**
   * Screen capture for the platform we are actually running on.
   *
   * gdigrab and dshow exist only on Windows; avfoundation is macOS; x11grab needs
   * X11. Using one of them everywhere is why streaming simply did not start on the
   * other two platforms.
   */
  private async buildVideoInput(): Promise<string[]> {
    const platform = process.platform
    const framerate = "30"

    if (platform === "win32") {
      if (this.currentCaptureMode === "app") {
        const exactTitle = await findExactWindowTitle("ZYRAXON")
        if (exactTitle) {
          logStreamDebug(`Found exact window title: "${exactTitle}"`)
          console.log(`[Stream] Capturing window: "${exactTitle}"`)
          return ["-f", "gdigrab", "-framerate", framerate, "-i", `title=${exactTitle}`]
        }
        console.log("[Stream] App window not found, falling back to full desktop")
        logStreamDebug("App window not found, falling back to full desktop")
      }
      return ["-f", "gdigrab", "-framerate", framerate, "-i", "desktop"]
    }

    if (platform === "darwin") {
      // Screen capture needs an explicit permission grant on macOS; failing here with a
      // clear message beats ffmpeg exiting on an opaque "no such device".
      if (platform === "darwin" && !(await macScreenRecordingGranted())) {
        throw new Error(
          "macOS blocked screen recording. Grant ZYRAXON access in System Settings > Privacy & Security > Screen Recording, then start the stream again.",
        )
      }
      // Index 1 is the first display on a two-screen Mac; 0 is the capture probe.
      const display = macPrimaryDisplayIndex()
      const args = ["-f", "avfoundation", "-capture_cursor", "1", "-framerate", framerate]
      if (this.currentCaptureMode === "app") {
        const title = await findExactWindowTitle("ZYRAXON")
        if (title) return [...args, "-i", `${display}:none`]
      }
      return [...args, "-i", `${display}:none`]
    }

    // Linux: x11grab needs an explicit geometry and a display. Without DISPLAY there is
    // nothing to capture, so say so rather than handing ffmpeg an empty input.
    const display = process.env.DISPLAY ?? ":0"
    if (process.platform === "linux" && !display) {
      throw new Error("No DISPLAY is set, so there is no screen to capture. Streaming needs a graphical session.")
    }
    const size = linuxDisplaySize()
    const args = ["-f", "x11grab", "-framerate", framerate]
    if (size) args.push("-video_size", size)
    return [...args, "-i", display]
  }

  private buildAudioInput(): string[] {
    const platform = process.platform
    const silent: string[] = ["-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo"]

    if (platform === "win32") {
      if (this.currentAudioMode === "microphone") {
        // The device used to be a hardcoded "Microphone Array (Realtek Audio)", so on any
        // other machine ffmpeg exited immediately and the stream never went live. Ask
        // ffmpeg what is actually plugged in and take the first real capture device.
        const device = this._probedDevices.find(isUsableMicrophone)
        if (!device) {
          console.log("[Stream] No microphone found, falling back to silent audio")
          return silent
        }
        return ["-f", "dshow", "-i", `audio=${device}`]
      }
      if (this.currentAudioMode === "system" && this._systemAudioAvailable) {
        const systemDevice = this._probedDevices.find(isLoopbackDevice)
        if (systemDevice) return ["-f", "dshow", "-i", `audio=${systemDevice}`]
      }
      return silent
    }

    if (platform === "darwin") {
      if (this.currentAudioMode === "none") return silent
      // On macOS system audio needs a loopback device (BlackHole); without one, take the
      // microphone so the stream still carries voice instead of dropping the audio track.
      const loopback = this._probedDevices.find(isLoopbackDevice)
      if (loopback) return ["-f", "avfoundation", "-i", loopback]
      return ["-f", "avfoundation", "-i", ":0"]
    }

    // Linux: PulseAudio/PipeWire first, then ALSA as a fallback.
    if (this.currentAudioMode === "none") return silent
    if (this._systemAudioAvailable) {
      return ["-f", "pulse", "-i", this._probedDevices.find(isLoopbackDevice) ?? "default"]
    }
    const mic = this._probedDevices.find(isUsableMicrophone)
    if (mic) return ["-f", "alsa", "-i", mic]
    return silent
  }

  async start(config: YouTubeStreamConfig): Promise<StreamState> {
    if (this.status === "streaming" || this.status === "starting") {
      return this.getState()
    }

    const sanitizedKey = sanitizeStreamKey(config.streamKey)
    logStreamDebug(`Raw key length=${config.streamKey.length} sanitized length=${sanitizedKey.length} changed=${config.streamKey !== sanitizedKey}`)
    this.config = { ...config, streamKey: sanitizedKey }
    this.currentCaptureMode = config.captureMode || "fullscreen"
    this.currentAudioMode = config.audioMode ?? "system"
    this.error = undefined
    this.setStatus("starting")

    let ffmpegPath: string
    try {
      ffmpegPath = findFfmpeg()
    } catch (err: any) {
      this.handleError(err.message)
      return this.getState()
    }

    if (this.currentAudioMode === "system") {
      await this.probeDevices()
      if (!this._systemAudioAvailable) {
        this.currentAudioMode = "none"
        console.log("[Stream] No system audio device found, falling back to silent")
      }
    }

    const rtmpUrl = this.getFullRtmpUrl()

    console.log("[Stream] Checking RTMP connectivity...")
    logStreamDebug(`Testing RTMP connectivity to: ${rtmpUrl}`)
    const connTest = await testRtmpConnectivity(rtmpUrl)
    logStreamDebug(`RTMP connectivity result: ok=${connTest.ok} error=${connTest.error || "none"}`)
    if (!connTest.ok) {
      // Facebook only accepts RTMP on accounts with Live enabled, and its host refuses
      // the connection outright otherwise. Say which case this is so the user knows
      // whether to fix the key or enable Live.
      const isFacebook = rtmpUrl.includes("facebook.com")
      const hint = isFacebook
        ? " Facebook's RTMP server is only reachable from an account with Live enabled — check that the stream key is current and that the page is set to Go Live."
        : " Make sure the stream key is correct and your network allows RTMP."
      this.handleError(`RTMP connection failed: ${connTest.error}.${hint}`)
      return this.getState()
    }

    const bitrate = this.getBitrate()
    const maxBitrate = this.getMaxBitrate()

    const videoInput = await this.buildVideoInput()
    const audioInput = this.buildAudioInput()

    const targetW = this.config.quality === "4k" ? 3840 : this.config.quality === "1440p" ? 2560 : this.config.quality === "1080p" ? 1920 : 1280
    const targetH = this.config.quality === "4k" ? 2160 : this.config.quality === "1440p" ? 1440 : this.config.quality === "1080p" ? 1080 : 720
    // Must match the framerate buildVideoInput() asks the capture device for, or ffmpeg
    // duplicates or drops frames and the stream judders.
    const filterComplex = `[0:v]scale=${targetW}:${targetH}:flags=lanczos,format=yuv420p,fps=30[v];[1:a]aresample=44100[a]`

    const ffmpegArgs = [
      ...videoInput,
      ...audioInput,
      "-filter_complex", filterComplex,
      "-map", "[v]",
      "-map", "[a]",
      "-c:v", "libx264",
      // veryfast holds quality on a live stream while leaving headroom for the encode to
      // keep up in real time. "slow" was starving the encoder on weaker machines and
      // dropping frames, which is what made the picture look bad.
      "-preset", "veryfast",
      // zerolatency keeps the stream live; zerolatency-tune zerolatency tunes the whole
      // pipeline for it rather than just flagging the encoder.
      "-tune", "zerolatency",
      "-profile:v", "high",
      "-level", "4.2",
      "-pix_fmt", "yuv420p",
      "-b:v", bitrate,
      "-maxrate", maxBitrate,
      "-bufsize", "40000k",
      // One keyframe every two seconds at 30fps. The old value was 120 frames, which at
      // the old 60fps was four seconds and made viewers wait longer for the picture.
      "-g", "60",
      "-keyint_min", "60",
      "-sc_threshold", "0",
      // No B-frames under zerolatency: they have to be buffered before they can be sent.
      "-bf", "0",
      "-c:a", "aac",
      "-b:a", "192k",
      "-ar", "44100",
      "-ac", "2",
      "-shortest",
      "-f", "flv",
      rtmpUrl,
    ]

    console.log("[Stream] ffmpeg path:", ffmpegPath)
    console.log("[Stream] ffmpeg args:", ffmpegArgs.join(" "))
    logStreamDebug(`START ffmpeg: ${ffmpegPath} ${ffmpegArgs.join(" ")}`)
    logStreamDebug(`RTMP URL: ${rtmpUrl}`)

    let stderrLog = ""

    try {
      this.process = spawn(ffmpegPath, ffmpegArgs, {
        stdio: ["pipe", "pipe", "pipe"],
        detached: false,
      })

      this.process.on("error", (err) => {
        console.error("[Stream] Process error:", err.message)
        logStreamDebug(`PROCESS ERROR: ${err.message}`)
        this.handleError(`Failed to start ffmpeg: ${err.message}`)
      })

      this.process.on("exit", (code, signal) => {
        console.log(`[Stream] ffmpeg exited: code=${code} signal=${signal}`)
        logStreamDebug(`EXIT code=${code} signal=${signal}`)
        logStreamDebug(`STDERR FULL:\n${stderrLog}`)
        if (this.status === "stopping") {
          this.setStatus("idle")
        } else if (code !== null && code !== 0) {
          const snippet = stderrLog.slice(-2000)
          console.error("[Stream] ffmpeg stderr:", snippet)
          const realError = snippet.includes("error") || snippet.includes("Error")
            ? snippet.split("\n").filter((l: string) => l.toLowerCase().includes("error") || l.includes("errno") || l.includes("code=")).join(" | ").slice(0, 500)
            : ""
          const hint = realError
            ? `FFmpeg error: ${realError}`
            : `ffmpeg exited with code ${code}. Check stream key and network.`
          this.handleError(hint)
        } else if (signal) {
          this.handleError(`ffmpeg killed by signal ${signal}`)
        } else {
          this.setStatus("idle")
        }
      })

      this.process.stderr?.on("data", (data: Buffer) => {
        const output = data.toString()
        stderrLog += output
        logStreamDebug(`STDERR CHUNK: ${output.trim().slice(0, 300)}`)
        if (output.includes("error") || output.includes("Error") || output.includes("Output #") || output.includes("Stream #")) {
          console.log("[ffmpeg]", output.trim().slice(0, 500))
        }
        if (output.includes("frame=") && this.status === "starting") {
          console.log("[Stream] Stream encoding started successfully")
          logStreamDebug("STREAM ENCODING STARTED - setting status to streaming")
          this.setStatus("streaming")
        }
      })

      this.streamStartTime = Date.now()

      await new Promise<void>((resolve) => {
        setTimeout(() => {
          if (this.process && !this.process.killed) {
            if (this.status === "starting") {
              this.setStatus("streaming")
            }
            this.startViewerPolling()
            this.startDurationTimer()
          }
          resolve()
        }, 4000)
      })

    } catch (err: any) {
      console.error("[Stream] Spawn error:", err.message)
      this.handleError(`Failed to spawn ffmpeg: ${err.message}`)
    }

    return this.getState()
  }

  async stop(): Promise<StreamState> {
    if (this.status !== "streaming" && this.status !== "starting") {
      return this.getState()
    }

    this.setStatus("stopping")
    this.stopViewerPolling()
    this.stopDurationTimer()

    if (this.process) {
      try {
        this.process.stdin?.write("q")
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            if (this.process) {
              try { this.process.kill("SIGKILL") } catch {}
            }
            resolve()
          }, 5000)
          this.process?.once("exit", () => {
            clearTimeout(timer)
            resolve()
          })
        })
      } catch {}
      this.process = null
    }

    this.viewerCount = 0
    this.setStatus("idle")
    return this.getState()
  }

  async toggleCaptureMode(): Promise<StreamState> {
    const newMode: CaptureMode = this.currentCaptureMode === "fullscreen" ? "app" : "fullscreen"

    if (this.status === "streaming" || this.status === "starting") {
      const savedConfig = { ...this.config }
      await this.stop()
      await new Promise<void>((resolve) => setTimeout(resolve, 1500))
      return this.start({ ...savedConfig, captureMode: newMode })
    }

    this.currentCaptureMode = newMode
    return this.getState()
  }

  private setStatus(status: StreamStatus) {
    this.status = status
    this.emit("status", this.getState())
  }

  private handleError(message: string) {
    console.error("[Stream] Error:", message)
    this.error = message
    this.setStatus("error")
    this.stopViewerPolling()
    this.stopDurationTimer()
    this.process = null
  }

  private startViewerPolling() {
    this.stopViewerPolling()
    if (!this.config.youtubeApiKey) return

    this.viewerPollTimer = setInterval(async () => {
      try {
        const viewers = await this.fetchViewerCount()
        this.viewerCount = viewers
        this.emit("viewers", viewers)
      } catch {}
    }, 10000)
  }

  private stopViewerPolling() {
    if (this.viewerPollTimer) {
      clearInterval(this.viewerPollTimer)
      this.viewerPollTimer = null
    }
  }

  private startDurationTimer() {
    this.stopDurationTimer()
    this.durationTimer = setInterval(() => {
      this.emit("duration", this.getState().streamDuration)
    }, 1000)
  }

  private stopDurationTimer() {
    if (this.durationTimer) {
      clearInterval(this.durationTimer)
      this.durationTimer = null
    }
  }

  private async fetchViewerCount(): Promise<number> {
    if (!this.config.youtubeApiKey) return 0

    const url = `https://www.googleapis.com/youtube/v3/liveBroadcasts?part=statistics&broadcastStatus=active&key=${this.config.youtubeApiKey}`
    const res = await fetch(url)
    const data = await res.json() as any

    const items = data?.items
    if (Array.isArray(items) && items.length > 0) {
      return parseInt(items[0].statistics?.concurrentViewers ?? "0", 10)
    }
    return 0
  }

  destroy() {
    this.stopViewerPolling()
    this.stopDurationTimer()
    if (this.process) {
      try { this.process.kill("SIGKILL") } catch {}
      this.process = null
    }
  }
}
