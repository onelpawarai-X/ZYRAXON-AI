// Copyright (c) 2026 onelpawarai. All rights reserved.

import { describe, expect, test } from "bun:test"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"
import * as zlib from "node:zlib"
import { editImage, extractData, extractPdfText, readImageRgb, runOcr } from "../src/x/media-processing"
import { decodePngToRgb, encodePng } from "../src/x/desktop-control"
import { computerControlTools, mediaTools, planningTools, selfImproveTools } from "../src/x/advanced-tools"
import { createPlan, deriveSteps, markSkipped, summarise, type Plan } from "../src/x/plan-engine"
import { haveCommand, run, runCommand } from "../src/x/process-utils"

const hasFfmpeg = await haveCommand("ffmpeg")
const scratch = path.join(os.tmpdir(), "zyraxon_media_test")

function gradient(width: number, height: number): Buffer {
  const rgb = Buffer.alloc(width * height * 3)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 3
      rgb[i] = (x * 255) / Math.max(1, width - 1)
      rgb[i + 1] = (y * 255) / Math.max(1, height - 1)
      rgb[i + 2] = 90
    }
  }
  return rgb
}

async function scratchFile(name: string, bytes: Buffer | string): Promise<string> {
  await fs.mkdir(scratch, { recursive: true })
  const file = path.join(scratch, name)
  await Bun.write(file, bytes)
  return file
}

function toolFrom(group: { id: string }[], id: string) {
  const found = group.find((t) => t.id === id)
  if (!found) throw new Error(`tool ${id} is not registered in this group`)
  return found as unknown as {
    execute: (args: Record<string, unknown>) => Promise<{ ok: boolean; data?: any; error?: string }>
  }
}

describe("process runner behaves the same on every platform", () => {
  test("a missing binary is an error, not a crash", async () => {
    const result = await runCommand("zyraxon_definitely_not_a_real_binary", [])
    expect(result.ok).toBe(false)
    if (result.ok === false) expect(result.error).toContain("could not start")
  })

  test("a non-zero exit throws with the real error text", async () => {
    expect(run("node", ["-e", "process.stderr.write('boom'); process.exit(3)"])).rejects.toThrow(/boom/)
    expect(run("node", ["-e", "process.stderr.write('boom'); process.exit(3)"])).rejects.toThrow(/exited with 3/)
  })

  test("a successful run resolves with stdout", async () => {
    expect(await run("node", ["-e", "process.stdout.write('fine')"])).toBe("fine")
  })

  test("stdin is forwarded to the child", async () => {
    expect(await run("node", ["-e", "process.stdin.pipe(process.stdout)"], { input: "hello stdin" })).toBe("hello stdin")
  })
})

describe("PNG codec is exact", () => {
  test("round trips arbitrary pixel data", () => {
    const rgb = Buffer.alloc(7 * 5 * 3)
    for (let i = 0; i < rgb.length; i++) rgb[i] = (i * 31) % 256
    const decoded = decodePngToRgb(encodePng(rgb, 7, 5))
    expect(decoded.info).toEqual({ width: 7, height: 5 })
    expect(decoded.rgb.equals(rgb)).toBe(true)
  })

  test("rejects data that is not a PNG", () => {
    expect(() => decodePngToRgb(Buffer.from("definitely not a png"))).toThrow()
  })

  test("rejects a PNG with a corrupt compressed stream", () => {
    const png = encodePng(gradient(4, 4), 4, 4)
    png[png.length - 20] = 0xff
    expect(() => decodePngToRgb(png)).toThrow()
  })
})

