import { isBuildOutput } from "./sync-paths"

/**
 * Shared plan builder for the full sync.
 *
 * The plan is derived from three questions about the working tree:
 *
 *   exists here  - which paths of the base are still present on disk
 *   allowed here - which of those survive the ignore rules
 *   new here     - which untracked paths survive the ignore rules
 *
 * `git ls-files -c` is deliberately not used on its own. It reports indexed
 * paths whether or not they exist on disk, so a build output file that was
 * deleted locally would still look wanted and could never be removed from the
 * remote.
 */

export type Change = { path: string; kind: "add" | "remove"; system: string }

export async function gitAsync(args: string[], allowFail = false): Promise<string> {
  const proc = Bun.spawn(["git", ...args], { stdout: "pipe", stderr: "pipe" })
  const [text, err] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ])
  if ((await proc.exited) !== 0 && !allowFail) throw new Error(`git ${args.join(" ")}\n${err.trim()}`)
  return text.trim()
}

const split = (text: string) => text.split("\0").filter(Boolean)

/**
 * Long path lists go through stdin rather than the command line. The vendored
 * resource trees contain paths long enough that a 32k command line overflows on
 * Windows, and libuv surfaces that as a spawn failure.
 */
export async function gitPathspec(args: string[], paths: string[]) {
  if (!paths.length) return
  const proc = Bun.spawn(["git", ...args, "--pathspec-from-file=-", "--pathspec-file-nul"], {
    stdin: new TextEncoder().encode(paths.join("\0") + "\0"),
    stdout: "pipe",
    stderr: "pipe",
  })
  const err = await new Response(proc.stderr).text()
  if ((await proc.exited) !== 0) throw new Error(`git ${args.join(" ")}\n${err.trim()}`)
}

/** Short, readable system name for a repository path. */
export function systemOf(path: string): string {
  const parts = path.split("/")
  if (parts[0] === "packages" && parts[1]) {
    const area = parts
      .slice(2)
      .find((part) => part && !["src", "test", "script", "resources"].includes(part))
    return `packages/${parts[1]}${area ? `/${area}` : ""}`
  }
  return parts.slice(0, 2).join("/") || path
}

export function scopeOf(systems: string[]) {
  const unique = [...new Set(systems)]
  if (unique.length === 1) return unique[0].split("/").pop() ?? "repo"
  if (unique.every((system) => system.startsWith("packages/"))) return "zyraxon"
  return "repo"
}

/** Of the given paths, the ones the ignore rules currently reject. */
async function checkIgnored(paths: string[]): Promise<Set<string>> {
  const ignored = new Set<string>()
  for (let i = 0; i < paths.length; i += 2000) {
    const batch = paths.slice(i, i + 2000)
    const proc = Bun.spawn(["git", "check-ignore", "--stdin", "-z"], {
      stdin: new TextEncoder().encode(batch.join("\0") + "\0"),
      stdout: "pipe",
      stderr: "pipe",
    })
    const out = await new Response(proc.stdout).text()
    await new Response(proc.stderr).text()
    await proc.exited
    for (const path of split(out)) ignored.add(path)
  }
  return ignored
}

export async function buildPlan(base: string): Promise<{ wanted: Set<string>; changes: Change[] }> {
  // The index is transient while a sync runs, so anchor it to the base. That
  // keeps the plan a function of the working tree alone and makes re-runs
  // idempotent. The working tree itself is never touched.
  await gitAsync(["read-tree", base])

  const basePaths = split(await gitAsync(["ls-tree", "-r", "--name-only", "-z", base], true))

  // Paths of the base that no longer exist on disk.
  const goneLocal = new Set<string>()
  let status = ""
  for (const entry of split(await gitAsync(["diff", "--name-status", "-z", base], true))) {
    if (/^[A-Z]\d*$/.test(entry)) {
      status = entry[0]
      continue
    }
    if (status === "D") goneLocal.add(entry)
  }

  // Ignore rules only apply to untracked paths, so a base file that has since
  // become ignored is asked about explicitly.
  const present = basePaths.filter((path) => !goneLocal.has(path))
  const ignored = await checkIgnored(present)

  const allowedBase = present.filter((path) => !ignored.has(path) && !isBuildOutput(path))
  const untracked = split(await gitAsync(["ls-files", "-o", "--exclude-standard", "-z"], true)).filter(
    (path) => !isBuildOutput(path),
  )

  const wanted = new Set([...allowedBase, ...untracked])
  const wantedSet = new Set(wanted)
  const remoteSet = new Set(basePaths)

  const changes: Change[] = []
  for (const path of wanted) {
    if (!remoteSet.has(path)) changes.push({ path, kind: "add", system: systemOf(path) })
  }
  for (const path of remoteSet) {
    if (!wantedSet.has(path)) changes.push({ path, kind: "remove", system: systemOf(path) })
  }
  changes.sort((a, b) => a.system.localeCompare(b.system) || a.path.localeCompare(b.path))
  return { wanted, changes }
}
