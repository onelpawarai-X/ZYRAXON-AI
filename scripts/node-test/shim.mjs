// Copyright (c) 2026 onelpawarai. All rights reserved.

import { test as ntest, describe as ndescribe, it as nit, before as nbefore, after as nafter } from "node:test"
export { ntest as test, ndescribe as describe, nit as it }

// `bun:test` names the file-level hooks `beforeAll`/`afterAll`; node:test names
// them `before`/`after`. Both run once around the tests in the file, so the alias
// is what a suite written against `bun:test` needs to run unchanged under Node.
export { nbefore as beforeAll, nafter as afterAll }

function fmt(v) {
  try { return typeof v === "string" ? JSON.stringify(v) : JSON.stringify(v) } catch { return String(v) }
}
function eq(a, b) {
  if (a === b) return true
  if (typeof a === "number" && typeof b === "number" && Number.isNaN(a) && Number.isNaN(b)) return true
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object") return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const ka = Object.keys(a), kb = Object.keys(b)
  if (ka.length !== kb.length) return false
  return ka.every((k) => eq(a[k], b[k]))
}
function makeMatchers(actual, negated) {
  const fail = (msg) => { throw new Error(negated ? `expected not: ${msg}` : msg) }
  return {
    toBe(want) { if (negated ? Object.is(actual, want) : !Object.is(actual, want)) fail(`expected ${fmt(want)} but received ${fmt(actual)}`) },
    toEqual(want) { if (negated ? eq(actual, want) : !eq(actual, want)) fail(`expected deep equal ${fmt(want)} but received ${fmt(actual)}`) },
    toContain(part) {
      const has = typeof actual === "string" ? actual.includes(part) : Array.isArray(actual) && actual.includes(part)
      if (negated ? has : !has) fail(`expected ${fmt(actual)} to contain ${fmt(part)}`)
    },
    toThrow(matcher) {
      if (typeof actual !== "function") fail("toThrow expects a function")
      let threw = false, err
      try { actual() } catch (e) { threw = true; err = e }
      if (negated) { if (threw) fail("expected function not to throw"); return }
      if (!threw) fail("expected function to throw")
      if (matcher instanceof RegExp && !matcher.test(String(err && err.message))) fail(`expected error ${fmt(String(err && err.message))} to match ${matcher}`)
    },
    toBeDefined() { if (negated ? actual !== undefined : actual === undefined) fail("expected value to be defined") },
    toBeUndefined() { if (negated ? actual === undefined : actual !== undefined) fail(`expected undefined but received ${fmt(actual)}`) },
    toBeNull() { if (negated ? actual === null : actual !== null) fail(`expected null but received ${fmt(actual)}`) },
    toBeTruthy() { if (negated ? !!actual : !actual) fail(`expected truthy but received ${fmt(actual)}`) },
    toBeFalsy() { if (negated ? !actual : !!actual) fail(`expected falsy but received ${fmt(actual)}`) },
    toHaveLength(n) { if (negated ? actual && actual.length === n : !actual || actual.length !== n) fail(`expected length ${n} but received ${actual && actual.length}`) },
    toBeGreaterThan(n) { if (negated ? actual > n : !(actual > n)) fail(`expected > ${n} but received ${fmt(actual)}`) },
    toBeLessThan(n) { if (negated ? actual < n : !(actual < n)) fail(`expected < ${n} but received ${fmt(actual)}`) },
    toMatchObject(want) {
      const part = (a, b) => {
        if (b === null || typeof b !== "object") return Object.is(a, b)
        if (a === null || typeof a !== "object") return false
        return Object.entries(b).every(([k, v]) => part(a[k], v))
      }
      if (negated ? part(actual, want) : !part(actual, want)) fail(`expected ${fmt(actual)} to match object ${fmt(want)}`)
    },
    not: undefined,
  }
}