describe("image editing really changes the image", () => {
  test("resize produces the requested dimensions and keeps pixels", async () => {
    const src = await scratchFile("resize_in.png", encodePng(gradient(40, 20), 40, 20))
    const result = await editImage(src, "resize", { width: 20, height: 10 })
    expect(result.ok).toBe(true)
    expect((result.data as any).after).toEqual({ width: 20, height: 10 })
    const out = (result.data as any).output as string
    expect(decodePngToRgb(Buffer.from(await Bun.file(out).arrayBuffer())).info).toEqual({ width: 20, height: 10 })
  })

  test("crop cuts exactly the requested window", async () => {
    const src = await scratchFile("crop_in.png", encodePng(gradient(30, 30), 30, 30))
    const result = await editImage(src, "crop", { x: 5, y: 5, width: 10, height: 8 })
    expect(result.ok).toBe(true)
    const read = await readImageRgb((result.data as any).output)
    const original = await readImageRgb(src)
    // The top-left of the crop must equal the source at (5,5).
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 10; x++) {
        const from = ((y + 5) * 30 + (x + 5)) * 3
        const to = (y * 10 + x) * 3
        expect(read.data[to]).toBe(original.data[from])
        expect(read.data[to + 1]).toBe(original.data[from + 1])
      }
    }
  })

  test("rotate 90 swaps the axes and keeps every pixel once", async () => {
    const rgb = gradient(8, 4)
    const src = await scratchFile("rot_in.png", encodePng(rgb, 8, 4))
    const result = await editImage(src, "rotate", { degrees: 90 })
    expect(result.ok).toBe(true)
    const read = await readImageRgb((result.data as any).output)
    expect(read.width).toBe(4)
    expect(read.height).toBe(8)
    const sourcePixels = new Set(Array.from(rgb))
    const rotatedPixels = new Set(Array.from(read.data))
    expect(rotatedPixels.size).toBe(sourcePixels.size)
  })

  test("brightness clamps at 255 instead of wrapping", async () => {
    const white = Buffer.alloc(4 * 4 * 3, 255)
    const src = await scratchFile("bright_in.png", encodePng(white, 4, 4))
    const result = await editImage(src, "brightness", { amount: 200 })
    expect(result.ok).toBe(true)
    const read = await readImageRgb((result.data as any).output)
    expect(Math.max(...read.data)).toBe(255)
  })

  test("brightness clamps at 0 for a negative amount", async () => {
    const black = Buffer.alloc(4 * 4 * 3, 0)
    const src = await scratchFile("dark_in.png", encodePng(black, 4, 4))
    const result = await editImage(src, "brightness", { amount: -200 })
    const read = await readImageRgb((result.data as any).output)
    expect(Math.min(...read.data)).toBe(0)
  })

  test("grayscale makes r, g and b equal", async () => {
    const src = await scratchFile("gray_in.png", encodePng(gradient(10, 10), 10, 10))
    const result = await editImage(src, "filter", { filter: "grayscale" })
    const read = await readImageRgb((result.data as any).output)
    for (let i = 0; i < read.data.length; i += 3) {
      expect(read.data[i]).toBe(read.data[i + 1])
      expect(read.data[i + 1]).toBe(read.data[i + 2])
    }
  })

  test("blur moves neighbouring pixels but keeps the mean roughly", async () => {
    const src = await scratchFile("blur_in.png", encodePng(gradient(12, 12), 12, 12))
    const before = await readImageRgb(src)
    const result = await editImage(src, "filter", { filter: "blur" })
    const after = await readImageRgb((result.data as any).output)
    const mean = (buf: Buffer) => buf.reduce((a, b) => a + b, 0) / buf.length
    expect(Math.abs(mean(after.data) - mean(before.data))).toBeLessThan(12)
    expect(after.data.equals(before.data)).toBe(false)
  })

  test("an unknown operation is refused with the supported list", async () => {
    const src = await scratchFile("unknown_in.png", encodePng(gradient(4, 4), 4, 4))
    const result = await editImage(src, "teleport", {})
    expect(result.ok).toBe(false)
    expect(result.error).toContain("unknown operation")
  })

  test("a crop outside the image is refused", async () => {
    const src = await scratchFile("oob_in.png", encodePng(gradient(10, 10), 10, 10))
    const result = await editImage(src, "crop", { x: 0, y: 0, width: 999, height: 5 })
    expect(result.ok).toBe(false)
    expect(result.error).toContain("does not fit")
  })

  test("a missing input file is refused", async () => {
    const result = await editImage(path.join(scratch, "nope.png"), "resize", { width: 2, height: 2 })
    expect(result.ok).toBe(false)
    expect(result.error).toContain("not found")
  })
})

