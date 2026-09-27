import { base64Encode } from "@zyraxon-ai/core/util/encode"

export function acceptKey(sessionID: string, directory?: string) {
  if (!directory) return sessionID
  return `${base64Encode(directory)}/${sessionID}`
}

export function directoryAcceptKey(directory: string) {
  return `${base64Encode(directory)}/*`
}

// Key used when no session or directory is known — applies app-wide so a mode can be
// chosen from Settings without opening a session first.
export const globalAcceptKey = "*"

function accepted(autoAccept: Record<string, string>, sessionID: string, directory?: string): string | undefined {
  const key = acceptKey(sessionID, directory)
  const direct = autoAccept[key] ?? autoAccept[sessionID]
  if (direct !== undefined) return direct
  if (directory) {
    const mode = autoAccept[directoryAcceptKey(directory)]
    if (mode !== undefined) return mode
  }
  return autoAccept[globalAcceptKey]
}

export function directoryPermissionMode(autoAccept: Record<string, string>, directory: string): string | undefined {
  return autoAccept[directoryAcceptKey(directory)] ?? autoAccept[globalAcceptKey]
}

export function globalPermissionMode(autoAccept: Record<string, string>): string | undefined {
  return autoAccept[globalAcceptKey]
}

export function isDirectoryAutoAccepting(autoAccept: Record<string, string>, directory: string) {
  const key = directoryAcceptKey(directory)
  return autoAccept[key] === "always"
}

function sessionLineage(session: { id: string; parentID?: string }[], sessionID: string) {
  const parent = session.reduce((acc, item) => {
    if (item.parentID) acc.set(item.id, item.parentID)
    return acc
  }, new Map<string, string>())
  const seen = new Set([sessionID])
  const ids = [sessionID]

  for (const id of ids) {
    const parentID = parent.get(id)
    if (!parentID || seen.has(parentID)) continue
    seen.add(parentID)
    ids.push(parentID)
  }

  return ids
}

export function isSessionAutoAccepting(
  autoAccept: Record<string, string>,
  session: { id: string; parentID?: string }[],
  permission: { sessionID: string },
  directory?: string,
) {
  return sessionAutoAccept(autoAccept, session, permission, directory) === "always"
}

export function permissionAutoResponse(
  autoAccept: Record<string, string>,
  session: { id: string; parentID?: string }[],
  permission: { sessionID: string },
  directory?: string,
): "once" | "reject" | undefined {
  const value = sessionAutoAccept(autoAccept, session, permission, directory)
  if (value === "always") return "once"
  if (value === "deny") return "reject"
  return undefined
}

export function sessionAutoAccept(
  autoAccept: Record<string, string>,
  session: { id: string; parentID?: string }[],
  permission: { sessionID: string },
  directory?: string,
): string | undefined {
  return sessionLineage(session, permission.sessionID)
    .map((id) => accepted(autoAccept, id, directory))
    .find((item): item is string => item !== undefined)
}