function asyncMatchers(promise, negated) {
  const settle = () => promise.then((value) => ({ ok: true, value }), (error) => ({ ok: false, error }))
  return {
    toThrow(matcher) {
      return settle().then((r) => {
        if (negated) {
          if (!r.ok) return
          throw new Error("expected promise not to reject")
        }
        if (r.ok) throw new Error("expected promise to reject")
        if (matcher instanceof RegExp && !matcher.test(String(r.error && r.error.message))) {
          throw new Error(`expected rejection ${fmt(String(r.error && r.error.message))} to match ${matcher}`)
        }
      })
    },
    toBe(want) {
      return settle().then((r) => {
        if (negated ? r.ok && Object.is(r.value, want) : !r.ok || !Object.is(r.value, want)) {
          throw new Error(`expected resolved ${fmt(r.value)} to be ${fmt(want)}`)
        }
      })
    },
    toBeUndefined() {
      return settle().then((r) => {
        if (!r.ok) throw new Error(`expected promise to resolve, rejected with ${fmt(String(r.error && r.error.message))}`)
        if (negated ? r.value === undefined : r.value !== undefined) throw new Error(`expected undefined but resolved ${fmt(r.value)}`)
      })
    },
    toEqual(want) {
      return settle().then((r) => {
        if (negated ? eq(r.value, want) : !eq(r.value, want)) throw new Error(`expected resolved ${fmt(r.value)} to equal ${fmt(want)}`)
      })
    },
  }
}

export function expect(actual) {
  if (actual && typeof actual.then === "function") {
    const matchers = asyncMatchers(actual, false)
    const negated = asyncMatchers(actual, true)
    return new Proxy(matchers, {
      get(target, prop) {
        if (prop === "rejects") return negated
        if (prop === "resolves") return matchers
        return target[prop]
      },
    })
  }
  return {
    toBe(want) {
      if (!Object.is(actual, want)) throw new Error(`expected ${fmt(want)} but received ${fmt(actual)}`)
    },
    toEqual(want) {
      if (!eq(actual, want)) throw new Error(`expected deep equal ${fmt(want)} but received ${fmt(actual)}`)
    },
    toBeDefined() { if (actual === undefined) throw new Error("expected value to be defined") },
    toBeUndefined() { if (actual !== undefined) throw new Error(`expected undefined but received ${fmt(actual)}`) },
    toBeNull() { if (actual !== null) throw new Error(`expected null but received ${fmt(actual)}`) },
    toContain(part) {
      const ok = typeof actual === "string" ? actual.includes(part) : Array.isArray(actual) && actual.includes(part)
      if (!ok) throw new Error(`expected ${fmt(actual)} to contain ${fmt(part)}`)
    },
    toHaveLength(n) { if (!actual || actual.length !== n) throw new Error(`expected length ${n} but received ${actual?.length}`) },
    toMatchObject(want) {
      const part = (a, b) => {
        if (b === null || typeof b !== "object") return Object.is(a, b)
        if (a === null || typeof a !== "object") return false
        return Object.entries(b).every(([k, v]) => part(a[k], v))
      }
      if (!part(actual, want)) throw new Error(`expected ${fmt(actual)} to match object ${fmt(want)}`)
    },
    toBeTruthy() { if (!actual) throw new Error(`expected truthy but received ${fmt(actual)}`) },
    toBeFalsy() { if (actual) throw new Error(`expected falsy but received ${fmt(actual)}`) },
    toBeGreaterThan(n) { if (!(actual > n)) throw new Error(`expected > ${n} but received ${fmt(actual)}`) },
    toBeLessThan(n) { if (!(actual < n)) throw new Error(`expected < ${n} but received ${fmt(actual)}`) },
    toThrow() {
      if (typeof actual !== "function") throw new Error("toThrow expects a function")
      let threw = false
      try { actual() } catch { threw = true }
      if (!threw) throw new Error("expected function to throw")
    },
    not: {
      toBe(want) { if (Object.is(actual, want)) throw new Error(`expected not ${fmt(want)}`) },
      toEqual(want) { if (eq(actual, want)) throw new Error(`expected not deep equal ${fmt(want)}`) },
      toContain(part) {
        const has = typeof actual === "string" ? actual.includes(part) : Array.isArray(actual) && actual.includes(part)
        if (has) throw new Error(`expected not to contain ${fmt(part)}`)
      },
    },
  }
}