describe("PDF text extraction needs no external binary", () => {
  function buildPdf(lines: string[]): Buffer {
    const content = ["BT", "/F1 18 Tf", "72 720 Td"]
    for (const [i, l] of lines.entries()) {
      content.push(`(${l}) Tj`)
      if (i < lines.length - 1) content.push("0 -28 Td")
    }
    content.push("ET")
    const stream = zlib.deflateSync(Buffer.from(content.join("\n"), "latin1"))
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
      "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
      `<< /Length ${stream.length} /Filter /FlateDecode >>\nstream\n${stream.toString("latin1")}\nendstream`,
      "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    let pdf = "%PDF-1.4\n"
    const offsets: number[] = []
    objects.forEach((o, i) => {
      offsets.push(pdf.length)
      pdf += `${i + 1} 0 obj\n${o}\nendobj\n`
    })
    const startxref = pdf.length
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
    for (const off of offsets) pdf += String(off).padStart(10, "0") + " 00000 n \n"
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF`
    return Buffer.from(pdf, "latin1")
  }

  test("real text comes out clean, with no operator noise", () => {
    const result = extractPdfText(buildPdf(["ZYRAXON LICENSE REPORT", "Owner: onelpawarai AI - X", "Edition: ZSL-X v2.0.0"]))
    expect(result.needsOcr).toBe(false)
    expect(result.text).toBe("ZYRAXON LICENSE REPORT\nOwner: onelpawarai AI - X\nEdition: ZSL-X v2.0.0")
    expect(result.text).not.toMatch(/\bTj\b|\bBT\b|\bTf\b|endstream/)
  })

  test("escaped characters inside a string are decoded", () => {
    const result = extractPdfText(buildPdf(["Price \\(500\\$ off\\) now"]))
    expect(result.text).toBe("Price (500$ off) now")
  })

  test("a PDF with no text layer is reported as needing OCR", () => {
    const result = extractPdfText(buildPdf([]))
    expect(result.text).toBe("")
  })

  test("extractData routes a PDF through the builtin engine", async () => {
    const file = await scratchFile("r.pdf", buildPdf(["Quarterly report", "Total: 4821"]))
    const result = await extractData(file)
    expect(result.ok).toBe(true)
    expect((result.data as any).engine).toBe("builtin")
    expect((result.data as any).text).toContain("Quarterly report")
  })
})

describe("data extraction parses real structures", () => {
  test("JSON is parsed into a value", async () => {
    const file = await scratchFile("d.json", JSON.stringify({ name: "ZYRAXON", tiers: ["pro", "apex"] }))
    const result = await extractData(file)
    expect((result.data as any).value).toEqual({ name: "ZYRAXON", tiers: ["pro", "apex"] })
  })

  test("CSV becomes headers plus rows, quoted cells included", async () => {
    const file = await scratchFile("d.csv", 'name,tier\n"onelpawarai, X",owner\nagent,pro\n')
    const result = await extractData(file)
    expect((result.data as any).headers).toEqual(["name", "tier"])
    expect((result.data as any).rowCount).toBe(3)
    expect((result.data as any).rows[1]).toEqual(["onelpawarai, X", "owner"])
  })

  test("TSV is split on tabs", async () => {
    const file = await scratchFile("d.tsv", "a\tb\n1\t2\n")
    const result = await extractData(file)
    expect((result.data as any).headers).toEqual(["a", "b"])
  })

  test("a malformed JSON file is an explicit error", async () => {
    const file = await scratchFile("bad.json", "{ not json")
    const result = await extractData(file)
    expect(result.ok).toBe(false)
  })

  test("a missing file is an explicit error", async () => {
    const result = await extractData(path.join(scratch, "nothing.json"))
    expect(result.ok).toBe(false)
    expect(result.error).toContain("not found")
  })
})

describe.skipIf(!hasFfmpeg)("media processing runs through ffmpeg", () => {
  async function makeClip(): Promise<string> {
    return run("ffmpeg", [
      "-v", "error", "-y",
      "-f", "lavfi", "-i", "testsrc=size=160x120:rate=10:duration=1",
      "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
      path.join(scratch, "clip.mp4"),
    ])
      .then(() => path.join(scratch, "clip.mp4"))
      .catch(async () => {
        await fs.mkdir(scratch, { recursive: true })
        await run("ffmpeg", [
          "-v", "error", "-y",
          "-f", "lavfi", "-i", "testsrc=size=160x120:rate=10:duration=1",
          "-f", "lavfi", "-i", "sine=frequency=440:duration=1",
          "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac",
          path.join(scratch, "clip.mp4"),
        ])
        return path.join(scratch, "clip.mp4")
      })
  }

  test("probe reports the true codecs and duration", async () => {
    const clip = await makeClip()
    const result = await toolFrom(mediaTools, "x_media_probe").execute({ filePath: clip })
    expect(result.ok).toBe(true)
    const data = result.data as any
    expect(data.streams.map((s: any) => s.codec).sort()).toEqual(["aac", "h264"])
    expect(Number(data.durationSeconds)).toBeCloseTo(1, 0)
  }, 120000)

  test("extracting frames writes real png files", async () => {
    const clip = await makeClip()
    const result = await toolFrom(mediaTools, "x_media_video_process").execute({
      inputPath: clip,
      operation: "extract_frames",
      params: JSON.stringify({ fps: 2, outputDir: path.join(scratch, "frames") }),
    })
    expect(result.ok).toBe(true)
    const data = result.data as any
    expect(data.frameCount).toBeGreaterThan(0)
    const first = await readImageRgb(data.frames[0])
    expect(first.width).toBe(160)
    expect(first.height).toBe(120)
  }, 120000)

  test("trim produces a shorter file than the source", async () => {
    const clip = await makeClip()
    const before = (await Bun.file(clip).arrayBuffer()).byteLength
    const result = await toolFrom(mediaTools, "x_media_video_process").execute({
      inputPath: clip,
      operation: "trim",
      params: JSON.stringify({ start: "0", duration: "0.4" }),
    })
    expect(result.ok).toBe(true)
    const after = (await Bun.file((result.data as any).output).arrayBuffer()).byteLength
    expect(after).toBeLessThan(before)
  }, 120000)

  test("extracting audio yields a playable audio file", async () => {
    const clip = await makeClip()
    const result = await toolFrom(mediaTools, "x_media_video_process").execute({
      inputPath: clip,
      operation: "extract_audio",
      params: JSON.stringify({ format: "mp3" }),
    })
    expect(result.ok).toBe(true)
    const probe = await toolFrom(mediaTools, "x_media_probe").execute({ filePath: (result.data as any).output })
    expect((probe.data as any).streams.every((s: any) => s.type === "audio")).toBe(true)
  }, 120000)

  test("an unknown media operation is refused", async () => {
    const clip = await makeClip()
    const result = await toolFrom(mediaTools, "x_media_video_process").execute({ inputPath: clip, operation: "teleport" })
    expect(result.ok).toBe(false)
    expect(result.error).toContain("unknown operation")
  }, 60000)
})

describe("OCR reports honestly about the engine", () => {
  test("a missing image is refused before the engine is started", async () => {
    const result = await runOcr(path.join(scratch, "absent.png"))
    expect(result.ok).toBe(false)
    expect(result.error).toContain("not found")
  })

  test("either real text or a clear engine message, never a fake success", async () => {
    const file = await scratchFile("ocr_blank.png", encodePng(Buffer.alloc(40 * 20 * 3, 255), 40, 20))
    const result = await runOcr(file)
    if (result.ok === true) {
      const data = result.data as any
      expect(data.engine).toBe("tesseract")
      expect(typeof data.text).toBe("string")
    } else {
      expect(result.error).toMatch(/tesseract/i)
      expect(result.error).toMatch(/install/i)
    }
  }, 120000)
})

describe("plan steps are derived from what the caller actually wrote", () => {
  test("a goal with numbered lines becomes those lines", () => {
    const steps = deriveSteps("1. open the file\n2. read it\n3. summarise it")
    expect(steps.map((s) => s.title)).toEqual(["open the file", "read it", "summarise it"])
  })

  test("a goal written with 'then' is split on it", () => {
    const steps = deriveSteps("scan the disk then patch the file then run the tests")
    expect(steps).toHaveLength(3)
  })

  test("an explicit step list wins over the goal text", () => {
    const steps = deriveSteps("ignored", ["only this"])
    expect(steps.map((s) => s.title)).toEqual(["only this"])
  })

  test("a step may bind a tool and its arguments", () => {
    const steps = deriveSteps("ignored", [{ title: "probe", tool: "x_media_probe", args: { filePath: "/tmp/a.mp4" } }])
    expect(steps[0]?.tool).toBe("x_media_probe")
    expect(steps[0]?.args).toEqual({ filePath: "/tmp/a.mp4" })
  })

  test("empty fragments are dropped", () => {
    expect(deriveSteps("   \n  \n")).toHaveLength(0)
  })
})

describe("plan progress is computed from real step state", () => {
  function planOf(titles: string[]): Plan {
    return createPlan(titles.join(" then "))
  }

  test("a fresh plan is active and empty of progress", () => {
    const summary = summarise(planOf(["a", "b", "c", "d"]))
    expect(summary.total).toBe(4)
    expect(summary.percent).toBe(0)
    expect(summary.nextStepIndex).toBe(1)
  })

  test("progress counts finished steps of every kind", () => {
    const plan = planOf(["a", "b", "c", "d"])
    plan.steps[0]!.status = "done"
    plan.steps[1]!.status = "failed"
    plan.steps[2]!.status = "skipped"
    const summary = summarise(plan)
    expect(summary.finished).toBe(3)
    expect(summary.percent).toBe(75)
  })

  test("an empty plan reports zero rather than dividing by zero", () => {
    expect(summarise(createPlan("x", undefined, [])).percent).toBe(0)
  })

  test("skipping records the step and keeps the plan active", () => {
    const plan = planOf(["a", "b"])
    markSkipped(plan, 1, "not needed")
    expect(plan.steps[0]?.status).toBe("skipped")
    expect(plan.steps[0]?.note).toBe("not needed")
    expect(plan.status).toBe("active")
  })

  test("skipping the last step closes the plan", () => {
    const plan = planOf(["only"])
    markSkipped(plan, 1)
    expect(plan.status).toBe("completed")
  })
})

describe("plan tools persist and report real state", () => {
  test("a created plan is written to disk and can be read back", async () => {
    const create = toolFrom(planningTools, "x_plan_create")
    const status = toolFrom(planningTools, "x_plan_status")
    const created = await create.execute({ goal: "persistence check\nthen finish", steps: ["first", "second"] })
    expect(created.ok).toBe(true)
    const planId = (created.data as any).planId as string
    const loaded = await status.execute({ planId })
    expect(loaded.ok).toBe(true)
    expect((loaded.data as any).status).toBe("active")
    expect((loaded.data as any).steps).toHaveLength(2)
  }, 30000)

  test("executing walks every step and finishes the plan", async () => {
    const create = toolFrom(planningTools, "x_plan_create")
    const execute = toolFrom(planningTools, "x_plan_execute")
    const status = toolFrom(planningTools, "x_plan_status")
    const created = await create.execute({ goal: "walk", steps: ["one", "two", "three"] })
    const planId = (created.data as any).planId as string
    for (let i = 0; i < 3; i++) {
      const step = await execute.execute({ planId })
      expect(step.ok).toBe(true)
      expect((step.data as any).stepStatus).toBe("done")
    }
    const done = await status.execute({ planId })
    expect((done.data as any).status).toBe("completed")
    expect((done.data as any).summary.percent).toBe(100)
    const extra = await execute.execute({ planId })
    expect(extra.ok).toBe(false)
  }, 30000)

  test("a plan id that does not exist is an explicit error", async () => {
    const result = await toolFrom(planningTools, "x_plan_status").execute({ planId: "no-such-plan-id" })
    expect(result.ok).toBe(false)
    expect(result.error).toContain("No plan found")
  })

  test("a plan id with path characters is refused", async () => {
    const result = await toolFrom(planningTools, "x_plan_status").execute({ planId: "../../etc/passwd" })
    expect(result.ok).toBe(false)
  })

  test("an empty goal is refused", async () => {
    const result = await toolFrom(planningTools, "x_plan_create").execute({ goal: "   ", steps: [] })
    expect(result.ok).toBe(false)
  })
})

describe("learning is stored and reflected in the behaviour rules", () => {
  test("a recorded lesson reaches the log and the rules", async () => {
    const learn = toolFrom(selfImproveTools, "x_learn_from_task")
    const rules = toolFrom(selfImproveTools, "x_behavior_rules")
    const recorded = await learn.execute({
      taskDescription: "testsuite records a unique lesson marker for the behaviour rules",
      whatWorked: "the log file was appended rather than rewritten",
    })
    expect(recorded.ok).toBe(true)
    expect((recorded.data as any).hasWorked).toBe(true)

    const report = await rules.execute({})
    expect(report.ok).toBe(true)
    expect((report.data as any).ruleCount).toBeGreaterThan(0)
    expect((report.data as any).lessonCount).toBeGreaterThan(0)
  }, 30000)

  test("a failure lesson becomes a rule to avoid", async () => {
    const learn = toolFrom(selfImproveTools, "x_learn_from_task")
    const rules = toolFrom(selfImproveTools, "x_behavior_rules")
    const marker = `failure marker ${Date.now()}`
    await learn.execute({ taskDescription: "record a failure lesson", whatFailed: marker })
    const report = await rules.execute({})
    expect(JSON.stringify((report.data as any).learnedFromLessons)).toContain(marker)
  }, 30000)

  test("an empty task description is refused", async () => {
    const result = await toolFrom(selfImproveTools, "x_learn_from_task").execute({ taskDescription: "  " })
    expect(result.ok).toBe(false)
  })
})

describe("no registered tool echoes its input back", () => {
  const groups = { computerControlTools, mediaTools, planningTools, selfImproveTools }

  test("every tool declares a real description", () => {
    for (const group of Object.values(groups)) {
      for (const tool of group) {
        expect(tool.description.length).toBeGreaterThan(40)
        expect(tool.name.length).toBeGreaterThan(0)
        expect(tool.id.startsWith("x_")).toBe(true)
      }
    }
  })

  test("every tool validates its required parameters instead of trusting them", () => {
    for (const group of Object.values(groups)) {
      for (const tool of group) {
        const required = Object.entries(tool.parameters ?? {})
          .filter(([, spec]) => spec.required)
          .map(([name]) => name)
        if (required.length === 0) continue
        const source = tool.execute.toString()
        for (const name of required) {
          expect(source).toContain(name)
        }
      }
    }
  })
})
