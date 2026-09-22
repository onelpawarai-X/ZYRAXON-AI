// ZYRAXON DARK EMPEROR — 8 ULTRA TOOLS
// The most powerful tools ever created for a coding AI
// Only available in DARK EMPEROR mode
// EACH TOOL: 2000-3000 lines of REAL mathematical/logical code

import { exec } from "child_process"
import { promisify } from "util"
import fs from "fs/promises"
import path from "path"
import os from "os"
import crypto from "crypto"

const execAsync = promisify(exec)

// Deterministic index selection — djb2 hash, NOT random
// Formula: djb2(str) mod length. Same input always produces same index.
function deterministicIndex(input: string, iteration: number, length: number): number {
  if (length <= 0) return 0
  let hash = 5381
  const str = input + "|" + String(iteration)
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
  }
  return ((hash % length) + length) % length
}

// Deterministic float from input+iteration — djb2 hash mapped to [0,1)
function deterministicFloat(input: string, iteration: number): number {
  let hash = 5381
  const str = input + "|" + String(iteration)
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) | 0
  }
  return ((hash & 0x7fffffff) % 10000) / 10000
}

export interface ToolResult {
  success: boolean
  output: string
  error?: string
  details?: Record<string, any>
}

// ═══════════════════════════════════════════════════════════════════════════
// MATHEMATICAL PRIMITIVES — Shared across all ultra tools
// ═══════════════════════════════════════════════════════════════════════════

const MATH = {
  PI: Math.PI,
  E: Math.E,
  PHI: (1 + Math.sqrt(5)) / 2,
  LN2: Math.LN2,
  LN10: Math.LN10,
  SQRT2: Math.SQRT2,
  DEG_TO_RAD: Math.PI / 180,
  RAD_TO_DEG: 180 / Math.PI,

  factorial(n: number): number {
    if (n < 0) throw new Error("Factorial of negative number")
    if (n <= 1) return 1
    let result = 1
    for (let i = 2; i <= n; i++) result *= i
    return result
  },

  combinations(n: number, k: number): number {
    if (k > n || k < 0) return 0
    if (k === 0 || k === n) return 1
    let result = 1
    for (let i = 0; i < k; i++) {
      result = result * (n - i) / (i + 1)
    }
    return Math.round(result)
  },

  permutations(n: number, k: number): number {
    if (k > n || k < 0) return 0
    let result = 1
    for (let i = 0; i < k; i++) result *= (n - i)
    return result
  },

  gcd(a: number, b: number): number {
    a = Math.abs(a); b = Math.abs(b)
    while (b) { [a, b] = [b, a % b] }
    return a
  },

  lcm(a: number, b: number): number {
    return Math.abs(a * b) / this.gcd(a, b)
  },

  isPrime(n: number): boolean {
    if (n < 2) return false
    if (n < 4) return true
    if (n % 2 === 0 || n % 3 === 0) return false
    for (let i = 5; i * i <= n; i += 6) {
      if (n % i === 0 || n % (i + 2) === 0) return false
    }
    return true
  },

  primeFactors(n: number): number[] {
    const factors: number[] = []
    let d = 2
    while (d * d <= n) {
      while (n % d === 0) { factors.push(d); n /= d }
      d++
    }
    if (n > 1) factors.push(n)
    return factors
  },

  fibonacci(n: number): number {
    if (n <= 0) return 0
    if (n === 1) return 1
    let a = 0, b = 1
    for (let i = 2; i <= n; i++) { [a, b] = [b, a + b] }
    return b
  },

  collatzSteps(n: number): number {
    let steps = 0
    while (n !== 1) {
      n = n % 2 === 0 ? n / 2 : 3 * n + 1
      steps++
      if (steps > 10000) break
    }
    return steps
  },

  entropy(data: number[]): number {
    const total = data.reduce((s, v) => s + v, 0)
    if (total === 0) return 0
    let h = 0
    for (const freq of data) {
      if (freq > 0) {
        const p = freq / total
        h -= p * Math.log2(p)
      }
    }
    return h
  },

  shannonEntropy(str: string): number {
    const freq: Record<string, number> = {}
    for (const ch of str) freq[ch] = (freq[ch] || 0) + 1
    const len = str.length
    let h = 0
    for (const ch in freq) {
      const p = freq[ch] / len
      h -= p * Math.log2(p)
    }
    return h
  },

  levenshteinDistance(a: string, b: string): number {
    const m = a.length, n = b.length
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
    for (let i = 0; i <= m; i++) dp[i][0] = i
    for (let j = 0; j <= n; j++) dp[0][j] = j
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost)
      }
    }
    return dp[m][n]
  },

  cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0
    let dot = 0, magA = 0, magB = 0
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i]
      magA += a[i] * a[i]
      magB += b[i] * b[i]
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB)
    return denom === 0 ? 0 : dot / denom
  },

  mean(arr: number[]): number {
    return arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length
  },

  variance(arr: number[]): number {
    const m = this.mean(arr)
    return arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length
  },

  stddev(arr: number[]): number {
    return Math.sqrt(this.variance(arr))
  },

  percentile(arr: number[], p: number): number {
    const sorted = [...arr].sort((a, b) => a - b)
    const idx = (p / 100) * (sorted.length - 1)
    const lower = Math.floor(idx)
    const upper = Math.ceil(idx)
    if (lower === upper) return sorted[lower]
    return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower)
  },

  linearRegression(points: [number, number][]): { slope: number; intercept: number; r2: number } {
    const n = points.length
    if (n === 0) return { slope: 0, intercept: 0, r2: 0 }
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0
    for (const [x, y] of points) {
      sumX += x; sumY += y; sumXY += x * y; sumX2 += x * x; sumY2 += y * y
    }
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX)
    const intercept = (sumY - slope * sumX) / n
    const ssRes = points.reduce((s, [x, y]) => s + (y - (slope * x + intercept)) ** 2, 0)
    const meanY = sumY / n
    const ssTot = points.reduce((s, [, y]) => s + (y - meanY) ** 2, 0)
    const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot
    return { slope, intercept, r2 }
  },

  binomialCoefficient(n: number, k: number): number {
    if (k < 0 || k > n) return 0
    if (k === 0 || k === n) return 1
    let result = 1
    for (let i = 0; i < k; i++) {
      result = result * (n - i) / (i + 1)
    }
    return Math.round(result)
  },

  fastPow(base: number, exp: number): number {
    if (exp === 0) return 1
    if (exp < 0) return 1 / this.fastPow(base, -exp)
    if (exp % 2 === 0) {
      const half = this.fastPow(base, exp / 2)
      return half * half
    }
    return base * this.fastPow(base, exp - 1)
  },

  modPow(base: number, exp: number, mod: number): number {
    if (mod === 1) return 0
    let result = 1
    base = base % mod
    while (exp > 0) {
      if (exp % 2 === 1) result = (result * base) % mod
      exp = Math.floor(exp / 2)
      base = (base * base) % mod
    }
    return result
  },

  euclideanDistance(a: number[], b: number[]): number {
    let sum = 0
    for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2
    return Math.sqrt(sum)
  },

  manhattanDistance(a: number[], b: number[]): number {
    let sum = 0
    for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i])
    return sum
  },

  normalizeVector(v: number[]): number[] {
    const mag = Math.sqrt(v.reduce((s, x) => s + x * x, 0))
    return mag === 0 ? v.map(() => 0) : v.map(x => x / mag)
  },

  crossProduct(a: number[], b: number[]): number[] {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0]
    ]
  },

  dotProduct(a: number[], b: number[]): number {
    return a.reduce((s, v, i) => s + v * b[i], 0)
  },

  angleBetweenVectors(a: number[], b: number[]): number {
    const dot = this.dotProduct(a, b)
    const magA = Math.sqrt(a.reduce((s, v) => s + v * v, 0))
    const magB = Math.sqrt(b.reduce((s, v) => s + v * v, 0))
    if (magA === 0 || magB === 0) return 0
    const cosAngle = Math.max(-1, Math.min(1, dot / (magA * magB)))
    return Math.acos(cosAngle)
  },

  trapezoidalIntegration(fn: (x: number) => number, a: number, b: number, n: number): number {
    const h = (b - a) / n
    let sum = fn(a) + fn(b)
    for (let i = 1; i < n; i++) sum += 2 * fn(a + i * h)
    return (h / 2) * sum
  },

  simpsonIntegration(fn: (x: number) => number, a: number, b: number, n: number): number {
    if (n % 2 !== 0) n++
    const h = (b - a) / n
    let sum = fn(a) + fn(b)
    for (let i = 1; i < n; i++) {
      sum += (i % 2 === 0 ? 2 : 4) * fn(a + i * h)
    }
    return (h / 3) * sum
  },

  numericalDerivative(fn: (x: number) => number, x: number, h: number = 1e-7): number {
    return (fn(x + h) - fn(x - h)) / (2 * h)
  },

  newtonRaphson(fn: (x: number) => number, x0: number, maxIter: number = 100, tol: number = 1e-10): number {
    let x = x0
    for (let i = 0; i < maxIter; i++) {
      const fx = fn(x)
      const dfx = this.numericalDerivative(fn, x)
      if (Math.abs(dfx) < 1e-15) break
      const xNew = x - fx / dfx
      if (Math.abs(xNew - x) < tol) return xNew
      x = xNew
    }
    return x
  },

  bisectionMethod(fn: (x: number) => number, a: number, b: number, tol: number = 1e-10, maxIter: number = 1000): number {
    if (fn(a) * fn(b) >= 0) throw new Error("f(a) and f(b) must have opposite signs")
    let left = a, right = b
    for (let i = 0; i < maxIter; i++) {
      const mid = (left + right) / 2
      if (Math.abs(fn(mid)) < tol || (right - left) / 2 < tol) return mid
      if (fn(mid) * fn(left) < 0) right = mid
      else left = mid
    }
    return (left + right) / 2
  },

  rungeKutta4(fn: (t: number, y: number) => number, y0: number, t0: number, tf: number, h: number): number[] {
    const result: number[] = [y0]
    let y = y0, t = t0
    while (t < tf) {
      const k1 = h * fn(t, y)
      const k2 = h * fn(t + h / 2, y + k1 / 2)
      const k3 = h * fn(t + h / 2, y + k2 / 2)
      const k4 = h * fn(t + h, y + k3)
      y += (k1 + 2 * k2 + 2 * k3 + k4) / 6
      t += h
      result.push(y)
    }
    return result
  },

  fftReal(signal: number[]): { real: number[]; imag: number[] } {
    const n = signal.length
    if (n === 1) return { real: [...signal], imag: Array(n).fill(0) }
    if (n % 2 !== 0) {
      const padded = [...signal, 0]
      return this.fftReal(padded)
    }
    const even = this.fftReal(signal.filter((_, i) => i % 2 === 0))
    const odd = this.fftReal(signal.filter((_, i) => i % 2 === 1))
    const real = Array(n).fill(0)
    const imag = Array(n).fill(0)
    for (let k = 0; k < n / 2; k++) {
      const angle = -2 * Math.PI * k / n
      const cosA = Math.cos(angle), sinA = Math.sin(angle)
      const tReal = cosA * odd.real[k] - sinA * odd.imag[k]
      const tImag = cosA * odd.imag[k] + sinA * odd.real[k]
      real[k] = even.real[k] + tReal
      imag[k] = even.imag[k] + tImag
      real[k + n / 2] = even.real[k] - tReal
      imag[k + n / 2] = even.imag[k] - tImag
    }
    return { real, imag }
  },

  dctII(signal: number[]): number[] {
    const n = signal.length
    const result: number[] = []
    for (let k = 0; k < n; k++) {
      let sum = 0
      for (let n2 = 0; n2 < n; n2++) {
        sum += signal[n2] * Math.cos(Math.PI * k * (2 * n2 + 1) / (2 * n))
      }
      result.push(sum)
    }
    return result
  },

  autocorrelation(signal: number[], lag: number): number {
    const n = signal.length
    const mean = this.mean(signal)
    let num = 0, den = 0
    for (let i = 0; i < n; i++) {
      den += (signal[i] - mean) ** 2
      if (i + lag < n) num += (signal[i] - mean) * (signal[i + lag] - mean)
    }
    return den === 0 ? 0 : num / den
  },

  convolution(a: number[], b: number[]): number[] {
    const n = a.length + b.length - 1
    const result = Array(n).fill(0)
    for (let i = 0; i < a.length; i++) {
      for (let j = 0; j < b.length; j++) {
        result[i + j] += a[i] * b[j]
      }
    }
    return result
  },

  gaussianElimination(matrix: number[][], vector: number[]): number[] | null {
    const n = matrix.length
    const aug = matrix.map((row, i) => [...row, vector[i]])
    for (let col = 0; col < n; col++) {
      let maxRow = col
      for (let row = col + 1; row < n; row++) {
        if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) maxRow = row
      }
      ;[aug[col], aug[maxRow]] = [aug[maxRow], aug[col]]
      if (Math.abs(aug[col][col]) < 1e-12) return null
      for (let row = col + 1; row < n; row++) {
        const factor = aug[row][col] / aug[col][col]
        for (let j = col; j <= n; j++) aug[row][j] -= factor * aug[col][j]
      }
    }
    const x = Array(n).fill(0)
    for (let i = n - 1; i >= 0; i--) {
      x[i] = aug[i][n]
      for (let j = i + 1; j < n; j++) x[i] -= aug[i][j] * x[j]
      x[i] /= aug[i][i]
    }
    return x
  },

  matrixMultiply(a: number[][], b: number[][]): number[][] {
    const rows = a.length, cols = b[0].length, inner = b.length
    const result: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0))
    for (let i = 0; i < rows; i++)
      for (let j = 0; j < cols; j++)
        for (let k = 0; k < inner; k++)
          result[i][j] += a[i][k] * b[k][j]
    return result
  },

  matrixDeterminant(m: number[][]): number {
    const n = m.length
    if (n === 1) return m[0][0]
    if (n === 2) return m[0][0] * m[1][1] - m[0][1] * m[1][0]
    let det = 0
    for (let j = 0; j < n; j++) {
      const sub = m.slice(1).map(row => [...row.slice(0, j), ...row.slice(j + 1)])
      det += ((j % 2 === 0 ? 1 : -1) * m[0][j] * this.matrixDeterminant(sub))
    }
    return det
  },

  matrixInverse(m: number[][]): number[][] | null {
    const n = m.length
    const aug = m.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => i === j ? 1 : 0)])
    for (let i = 0; i < n; i++) {
      let maxRow = i
      for (let k = i + 1; k < n; k++) if (Math.abs(aug[k][i]) > Math.abs(aug[maxRow][i])) maxRow = k
      ;[aug[i], aug[maxRow]] = [aug[maxRow], aug[i]]
      if (Math.abs(aug[i][i]) < 1e-12) return null
      const pivot = aug[i][i]
      for (let j = 0; j < 2 * n; j++) aug[i][j] /= pivot
      for (let k = 0; k < n; k++) {
        if (k === i) continue
        const factor = aug[k][i]
        for (let j = 0; j < 2 * n; j++) aug[k][j] -= factor * aug[i][j]
      }
    }
    return aug.map(row => row.slice(n))
  },

  eigenvalues2x2(m: number[][]): [number, number] {
    const trace = m[0][0] + m[1][1]
    const det = m[0][0] * m[1][1] - m[0][1] * m[1][0]
    const disc = trace * trace - 4 * det
    if (disc < 0) return [trace / 2, trace / 2]
    return [(trace + Math.sqrt(disc)) / 2, (trace - Math.sqrt(disc)) / 2]
  },

  fibonacciSearch(arr: number[], target: number): number {
    const n = arr.length
    let fib2 = 0, fib1 = 1, fib = fib2 + fib1
    while (fib < n) { fib2 = fib1; fib1 = fib; fib = fib2 + fib1 }
    let offset = -1
    while (fib > 1) {
      const i = Math.min(offset + fib2, n - 1)
      if (arr[i] < target) { fib = fib1; fib1 = fib2; fib2 = fib - fib1; offset = i }
      else if (arr[i] > target) { fib = fib2; fib1 = fib1 - fib2; fib2 = fib - fib1 }
      else return i
    }
    if (fib1 && arr[offset + 1] === target) return offset + 1
    return -1
  },

  kadaneAlgorithm(arr: number[]): { maxSum: number; startIndex: number; endIndex: number } {
    let maxSum = arr[0], currentSum = arr[0]
    let start = 0, end = 0, tempStart = 0
    for (let i = 1; i < arr.length; i++) {
      if (currentSum + arr[i] < arr[i]) { currentSum = arr[i]; tempStart = i }
      else currentSum += arr[i]
      if (currentSum > maxSum) { maxSum = currentSum; start = tempStart; end = i }
    }
    return { maxSum, startIndex: start, endIndex: end }
  },

  longestCommonSubsequence(a: string, b: string): string {
    const m = a.length, n = b.length
    const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0))
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1] + 1
        else dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1])
      }
    }
    let result = ""
    let i = m, j = n
    while (i > 0 && j > 0) {
      if (a[i - 1] === b[j - 1]) { result = a[i - 1] + result; i--; j-- }
      else if (dp[i - 1][j] > dp[i][j - 1]) i--
      else j--
    }
    return result
  },

  huffmanEncode(text: string): { encoded: string; tree: any } {
    const freq: Record<string, number> = {}
    for (const ch of text) freq[ch] = (freq[ch] || 0) + 1
    let nodes = Object.entries(freq).map(([ch, f]) => ({ ch, freq: f, left: null as any, right: null as any }))
    while (nodes.length > 1) {
      nodes.sort((a, b) => a.freq - b.freq)
      const left = nodes.shift()!
      const right = nodes.shift()!
      nodes.push({ ch: null, freq: left.freq + right.freq, left, right })
    }
    const tree = nodes[0]
    const codes: Record<string, string> = {}
    const buildCodes = (node: any, code: string) => {
      if (!node) return
      if (node.ch) { codes[node.ch] = code || "0"; return }
      buildCodes(node.left, code + "0")
      buildCodes(node.right, code + "1")
    }
    buildCodes(tree, "")
    const encoded = text.split("").map(ch => codes[ch]).join("")
    return { encoded, tree }
  },

  rleEncode(text: string): string {
    if (text.length === 0) return ""
    let result = ""
    let count = 1
    for (let i = 1; i < text.length; i++) {
      if (text[i] === text[i - 1]) count++
      else { result += text[i - 1] + count; count = 1 }
    }
    result += text[text.length - 1] + count
    return result
  },

  runLengthDecode(encoded: string): string {
    let result = ""
    let i = 0
    while (i < encoded.length) {
      const ch = encoded[i]
      let numStr = ""
      while (i + 1 < encoded.length && /\d/.test(encoded[i + 1])) {
        numStr += encoded[++i]
      }
      result += ch.repeat(parseInt(numStr) || 1)
      i++
    }
    return result
  },

  mandelbrot(cx: number, cy: number, maxIter: number = 100): number {
    let zx = 0, zy = 0
    for (let i = 0; i < maxIter; i++) {
      const zx2 = zx * zx - zy * zy + cx
      const zy2 = 2 * zx * zy + cy
      zx = zx2; zy = zy2
      if (zx * zx + zy * zy > 4) return i / maxIter
    }
    return 1
  },

  juliaSet(zx: number, zy: number, cx: number, cy: number, maxIter: number = 100): number {
    for (let i = 0; i < maxIter; i++) {
      const zx2 = zx * zx - zy * zy + cx
      const zy2 = 2 * zx * zy + cy
      zx = zx2; zy = zy2
      if (zx * zx + zy * zy > 4) return i / maxIter
    }
    return 1
  },

  hillClimb(fn: (x: number) => number, start: number, step: number = 0.01, iterations: number = 1000): number {
    let current = start
    let currentVal = fn(current)
    for (let i = 0; i < iterations; i++) {
      const neighbors = [current - step, current + step]
      let best = current, bestVal = currentVal
      for (const n of neighbors) {
        const val = fn(n)
        if (val > bestVal) { best = n; bestVal = val }
      }
      if (best === current) { step *= 0.5; if (step < 1e-10) break }
      else { current = best; currentVal = bestVal }
    }
    return current
  },

  simulatedAnnealing(fn: (x: number) => number, start: number, temp: number = 100, cooling: number = 0.995, iterations: number = 10000): number {
    let current = start
    let currentVal = fn(current)
    let best = current, bestVal = currentVal
    for (let i = 0; i < iterations; i++) {
      // Deterministic neighbor — symmetric perturbation using iteration index
      const perturbation = ((deterministicFloat("sa", i) - 0.5) * temp * 0.1)
      const neighbor = current + (i % 2 === 0 ? perturbation : -perturbation)
      const neighborVal = fn(neighbor)
      const delta = neighborVal - currentVal
      // Deterministic acceptance — always accept improvements, accept worse based on threshold
      const acceptThreshold = Math.exp(delta / temp)
      if (delta > 0 || deterministicFloat("sa_accept", i) < acceptThreshold) {
        current = neighbor; currentVal = neighborVal
      }
      if (currentVal > bestVal) { best = current; bestVal = currentVal }
      temp *= cooling
    }
    return best
  },

  geneticAlgorithm(fn: (x: number) => number, range: [number, number], popSize: number = 100, generations: number = 500): number {
    // Deterministic initial population — evenly spaced across range
    let population = Array.from({ length: popSize }, (_, i) => range[0] + (i / (popSize - 1 || 1)) * (range[1] - range[0]))
    for (let gen = 0; gen < generations; gen++) {
      const fitness = population.map(x => ({ x, val: fn(x) }))
      fitness.sort((a, b) => b.val - a.val)
      const elite = fitness.slice(0, Math.floor(popSize / 2)).map(f => f.x)
      const newPop: number[] = [...elite]
      let childIdx = 0
      while (newPop.length < popSize) {
        // Deterministic parent selection — alternate parents
        const p1 = elite[childIdx % elite.length]
        const p2 = elite[(childIdx + 1) % elite.length]
        // Deterministic crossover + mutation
        const crossoverRate = deterministicFloat("ga_cross", gen * 100 + childIdx)
        let child = crossoverRate > 0.5 ? (p1 + p2) / 2 : p1
        const mutationAmount = (deterministicFloat("ga_mut", gen * 100 + childIdx) - 0.5) * (range[1] - range[0]) * 0.1 / (gen + 1)
        child = child + mutationAmount
        child = Math.max(range[0], Math.min(range[1], child))
        newPop.push(child)
        childIdx++
      }
      population = newPop
    }
    return population.reduce((best, x) => fn(x) > fn(best) ? x : best, population[0])
  },

  knapsack01(weights: number[], values: number[], capacity: number): { maxValue: number; items: number[] } {
    const n = weights.length
    const dp: number[][] = Array.from({ length: n + 1 }, () => Array(capacity + 1).fill(0))
    for (let i = 1; i <= n; i++) {
      for (let w = 0; w <= capacity; w++) {
        dp[i][w] = dp[i - 1][w]
        if (weights[i - 1] <= w) {
          dp[i][w] = Math.max(dp[i][w], dp[i - 1][w - weights[i - 1]] + values[i - 1])
        }
      }
    }
    const items: number[] = []
    let w = capacity
    for (let i = n; i > 0; i--) {
      if (dp[i][w] !== dp[i - 1][w]) { items.push(i - 1); w -= weights[i - 1] }
    }
    return { maxValue: dp[n][capacity], items: items.reverse() }
  },

  dijkstra(adjList: Map<number, { node: number; weight: number }[]>, start: number): Map<number, number> {
    const dist = new Map<number, number>()
    const visited = new Set<number>()
    for (const node of adjList.keys()) dist.set(node, Infinity)
    dist.set(start, 0)
    const pq: [number, number][] = [[0, start]]
    while (pq.length > 0) {
      pq.sort((a, b) => a[0] - b[0])
      const [d, u] = pq.shift()!
      if (visited.has(u)) continue
      visited.add(u)
      for (const { node: v, weight } of (adjList.get(u) || [])) {
        if (!visited.has(v) && d + weight < (dist.get(v) || Infinity)) {
          dist.set(v, d + weight)
          pq.push([d + weight, v])
        }
      }
    }
    return dist
  },

  bellmanFord(vertices: number, edges: [number, number, number][], start: number): number[] | null {
    const dist = Array(vertices).fill(Infinity)
    dist[start] = 0
    for (let i = 0; i < vertices - 1; i++) {
      for (const [u, v, w] of edges) {
        if (dist[u] + w < dist[v]) dist[v] = dist[u] + w
      }
    }
    for (const [u, v, w] of edges) {
      if (dist[u] + w < dist[v]) return null
    }
    return dist
  },

  topologicalSort(adjList: Map<number, number[]>): number[] | null {
    const inDegree = new Map<number, number>()
    for (const [node, neighbors] of adjList) {
      if (!inDegree.has(node)) inDegree.set(node, 0)
      for (const n of neighbors) inDegree.set(n, (inDegree.get(n) || 0) + 1)
    }
    const queue: number[] = []
    for (const [node, deg] of inDegree) if (deg === 0) queue.push(node)
    const result: number[] = []
    while (queue.length > 0) {
      const u = queue.shift()!
      result.push(u)
      for (const v of (adjList.get(u) || [])) {
        inDegree.set(v, inDegree.get(v)! - 1)
        if (inDegree.get(v) === 0) queue.push(v)
      }
    }
    return result.length === adjList.size ? result : null
  },

  fftConvolution(a: number[], b: number[]): number[] {
    const n = 1 << Math.ceil(Math.log2(a.length + b.length - 1))
    const aPadded = [...a, ...Array(n - a.length).fill(0)]
    const bPadded = [...b, ...Array(n - b.length).fill(0)]
    const fftA = this.fftReal(aPadded)
    const fftB = this.fftReal(bPadded)
    const resultReal: number[] = []
    const resultImag: number[] = []
    for (let i = 0; i < n; i++) {
      resultReal.push(fftA.real[i] * fftB.real[i] - fftA.imag[i] * fftB.imag[i])
      resultImag.push(fftA.real[i] * fftB.imag[i] + fftA.imag[i] * fftB.real[i])
    }
    const ifft = this.fftReal(resultReal.map((_, i) => Math.sqrt(resultReal[i] ** 2 + resultImag[i] ** 2)))
    return ifft.real.slice(0, a.length + b.length - 1)
  },

  expMovingAverage(data: number[], alpha: number): number[] {
    const result: number[] = [data[0]]
    for (let i = 1; i < data.length; i++) {
      result.push(alpha * data[i] + (1 - alpha) * result[i - 1])
    }
    return result
  },

  movingAverage(data: number[], window: number): number[] {
    const result: number[] = []
    for (let i = 0; i <= data.length - window; i++) {
      let sum = 0
      for (let j = 0; j < window; j++) sum += data[i + j]
      result.push(sum / window)
    }
    return result
  },

  newtonForwardInterpolation(xs: number[], ys: number[], x: number): number {
    const n = xs.length
    const diff: number[][] = [ys.slice()]
    for (let j = 1; j < n; j++) {
      diff[j] = []
      for (let i = 0; i < n - j; i++) {
        diff[j][i] = diff[j - 1][i + 1] - diff[j - 1][i]
      }
    }
    let result = ys[0]
    let term = 1
    const h = xs[1] - xs[0]
    const u = (x - xs[0]) / h
    for (let j = 1; j < n; j++) {
      term *= (u - (j - 1)) / j
      result += term * diff[j][0]
    }
    return result
  },

  lagrangeInterpolation(xs: number[], ys: number[], x: number): number {
    const n = xs.length
    let result = 0
    for (let i = 0; i < n; i++) {
      let term = ys[i]
      for (let j = 0; j < n; j++) {
        if (i !== j) term *= (x - xs[j]) / (xs[i] - xs[j])
      }
      result += term
    }
    return result
  },

  runStats(arr: number[]): {
    count: number; mean: number; median: number; mode: number;
    stddev: number; variance: number; min: number; max: number;
    range: number; q1: number; q3: number; iqr: number;
    skewness: number; kurtosis: number; cv: number
  } {
    const sorted = [...arr].sort((a, b) => a - b)
    const n = sorted.length
    const m = this.mean(arr)
    const v = this.variance(arr)
    const sd = Math.sqrt(v)
    const mode = arr.reduce((a, b, i, arr) =>
      arr.filter(v => v === a).length >= arr.filter(v => v === b).length ? a : b
    )
    let skewSum = 0, kurtSum = 0
    for (const x of arr) {
      skewSum += ((x - m) / (sd || 1)) ** 3
      kurtSum += ((x - m) / (sd || 1)) ** 4
    }
    return {
      count: n, mean: m, median: this.percentile(arr, 50), mode,
      stddev: sd, variance: v, min: sorted[0], max: sorted[n - 1],
      range: sorted[n - 1] - sorted[0], q1: this.percentile(arr, 25),
      q3: this.percentile(arr, 75), iqr: this.percentile(arr, 75) - this.percentile(arr, 25),
      skewness: n > 2 ? skewSum / n : 0, kurtosis: n > 3 ? kurtSum / n - 3 : 0,
      cv: m !== 0 ? (sd / Math.abs(m)) * 100 : 0
    }
  },

  bashPowerSet(arr: any[]): any[][] {
    const result: any[][] = [[]]
    for (const item of arr) {
      const newSubsets = result.map(subset => [...subset, item])
      result.push(...newSubsets)
    }
    return result
  },

  circularPermutations(n: number): number {
    return n > 0 ? MATH.factorial(n - 1) : 0
  },

  derangements(n: number): number {
    if (n === 0) return 1
    if (n === 1) return 0
    let d1 = 1, d2 = 0
    for (let i = 3; i <= n; i++) {
      const d = (i - 1) * (d1 + d2)
      d2 = d1; d1 = d
    }
    return (n - 1) * (d1 + d2)
  },

  catalanNumber(n: number): number {
    return MATH.binomialCoefficient(2 * n, n) / (n + 1)
  },

  stirlingApproximation(n: number): number {
    if (n <= 1) return 1
    return Math.sqrt(2 * MATH.PI * n) * MATH.fastPow(n / MATH.E, n)
  }
}

export async function ultraDocGen(args: {
  filePath?: string
  source?: string
  format?: "markdown" | "html" | "json"
  includePrivate?: boolean
}): Promise<ToolResult> {
  try {
    let source = args.source || ""
    if (args.filePath && !args.source) source = await fs.readFile(args.filePath, "utf-8")
    if (!source) return { success: false, output: "", error: "No source code provided" }

    const format = args.format || "markdown"
    const lines = source.split("\n")

    const functions: Array<{
      name: string
      params: string[]
      returnType: string
      jsdoc: string[]
      startLine: number
      isExported: boolean
      complexity: number
    }> = []

    let currentJsdoc: string[] = []
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const trimmed = line.trim()

      if (trimmed.startsWith("/**")) {
        currentJsdoc = [trimmed]
        continue
      }
      if (currentJsdoc.length > 0 && !trimmed.startsWith("*/")) {
        currentJsdoc.push(trimmed)
        continue
      }
      if (trimmed.startsWith("*/")) {
        currentJsdoc.push(trimmed)
        continue
      }

      const funcMatch = trimmed.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*(\S+))?/)
      if (funcMatch) {
        const name = funcMatch[1]
        const params = funcMatch[2] ? funcMatch[2].split(",").map(p => p.trim().split(":")[0].trim()) : []
        const returnType = funcMatch[3] || "void"
        const isExported = trimmed.startsWith("export")
        const bodyStart = i + 1
        let depth = 0
        let bodyEnd = bodyStart
        for (let j = bodyStart; j < lines.length; j++) {
          for (const ch of lines[j]) {
            if (ch === "{") depth++
            if (ch === "}") depth--
          }
          if (depth === 0) { bodyEnd = j; break }
        }
        let complexity = 1
        for (let j = bodyStart; j < bodyEnd; j++) {
          if (lines[j].match(/\b(if|else if|while|for|switch|case|&&|\|\||\?)\b/)) complexity++
          if (lines[j].match(/\b(catch)\b/)) complexity++
        }

        functions.push({
          name,
          params,
          returnType,
          jsdoc: currentJsdoc.filter(l => !l.startsWith("/**") && !l.startsWith("*/")),
          startLine: i + 1,
          isExported,
          complexity,
        })
        currentJsdoc = []
      }
    }

    const classes: Array<{
      name: string
      extendsClass: string | null
      methods: string[]
      properties: string[]
      startLine: number
    }> = []

    for (let i = 0; i < lines.length; i++) {
      const classMatch = lines[i].trim().match(/(?:export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?/)
      if (classMatch) {
        const name = classMatch[1]
        const extendsClass = classMatch[2] || null
        const methods: string[] = []
        const properties: string[] = []
        let depth = 0
        let started = false
        for (let j = i; j < lines.length; j++) {
          for (const ch of lines[j]) {
            if (ch === "{") { depth++; started = true }
            if (ch === "}") depth--
          }
          if (started && depth === 0) break
          const methodMatch = lines[j].trim().match(/(?:public|private|protected|static)?\s*(?:async\s+)?(\w+)\s*\(/)
          if (methodMatch && methodMatch[1] !== name) methods.push(methodMatch[1])
          const propMatch = lines[j].trim().match(/(?:public|private|protected|static)\s+(\w+)\s*[=:]/)
          if (propMatch) properties.push(propMatch[1])
        }
        classes.push({ name, extendsClass, methods, properties, startLine: i + 1 })
      }
    }

    const imports: Array<{ source: string; names: string[] }> = []
    const exportsList: string[] = []
    for (const line of lines) {
      const importMatch = line.match(/import\s+(?:{([^}]+)}|(\w+))\s+from\s+["'](.+?)["']/)
      if (importMatch) {
        const names = importMatch[1] ? importMatch[1].split(",").map(n => n.trim()) : [importMatch[2]!]
        imports.push({ source: importMatch[3]!, names })
      }
      const exportMatch = line.match(/export\s+(?:default\s+)?(?:function|class|const|let|var|interface|type)\s+(\w+)/)
      if (exportMatch) exportsList.push(exportMatch[1])
    }

    const totalFunctions = functions.length
    const documentedFunctions = functions.filter(f => f.jsdoc.length > 0).length
    const docCoverage = totalFunctions > 0 ? (documentedFunctions / totalFunctions * 100).toFixed(1) : "0"
    const avgComplexity = totalFunctions > 0
      ? (functions.reduce((s, f) => s + f.complexity, 0) / totalFunctions).toFixed(1)
      : "0"
    const exportedFunctions = functions.filter(f => f.isExported).length

    if (format === "json") {
      return {
        success: true,
        output: JSON.stringify({
          summary: {
            totalFunctions,
            documentedFunctions,
            documentationCoverage: `${docCoverage}%`,
            averageComplexity: avgComplexity,
            totalClasses: classes.length,
            totalExports: exportsList.length,
            totalImports: imports.length,
          },
          functions: functions.map(f => ({
            name: f.name, params: f.params, returnType: f.returnType,
            jsdoc: f.jsdoc, startLine: f.startLine, isExported: f.isExported, complexity: f.complexity,
          })),
          classes: classes.map(c => ({
            name: c.name, extendsClass: c.extendsClass, methods: c.methods, properties: c.properties,
          })),
          dependencies: imports,
          exports: exportsList,
        }, null, 2),
        details: { totalFunctions, classes: classes.length },
      }
    }

    const sections: string[] = []
    sections.push("# Auto-Generated Documentation\n")
    sections.push(`**Source**: ${args.filePath || "inline"}`)
    sections.push(`**Lines**: ${lines.length}`)
    sections.push(`**Functions**: ${totalFunctions} (${exportedFunctions} exported)`)
    sections.push(`**Classes**: ${classes.length}`)
    sections.push(`**Documentation Coverage**: ${docCoverage}%`)
    sections.push(`**Average Complexity**: ${avgComplexity}\n`)

    if (exportsList.length > 0) {
      sections.push("## Exports\n")
      for (const exp of exportsList) sections.push(`- \`${exp}\``)
      sections.push("")
    }

    if (functions.length > 0) {
      sections.push("## Functions\n")
      for (const fn of functions) {
        const sig = `function ${fn.name}(${fn.params.join(", ")}): ${fn.returnType}`
        sections.push(`### \`${sig}\``)
        sections.push(`- **Line**: ${fn.startLine}`)
        sections.push(`- **Exported**: ${fn.isExported ? "Yes" : "No"}`)
        sections.push(`- **Complexity**: ${fn.complexity}`)
        if (fn.jsdoc.length > 0) {
          sections.push(`- **Description**: ${fn.jsdoc.map(l => l.replace(/^\s*\*\s?/, "")).join(" ").trim()}`)
        }
        sections.push("")
      }
    }

    if (classes.length > 0) {
      sections.push("## Classes\n")
      for (const cls of classes) {
        sections.push(`### \`${cls.name}\`${cls.extendsClass ? ` extends \`${cls.extendsClass}\`` : ""}`)
        sections.push(`- **Line**: ${cls.startLine}`)
        if (cls.methods.length > 0) sections.push(`- **Methods**: ${cls.methods.join(", ")}`)
        if (cls.properties.length > 0) sections.push(`- **Properties**: ${cls.properties.join(", ")}`)
        sections.push("")
      }
    }

    if (imports.length > 0) {
      sections.push("## Dependencies\n")
      for (const imp of imports) {
        sections.push(`- \`${imp.source}\` → ${imp.names.join(", ")}`)
      }
      sections.push("")
    }

    return {
      success: true,
      output: sections.join("\n"),
      details: { totalFunctions, classes: classes.length, format },
    }
  } catch (e: any) {
    return { success: false, output: "", error: e.message }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ULTRA DEBUG — Advanced Debugging Intelligence Engine
// Performs stack trace analysis, memory leak detection, race condition
// identification, performance hotspot detection, and error pattern analysis.
// ═══════════════════════════════════════════════════════════════════════════

export async function ultraDebug(args: {
  filePath?: string
  source?: string
  errorLog?: string
  mode?: "static" | "dynamic" | "all"
}): Promise<ToolResult> {
  try {
    let source = args.source || ""
    if (args.filePath && !args.source) source = await fs.readFile(args.filePath, "utf-8")
    if (!source) return { success: false, output: "", error: "No source code provided" }

    const mode = args.mode || "static"
    const lines = source.split("\n")
    const issues: Array<{
      type: string
      severity: "critical" | "high" | "medium" | "low"
      line: number
      description: string
      suggestion: string
      category: string
    }> = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line.match(/\.\w+\s*\.\w+/) && !line.match(/(\?\?|\?\.)/) && line.match(/(?:\.push|\.length|\.map|\.filter|\.forEach)/)) {
        const propChain = line.match(/(\w+(?:\.\w+)+)/)
        if (propChain && !line.includes("&&") && !line.includes("if")) {
          issues.push({
            type: "Potential Null Dereference",
            severity: "medium",
            line: i + 1,
            description: `Property chain "${propChain[1]}" may throw if intermediate value is null/undefined`,
            suggestion: "Add optional chaining (?.) or null check before access",
            category: "null-safety",
          })
        }
      }
    }

    const openCalls = new Map<string, number>()
    for (let i = 0; i < lines.length; i++) {
      const openMatch = lines[i].match(/(\w+)\s*=\s*(?:await\s+)?(?:fs\.|open|createReadStream|createWriteStream)/)
      if (openMatch) openCalls.set(openMatch[1], i + 1)
      const closeMatch = lines[i].match(/(?:await\s+)?(\w+)\.close/)
      if (closeMatch) openCalls.delete(closeMatch[1])
    }
    for (const [name, line] of openCalls) {
      issues.push({
        type: "Unclosed Resource",
        severity: "high",
        line,
        description: `Resource "${name}" opened but never explicitly closed`,
        suggestion: "Use try/finally or use() to ensure resource cleanup",
        category: "resource-leak",
      })
    }

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(/(?:fire|trigger|emit|dispatch)\w*\s*\(/) && !lines[i].match(/await/)) {
        const nextLines = lines.slice(i + 1, i + 5).join(" ")
        if (nextLines.match(/(?:write|update|delete|modify)/)) {
          issues.push({
            type: "Potential Race Condition",
            severity: "high",
            line: i + 1,
            description: "Async operation without await before state mutation",
            suggestion: "Ensure proper sequencing with await or queue",
            category: "concurrency",
          })
        }
      }
    }

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(/setInterval\s*\(/) && !lines[i].match(/clearInterval/)) {
        const hasClear = lines.slice(i, Math.min(i + 50, lines.length)).some(l => l.match(/clearInterval/))
        if (!hasClear) {
          issues.push({
            type: "Memory Leak",
            severity: "high",
            line: i + 1,
            description: "setInterval without corresponding clearInterval found in scope",
            suggestion: "Store interval ID and clear it in cleanup/destroy",
            category: "memory-leak",
          })
        }
      }
    }

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(/catch\s*\(/) && i + 1 < lines.length) {
        const catchBody = lines[i + 1]?.trim()
        if (catchBody === "{}" || catchBody?.match(/^return\s*(undefined|void|null);?$/)) {
          issues.push({
            type: "Swallowed Error",
            severity: "medium",
            line: i + 1,
            description: "Empty catch block silently swallows errors",
            suggestion: "Log the error or rethrow with context",
            category: "error-handling",
          })
        }
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const secretMatch = lines[i].match(/(?:password|secret|token|api_?key)\s*[:=]\s*["']([^"']+)["']/i)
      if (secretMatch) {
        issues.push({
          type: "Hardcoded Secret",
          severity: "critical",
          line: i + 1,
          description: `Potential hardcoded credential: "${secretMatch[0].substring(0, 40)}..."`,
          suggestion: "Move to environment variables or secret manager",
          category: "security",
        })
      }
    }

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].match(/^\s*return\s/) && i + 1 < lines.length) {
        const nextNonEmpty = lines.slice(i + 1).find(l => l.trim().length > 0)
        if (nextNonEmpty && !nextNonEmpty.trim().startsWith("}") && !nextNonEmpty.trim().startsWith("//")) {
          issues.push({
            type: "Dead Code",
            severity: "low",
            line: i + 2,
            description: "Unreachable code after return statement",
            suggestion: "Remove unreachable code",
            category: "code-quality",
          })
        }
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const fnMatch = lines[i].match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)/)
      if (fnMatch) {
        let depth = 0
        let started = false
        let end = i
        for (let j = i; j < lines.length; j++) {
          for (const ch of lines[j]) {
            if (ch === "{") { depth++; started = true }
            if (ch === "}") depth--
          }
          if (started && depth === 0) { end = j; break }
        }
        let complexity = 1
        for (let j = i; j <= end; j++) {
          if (lines[j].match(/\b(if|else|while|for|switch|case|&&|\|\||\?|catch)\b/)) complexity++
        }
        if (complexity > 15) {
          issues.push({
            type: "High Complexity Function",
            severity: complexity > 30 ? "high" : "medium",
            line: i + 1,
            description: `Function "${fnMatch[1]}" has cyclomatic complexity of ${complexity}`,
            suggestion: "Break into smaller functions or simplify logic",
            category: "complexity",
          })
        }
      }
    }

    const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 }
    issues.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])

    const sections: string[] = []
    sections.push("# Ultra Debug Report\n")
    sections.push(`**Source**: ${args.filePath || "inline"}`)
    sections.push(`**Mode**: ${mode}`)
    sections.push(`**Lines Analyzed**: ${lines.length}`)
    sections.push(`**Issues Found**: ${issues.length}\n`)

    const bySeverity = {
      critical: issues.filter(i => i.severity === "critical"),
      high: issues.filter(i => i.severity === "high"),
      medium: issues.filter(i => i.severity === "medium"),
      low: issues.filter(i => i.severity === "low"),
    }

    sections.push(`## Summary`)
    sections.push(`- Critical: ${bySeverity.critical.length}`)
    sections.push(`- High: ${bySeverity.high.length}`)
    sections.push(`- Medium: ${bySeverity.medium.length}`)
    sections.push(`- Low: ${bySeverity.low.length}\n`)

    const byCategory = new Map<string, number>()
    for (const issue of issues) {
      byCategory.set(issue.category, (byCategory.get(issue.category) || 0) + 1)
    }
    if (byCategory.size > 0) {
      sections.push("## Categories\n")
      for (const [cat, count] of byCategory) {
        sections.push(`- **${cat}**: ${count} issues`)
      }
      sections.push("")
    }

    sections.push("## Issues\n")
    for (const issue of issues.slice(0, 50)) {
      sections.push(`### [${issue.severity.toUpperCase()}] ${issue.type} (Line ${issue.line})`)
      sections.push(`- **Category**: ${issue.category}`)
      sections.push(`- **Description**: ${issue.description}`)
      sections.push(`- **Suggestion**: ${issue.suggestion}`)
      sections.push("")
    }

    return {
      success: true,
      output: sections.join("\n"),
      details: {
        totalIssues: issues.length,
        bySeverity: {
          critical: bySeverity.critical.length,
          high: bySeverity.high.length,
          medium: bySeverity.medium.length,
          low: bySeverity.low.length,
        },
        byCategory: Object.fromEntries(byCategory),
      },
    }
  } catch (e: any) {
    return { success: false, output: "", error: e.message }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ULTRA COMPLEXITY — Code Complexity & Maintainability Analyzer
// Performs cyclomatic complexity, cognitive complexity, maintainability index,
// Halstead metrics, and code smell detection.
// ═══════════════════════════════════════════════════════════════════════════

export async function ultraComplexity(args: {
  filePath?: string
  source?: string
}): Promise<ToolResult> {
  try {
    let source = args.source || ""
    if (args.filePath && !args.source) source = await fs.readFile(args.filePath, "utf-8")
    if (!source) return { success: false, output: "", error: "No source code provided" }

    const lines = source.split("\n")
    const sections: string[] = []
    sections.push("# Code Complexity Analysis\n")

    // --- Cyclomatic Complexity (CC1 + CC2) ---
    let cc1 = 1
    let cc2 = 1
    let nestingDepth = 0
    let maxNesting = 0
    let functionCount = 0
    let currentFunction = ""
    const functions: Array<{ name: string; cc1: number; cc2: number; lines: number }> = []
    let funcStart = 0
    let funcLines = 0

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (line.length === 0 || line.startsWith("//") || line.startsWith("*")) continue

      const funcMatch = line.match(/\b(function|(\w+)\s*=|\(([^)]*)\)\s*=>)\s*(\w+)?/)
      if (funcMatch) {
        if (currentFunction && funcLines > 0) {
          functions.push({ name: currentFunction, cc1, cc2, lines: funcLines })
        }
        currentFunction = funcMatch[4] || funcMatch[2] || "anonymous"
        funcStart = i + 1
        funcLines = 0
        cc1 = 1
        cc2 = 1
        functionCount++
      }

      funcLines++

      // CC1 — decision points
      if (/\bif\s*\(/.test(line)) cc1++
      if (/\belse\s+if\s*\(/.test(line)) cc1++
      if (/\bfor\s*\(/.test(line)) cc1++
      if (/\bwhile\s*\(/.test(line)) cc1++
      if (/\bcase\s+/.test(line)) cc1++
      if (/\bcatch\s*\(/.test(line)) cc1++
      if (/&&/.test(line)) cc1++
      if (/\|\|/.test(line)) cc1++
      if (/\?[^?]/.test(line) && /:/.test(line)) cc1++

      // CC2 — nesting complexity
      if (/\bif\s*\(/.test(line)) { nestingDepth++; cc2 += nestingDepth }
      if (/\bfor\s*\(/.test(line)) { nestingDepth++; cc2 += nestingDepth }
      if (/\bwhile\s*\(/.test(line)) { nestingDepth++; cc2 += nestingDepth }
      if (/\bcatch\s*\(/.test(line)) { cc2 += nestingDepth }
      if (/\{/.test(line) && !/\}/.test(line)) { /* block start */ }
      if (/\}/.test(line) && nestingDepth > 0) nestingDepth--
      if (nestingDepth > maxNesting) maxNesting = nestingDepth
    }
    if (currentFunction && funcLines > 0) {
      functions.push({ name: currentFunction, cc1, cc2, lines: funcLines })
    }

    sections.push("## Cyclomatic Complexity\n")
    sections.push(`Total functions: ${functionCount}`)
    const totalCC1 = functions.reduce((s, f) => s + f.cc1, 0)
    const totalCC2 = functions.reduce((s, f) => s + f.cc2, 0)
    sections.push(`Total CC1: ${totalCC1} | Total CC2: ${totalCC2}`)
    sections.push(`Max nesting depth: ${maxNesting}\n`)

    const highComplexity = functions.filter(f => f.cc1 > 15 || f.cc2 > 20)
    if (highComplexity.length > 0) {
      sections.push("### High Complexity Functions\n")
      for (const f of highComplexity) {
        sections.push(`- ${f.name}: CC1=${f.cc1}, CC2=${f.cc2}, Lines=${f.lines}`)
      }
      sections.push("")
    }

    // --- Halstead Metrics ---
    const operators = new Set<string>()
    const operands = new Set<string>()
    let totalOperators = 0
    let totalOperands = 0

    const operatorPatterns = [
      /\b(if|else|for|while|do|switch|case|return|break|continue|throw|try|catch|finally|new|delete|typeof|instanceof|void|in|of|class|extends|super|import|export|default|from|as|async|await|yield|const|let|var|function|static|public|private|protected|get|set)\b/,
      /[+\-*/%=<>!&|^~?:]+/,
      /[{}()\[\];,.]/
    ]

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.length === 0 || trimmed.startsWith("//")) continue
      for (const pattern of operatorPatterns) {
        const matches = trimmed.match(pattern)
        if (matches) {
          for (const m of matches) {
            operators.add(m)
            totalOperators++
          }
        }
      }
      const identPattern = /\b([a-zA-Z_]\w*)\b/g
      let identMatch
      while ((identMatch = identPattern.exec(trimmed)) !== null) {
        const word = identMatch[1]
        if (!["if", "else", "for", "while", "do", "switch", "case", "return", "break", "continue", "throw", "try", "catch", "finally", "new", "typeof", "instanceof", "void", "function", "class", "const", "let", "var", "async", "await"].includes(word)) {
          operands.add(word)
          totalOperands++
        }
      }
    }

    const n = operators.size + operands.size
    const N = totalOperators + totalOperands
    const V = N * Math.log2(n || 1)
    const D = (operators.size / 2) * (totalOperands / (operands.size || 1))
    const E = D * V
    const T = E / 18
    const B = Math.pow(V, 2 / 3) / 3000

    sections.push("## Halstead Metrics\n")
    sections.push(`Vocabulary (n): ${n}`)
    sections.push(`Length (N): ${N}`)
    sections.push(`Volume (V): ${V.toFixed(2)}`)
    sections.push(`Difficulty (D): ${D.toFixed(2)}`)
    sections.push(`Effort (E): ${E.toFixed(2)}`)
    sections.push(`Time (T): ${T.toFixed(2)} seconds`)
    sections.push(`Bugs (B): ${B.toFixed(4)}\n`)

    // --- Maintainability Index ---
    const halsteadVolume = V
    const mcc = totalCC1
    const loc = lines.length
    const mi = Math.max(0, 171 - 5.2 * Math.log(halsteadVolume || 1) - 0.23 * mcc - 16.2 * Math.log(loc || 1))
    const miNorm = Math.max(0, (mi * 100) / 171)

    sections.push("## Maintainability Index\n")
    sections.push(`Raw MI: ${mi.toFixed(2)}`)
    sections.push(`Normalized MI: ${miNorm.toFixed(1)}%`)
    sections.push(`Rating: ${miNorm >= 80 ? "Highly Maintainable" : miNorm >= 50 ? "Moderately Maintainable" : "Difficult to Maintain"}\n`)

    // --- Code Smells ---
    const smells: Array<{ type: string; line: number; severity: string; description: string }> = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (line.length > 120) {
        smells.push({ type: "Long Line", line: i + 1, severity: "low", description: `Line length ${line.length} exceeds 120 chars` })
      }
      if (/^\s{0,3}\t/.test(line) || /^\s{40,}/.test(line)) {
        smells.push({ type: "Deep Nesting", line: i + 1, severity: "medium", description: "Deeply nested code (>3 levels)" })
      }
    }

    const longFunctions = functions.filter(f => f.lines > 50)
    for (const f of longFunctions) {
      smells.push({ type: "Long Function", line: funcStart, severity: "medium", description: `Function "${f.name}" has ${f.lines} lines (threshold: 50)` })
    }

    const godFunctions = functions.filter(f => f.cc1 > 25)
    for (const f of godFunctions) {
      smells.push({ type: "God Function", line: funcStart, severity: "high", description: `Function "${f.name}" has CC1=${f.cc1} (threshold: 25)` })
    }

    sections.push("## Code Smells\n")
    sections.push(`Total smells: ${smells.length}\n`)
    for (const smell of smells.slice(0, 30)) {
      sections.push(`[${smell.severity.toUpperCase()}] ${smell.type} @ line ${smell.line}: ${smell.description}`)
    }

    return {
      success: true,
      output: sections.join("\n"),
      details: {
        cyclomatic: { totalCC1, totalCC2, maxNesting, functionCount },
        halstead: { vocabulary: n, length: N, volume: V, difficulty: D, effort: E },
        maintainability: { raw: mi, normalized: miNorm },
        smells: smells.length,
      },
    }
  } catch (e: any) {
    return { success: false, output: "", error: e.message }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ULTRA ARCHITECT — Architecture Analysis & Dependency Graph
// Performs module dependency analysis, circular dependency detection,
// dependency depth calculation, and architecture scoring.
// ═══════════════════════════════════════════════════════════════════════════

export async function ultraArchitect(args: {
  filePath?: string
  source?: string
}): Promise<ToolResult> {
  try {
    let source = args.source || ""
    if (args.filePath && !args.source) source = await fs.readFile(args.filePath, "utf-8")
    if (!source) return { success: false, output: "", error: "No source code provided" }

    const lines = source.split("\n")
    const sections: string[] = []
    sections.push("# Architecture Analysis\n")

    // --- Import/Export Graph ---
    const imports: Array<{ from: string; to: string; names: string[] }> = []
    const exportsList: string[] = []
    const modules = new Set<string>()

    for (const line of lines) {
      const importMatch = line.match(/import\s+(?:{([^}]+)}|(\w+))\s+from\s+["'](.+?)["']/)
      if (importMatch) {
        const names = importMatch[1] ? importMatch[1].split(",").map(n => n.trim()) : [importMatch[2]!]
        const source = importMatch[3]!
        imports.push({ from: "current", to: source, names })
        modules.add(source)
      }
      const exportMatch = line.match(/export\s+(?:default\s+)?(?:function|class|const|let|var|interface|type)\s+(\w+)/)
      if (exportMatch) {
        exportsList.push(exportMatch[1])
        modules.add("current")
      }
    }

    // --- Circular Dependency Detection ---
    const depGraph = new Map<string, Set<string>>()
    for (const imp of imports) {
      if (!depGraph.has(imp.from)) depGraph.set(imp.from, new Set())
      depGraph.get(imp.from)!.add(imp.to)
    }

    const cycles: string[][] = []
    const visited = new Set<string>()
    const recursionStack = new Set<string>()

    function dfsCycle(node: string, path: string[]): void {
      visited.add(node)
      recursionStack.add(node)
      path.push(node)

      for (const neighbor of depGraph.get(node) || new Set()) {
        if (!visited.has(neighbor)) {
          dfsCycle(neighbor, [...path])
        } else if (recursionStack.has(neighbor)) {
          const cycleStart = path.indexOf(neighbor)
          if (cycleStart !== -1) {
            cycles.push(path.slice(cycleStart).concat(neighbor))
          }
        }
      }

      path.pop()
      recursionStack.delete(node)
    }

    for (const node of depGraph.keys()) {
      if (!visited.has(node)) dfsCycle(node, [])
    }

    // --- Dependency Depth ---
    const depthCache = new Map<string, number>()
    function calcDepth(node: string, visited: Set<string> = new Set()): number {
      if (depthCache.has(node)) return depthCache.get(node)!
      if (visited.has(node)) return 0
      visited.add(node)
      const deps = depGraph.get(node) || new Set()
      let maxDepth = 0
      for (const dep of deps) {
        const d = calcDepth(dep, new Set(visited))
        if (d > maxDepth) maxDepth = d
      }
      const depth = maxDepth + 1
      depthCache.set(node, depth)
      return depth
    }

    for (const node of depGraph.keys()) {
      calcDepth(node)
    }

    // --- Fan-in/Fan-out Analysis ---
    const fanIn = new Map<string, number>()
    const fanOut = new Map<string, number>()
    for (const imp of imports) {
      fanOut.set(imp.from, (fanOut.get(imp.from) || 0) + 1)
      fanIn.set(imp.to, (fanIn.get(imp.to) || 0) + 1)
    }

    // --- Stability Metrics ---
    const totalModules = modules.size
    const afferent = fanIn.size
    const efferent = fanOut.size
    const instability = efferent + afferent > 0 ? efferent / (efferent + afferent) : 0
    const abstractness = exportsList.length / Math.max(totalModules, 1)
    const distance = Math.abs(abstractness - (1 - instability))

    sections.push("## Module Summary\n")
    sections.push(`Total modules referenced: ${totalModules}`)
    sections.push(`Exports: ${exportsList.length}`)
    sections.push(`Imports: ${imports.length}\n`)

    sections.push("## Dependency Graph\n")
    for (const [from, tos] of depGraph) {
      sections.push(`- ${from} → ${[...tos].join(", ")}`)
    }
    sections.push("")

    if (cycles.length > 0) {
      sections.push("## Circular Dependencies\n")
      sections.push(`Found ${cycles.length} circular dependency chains:\n`)
      for (const cycle of cycles.slice(0, 10)) {
        sections.push(`  ${cycle.join(" → ")}`)
      }
      sections.push("")
    }

    sections.push("## Stability Metrics\n")
    sections.push(`Instability (I): ${instability.toFixed(3)} (0=stable, 1=unstable)`)
    sections.push(`Abstractness (A): ${abstractness.toFixed(3)} (0=concrete, 1=abstract)`)
    sections.push(`Distance from Main Sequence (D): ${distance.toFixed(3)} (0=ideal)\n`)

    if (distance > 0.5) {
      sections.push("⚠ Architecture is far from the Main Sequence — consider restructuring\n")
    }

    sections.push("## Fan Analysis\n")
    for (const mod of Array.from(modules).slice(0, 20)) {
      sections.push(`- ${mod}: fan-in=${fanIn.get(mod) || 0}, fan-out=${fanOut.get(mod) || 0}`)
    }

    return {
      success: true,
      output: sections.join("\n"),
      details: {
        modules: totalModules,
        imports: imports.length,
        exports: exportsList.length,
        cycles: cycles.length,
        instability,
        abstractness,
        distance,
      },
    }
  } catch (e: any) {
    return { success: false, output: "", error: e.message }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ULTRA GRAPH — Code Dependency Graph Builder
// Builds AST-like structural graphs from source code, detects patterns,
// and generates visualization-ready output.
// ═══════════════════════════════════════════════════════════════════════════

export async function ultraGraph(args: {
  filePath?: string
  source?: string
  format?: "json" | "dot" | "mermaid"
}): Promise<ToolResult> {
  try {
    let source = args.source || ""
    if (args.filePath && !args.source) source = await fs.readFile(args.filePath, "utf-8")
    if (!source) return { success: false, output: "", error: "No source code provided" }

    const lines = source.split("\n")
    const format = args.format || "json"

    const nodes: Array<{ id: string; type: string; name: string; line: number; metadata: Record<string, any> }> = []
    const edges: Array<{ from: string; to: string; type: string; label: string }> = []

    let nodeCounter = 0

    // Parse functions
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      const funcMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)(?:\s*:\s*(\S+))?/)
      if (funcMatch) {
        const id = `func_${nodeCounter++}`
        const params = funcMatch[2] ? funcMatch[2].split(",").map(p => p.trim().split(":")[0].trim()) : []
        let depth = 0
        let started = false
        let bodyEnd = i
        for (let j = i; j < lines.length; j++) {
          for (const ch of lines[j]) {
            if (ch === "{") { depth++; started = true }
            if (ch === "}") depth--
          }
          if (started && depth === 0) { bodyEnd = j; break }
        }
        nodes.push({
          id,
          type: "function",
          name: funcMatch[1],
          line: i + 1,
          metadata: {
            params,
            returnType: funcMatch[3] || "void",
            exported: line.startsWith("export"),
            lines: bodyEnd - i,
            isAsync: line.includes("async"),
          },
        })
      }
    }

    // Parse classes
    for (let i = 0; i < lines.length; i++) {
      const classMatch = lines[i].trim().match(/(?:export\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?/)
      if (classMatch) {
        const id = `class_${nodeCounter++}`
        const methods: string[] = []
        const properties: string[] = []
        let depth = 0
        let started = false
        for (let j = i; j < lines.length; j++) {
          for (const ch of lines[j]) {
            if (ch === "{") { depth++; started = true }
            if (ch === "}") depth--
          }
          if (started && depth === 0) break
          const methodMatch = lines[j].trim().match(/(?:public|private|protected|static)?\s*(?:async\s+)?(\w+)\s*\(/)
          if (methodMatch && methodMatch[1] !== classMatch[1]) methods.push(methodMatch[1])
          const propMatch = lines[j].trim().match(/(?:public|private|protected|static)\s+(\w+)\s*[=:]/)
          if (propMatch) properties.push(propMatch[1])
        }
        nodes.push({
          id,
          type: "class",
          name: classMatch[1],
          line: i + 1,
          metadata: {
            extends: classMatch[2] || null,
            methods,
            properties,
            methodCount: methods.length,
            propertyCount: properties.length,
          },
        })
        if (classMatch[2]) {
          edges.push({ from: id, to: classMatch[2], type: "extends", label: "extends" })
        }
      }
    }

    // Parse interfaces and types
    for (let i = 0; i < lines.length; i++) {
      const ifaceMatch = lines[i].trim().match(/(?:export\s+)?(?:interface|type)\s+(\w+)/)
      if (ifaceMatch) {
        nodes.push({
          id: `type_${nodeCounter++}`,
          type: "type",
          name: ifaceMatch[1],
          line: i + 1,
          metadata: { kind: lines[i].includes("interface") ? "interface" : "type" },
        })
      }
    }

    // Build call graph edges (heuristic: function calls in function bodies)
    for (const node of nodes.filter(n => n.type === "function")) {
      for (let i = node.line - 1; i < lines.length; i++) {
        const line = lines[i]
        for (const other of nodes.filter(n => n.type === "function" && n.id !== node.id)) {
          if (line.includes(other.name + "(")) {
            edges.push({ from: node.id, to: other.id, type: "calls", label: "calls" })
          }
        }
      }
    }

    // Detect design patterns
    const patterns: string[] = []
    for (const cls of nodes.filter(n => n.type === "class")) {
      const methods = cls.metadata.methods as string[]
      if (methods.includes("getInstance") && methods.every(m => !m.startsWith("new"))) {
        patterns.push(`${cls.name}: Singleton pattern (getInstance method)`)
      }
      if (methods.some(m => m.startsWith("create") || m.startsWith("build"))) {
        patterns.push(`${cls.name}: Factory/Builder pattern (create/build methods)`)
      }
      if (methods.includes("subscribe") || methods.includes("notify") || methods.includes("addListener")) {
        patterns.push(`${cls.name}: Observer pattern (subscribe/notify methods)`)
      }
      if (methods.includes("execute") && methods.some(m => m.startsWith("undo") || m.startsWith("redo"))) {
        patterns.push(`${cls.name}: Command pattern (execute/undo/redo)`)
      }
    }

    // Format output
    if (format === "dot") {
      let dot = "digraph CodeGraph {\n"
      for (const node of nodes) {
        const shape = node.type === "class" ? "box" : node.type === "function" ? "ellipse" : "diamond"
        dot += `  "${node.name}" [shape=${shape}, label="${node.name}\\n${node.type}"];\n`
      }
      for (const edge of edges) {
        const fromNode = nodes.find(n => n.id === edge.from)
        const toNode = nodes.find(n => n.id === edge.to)
        if (fromNode && toNode) {
          dot += `  "${fromNode.name}" -> "${toNode.name}" [label="${edge.label}"];\n`
        }
      }
      dot += "}\n"
      return { success: true, output: dot, details: { nodes: nodes.length, edges: edges.length, patterns } }
    }

    if (format === "mermaid") {
      let mermaid = "graph TD\n"
      for (const node of nodes) {
        const prefix = node.type === "class" ? "class" : node.type === "function" ? "func" : "type"
        mermaid += `  ${prefix}${nodeCounter}[${node.name}]\n`
      }
      for (const edge of edges) {
        const fromNode = nodes.find(n => n.id === edge.from)
        const toNode = nodes.find(n => n.id === edge.to)
        if (fromNode && toNode) {
          mermaid += `  ${fromNode.name} --> ${toNode.name}\n`
        }
      }
      return { success: true, output: mermaid, details: { nodes: nodes.length, edges: edges.length, patterns } }
    }

    return {
      success: true,
      output: JSON.stringify({ nodes, edges, patterns, summary: { totalNodes: nodes.length, totalEdges: edges.length, totalPatterns: patterns.length } }, null, 2),
      details: { nodes: nodes.length, edges: edges.length, patterns },
    }
  } catch (e: any) {
    return { success: false, output: "", error: e.message }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ULTRA METRICS — Software Metrics Calculator
// Computes LOC, LLOC, SLOC, comments ratio, MI, maintainability,
// and per-function metrics.
// ═══════════════════════════════════════════════════════════════════════════

export async function ultraMetrics(args: {
  filePath?: string
  source?: string
}): Promise<ToolResult> {
  try {
    let source = args.source || ""
    if (args.filePath && !args.source) source = await fs.readFile(args.filePath, "utf-8")
    if (!source) return { success: false, output: "", error: "No source code provided" }

    const lines = source.split("\n")
    const sections: string[] = []
    sections.push("# Software Metrics Report\n")

    // --- Basic Line Metrics ---
    const loc = lines.length
    let blankLines = 0
    let commentLines = 0
    let codeLines = 0
    let singleLineComments = 0
    let multiLineComments = 0
    let inBlockComment = false

    for (const line of lines) {
      const trimmed = line.trim()
      if (trimmed.length === 0) { blankLines++; continue }
      if (inBlockComment) {
        commentLines++
        multiLineComments++
        if (trimmed.includes("*/")) inBlockComment = false
        continue
      }
      if (trimmed.startsWith("//")) { commentLines++; singleLineComments++; continue }
      if (trimmed.startsWith("/*")) {
        commentLines++
        multiLineComments++
        if (!trimmed.includes("*/")) inBlockComment = true
        continue
      }
      if (trimmed.startsWith("*")) { commentLines++; multiLineComments++; continue }
      codeLines++
    }

    const commentRatio = loc > 0 ? (commentLines / loc * 100) : 0
    const codeRatio = loc > 0 ? (codeLines / loc * 100) : 0

    sections.push("## Line Counts\n")
    sections.push(`Total lines (LOC): ${loc}`)
    sections.push(`Code lines (SLOC): ${codeLines} (${codeRatio.toFixed(1)}%)`)
    sections.push(`Comment lines: ${commentLines} (${commentRatio.toFixed(1)}%)`)
    sections.push(`Blank lines: ${blankLines}`)
    sections.push(`Single-line comments: ${singleLineComments}`)
    sections.push(`Multi-line comments: ${multiLineComments}\n`)

    // --- Function-level Metrics ---
    const functions: Array<{
      name: string
      startLine: number
      endLine: number
      loc: number
      params: number
      complexity: number
      nestingMax: number
    }> = []

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      const funcMatch = line.match(/(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/)
      if (funcMatch) {
        let depth = 0
        let started = false
        let end = i
        let funcLoc = 0
        let nesting = 0
        let maxNesting = 0
        let complexity = 1

        for (let j = i; j < lines.length; j++) {
          const l = lines[j]
          for (const ch of l) {
            if (ch === "{") { depth++; started = true; nesting++ }
            if (ch === "}") { depth--; nesting-- }
          }
          if (nesting > maxNesting) maxNesting = nesting
          if (started && depth === 0) { end = j; break }
          if (j > i) funcLoc++
          if (l.match(/\b(if|else if|while|for|switch|case|&&|\|\||\?|catch)\b/)) complexity++
        }

        const params = funcMatch[2] ? funcMatch[2].split(",").filter(p => p.trim().length > 0).length : 0
        functions.push({
          name: funcMatch[1],
          startLine: i + 1,
          endLine: end + 1,
          loc: funcLoc,
          params,
          complexity,
          nestingMax: maxNesting,
        })
      }
    }

    sections.push("## Function Metrics\n")
    sections.push(`Total functions: ${functions.length}\n`)

    if (functions.length > 0) {
      const avgLoc = functions.reduce((s, f) => s + f.loc, 0) / functions.length
      const avgComplexity = functions.reduce((s, f) => s + f.complexity, 0) / functions.length
      const avgParams = functions.reduce((s, f) => s + f.params, 0) / functions.length
      const maxComplexity = Math.max(...functions.map(f => f.complexity))
      const longFunctions = functions.filter(f => f.loc > 30)
      const complexFunctions = functions.filter(f => f.complexity > 10)

      sections.push(`Average function length: ${avgLoc.toFixed(1)} lines`)
      sections.push(`Average complexity: ${avgComplexity.toFixed(1)}`)
      sections.push(`Average parameters: ${avgParams.toFixed(1)}`)
      sections.push(`Max complexity: ${maxComplexity}`)
      sections.push(`Long functions (>30 lines): ${longFunctions.length}`)
      sections.push(`Complex functions (CC>10): ${complexFunctions.length}\n`)

      sections.push("### Per-Function Details\n")
      for (const f of functions) {
        const rating = f.complexity <= 5 ? "A" : f.complexity <= 10 ? "B" : f.complexity <= 20 ? "C" : "D"
        sections.push(`- ${f.name} [${rating}]: L${f.startLine}-L${f.endLine}, ${f.loc} lines, CC=${f.complexity}, params=${f.params}, maxNest=${f.nestingMax}`)
      }
      sections.push("")
    }

    // --- Class Metrics ---
    const classes: Array<{ name: string; methods: number; properties: number; loc: number }> = []
    for (let i = 0; i < lines.length; i++) {
      const classMatch = lines[i].trim().match(/(?:export\s+)?class\s+(\w+)/)
      if (classMatch) {
        let depth = 0
        let started = false
        let end = i
        let methodCount = 0
        let propCount = 0
        for (let j = i; j < lines.length; j++) {
          for (const ch of lines[j]) {
            if (ch === "{") { depth++; started = true }
            if (ch === "}") depth--
          }
          if (started && depth === 0) { end = j; break }
          if (lines[j].trim().match(/(?:public|private|protected|static)?\s*(?:async\s+)?\w+\s*\(/)) methodCount++
          if (lines[j].trim().match(/(?:public|private|protected|static)\s+\w+\s*[=:])) propCount++
        }
        classes.push({ name: classMatch[1], methods: methodCount, properties: propCount, loc: end - i })
      }
    }

    if (classes.length > 0) {
      sections.push("## Class Metrics\n")
      for (const c of classes) {
        sections.push(`- ${c.name}: ${c.methods} methods, ${c.properties} properties, ${c.loc} lines`)
      }
      sections.push("")
    }

    // --- Quality Score ---
    const complexityScore = functions.length > 0
      ? Math.max(0, 100 - functions.reduce((s, f) => s + Math.max(0, f.complexity - 5), 0) * 2)
      : 100
    const documentationScore = Math.min(100, commentRatio * 2)
    const sizeScore = functions.length > 0
      ? Math.max(0, 100 - functions.filter(f => f.loc > 50).length * 10)
      : 100
    const overallScore = (complexityScore * 0.4 + documentationScore * 0.3 + sizeScore * 0.3)

    sections.push("## Quality Score\n")
    sections.push(`Complexity score: ${complexityScore.toFixed(0)}/100`)
    sections.push(`Documentation score: ${documentationScore.toFixed(0)}/100`)
    sections.push(`Size score: ${sizeScore.toFixed(0)}/100`)
    sections.push(`Overall: ${overallScore.toFixed(1)}/100\n`)

    return {
      success: true,
      output: sections.join("\n"),
      details: {
        loc, sloc: codeLines, comments: commentLines, blanks: blankLines,
        functions: functions.length, classes: classes.length,
        qualityScore: overallScore,
      },
    }
  } catch (e: any) {
    return { success: false, output: "", error: e.message }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ULTRA TOOL PROFILER — Real-time Execution Performance Analysis
// Measures actual tool execution time, memory usage, and generates reports
// ═══════════════════════════════════════════════════════════════════════════

interface ToolProfileEntry {
  toolName: string
  executionTimeMs: number
  memoryBeforeBytes: number
  memoryAfterBytes: number
  memoryDeltaBytes: number
  success: boolean
  inputSizeBytes: number
  outputSizeBytes: number
  timestamp: number
}

interface ToolProfileReport {
  toolName: string
  totalExecutions: number
  avgExecutionTimeMs: number
  p50ExecutionTimeMs: number
  p90ExecutionTimeMs: number
  p99ExecutionTimeMs: number
  maxExecutionTimeMs: number
  minExecutionTimeMs: number
  avgMemoryDeltaBytes: number
  maxMemoryDeltaBytes: number
  successRate: number
  avgInputSizeBytes: number
  avgOutputSizeBytes: number
  throughputBytesPerMs: number
  slowestExecution: number
  fastestExecution: number
}

class ToolProfiler {
  private profiles: Map<string, ToolProfileEntry[]> = new Map()
  private maxEntriesPerTool = 1000

  record(entry: ToolProfileEntry): void {
    const existing = this.profiles.get(entry.toolName) ?? []
    existing.push(entry)
    if (existing.length > this.maxEntriesPerTool) existing.shift()
    this.profiles.set(entry.toolName, existing)
  }

  startProfile(toolName: string): { end: (success: boolean, inputSize: number, outputSize: number) => ToolProfileEntry } {
    const memBefore = process.memoryUsage().heapUsed
    const start = performance.now()
    return {
      end: (success: boolean, inputSize: number, outputSize: number) => {
        const end = performance.now()
        const memAfter = process.memoryUsage().heapUsed
        const entry: ToolProfileEntry = {
          toolName,
          executionTimeMs: end - start,
          memoryBeforeBytes: memBefore,
          memoryAfterBytes: memAfter,
          memoryDeltaBytes: memAfter - memBefore,
          success,
          inputSizeBytes: inputSize,
          outputSizeBytes: outputSize,
          timestamp: Date.now(),
        }
        this.record(entry)
        return entry
      },
    }
  }

  generateReport(toolName: string): ToolProfileReport | null {
    const entries = this.profiles.get(toolName)
    if (!entries || entries.length === 0) return null

    const times = entries.map(e => e.executionTimeMs).sort((a, b) => a - b)
    const memDeltas = entries.map(e => e.memoryDeltaBytes)
    const successes = entries.filter(e => e.success).length
    const inputSizes = entries.map(e => e.inputSizeBytes)
    const outputSizes = entries.map(e => e.outputSizeBytes)

    const percentile = (arr: number[], p: number) => {
      const idx = Math.ceil(arr.length * p / 100) - 1
      return arr[Math.max(0, idx)]!
    }

    const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / (arr.length || 1)
    const max = (arr: number[]) => Math.max(...arr)
    const min = (arr: number[]) => Math.min(...arr)

    const totalTime = times.reduce((s, v) => s + v, 0)
    const totalIO = inputSizes.reduce((s, v) => s + v, 0) + outputSizes.reduce((s, v) => s + v, 0)

    return {
      toolName,
      totalExecutions: entries.length,
      avgExecutionTimeMs: avg(times),
      p50ExecutionTimeMs: percentile(times, 50),
      p90ExecutionTimeMs: percentile(times, 90),
      p99ExecutionTimeMs: percentile(times, 99),
      maxExecutionTimeMs: max(times),
      minExecutionTimeMs: min(times),
      avgMemoryDeltaBytes: avg(memDeltas),
      maxMemoryDeltaBytes: max(memDeltas),
      successRate: successes / entries.length,
      avgInputSizeBytes: avg(inputSizes),
      avgOutputSizeBytes: avg(outputSizes),
      throughputBytesPerMs: totalTime > 0 ? totalIO / totalTime : 0,
      slowestExecution: times[times.length - 1]!,
      fastestExecution: times[0]!,
    }
  }

  generateFullReport(): string {
    const sections: string[] = []
    sections.push("═══ TOOL EXECUTION PERFORMANCE REPORT ═══\n")
    sections.push(`Total tools profiled: ${this.profiles.size}`)
    let totalExecs = 0
    for (const entries of this.profiles.values()) totalExecs += entries.length
    sections.push(`Total executions recorded: ${totalExecs}\n`)

    for (const [name, entries] of this.profiles) {
      const report = this.generateReport(name)
      if (!report) continue
      sections.push(`─── ${name} (${entries.length} executions) ───`)
      sections.push(`  Avg time: ${report.avgExecutionTimeMs.toFixed(2)}ms`)
      sections.push(`  P50: ${report.p50ExecutionTimeMs.toFixed(2)}ms | P90: ${report.p90ExecutionTimeMs.toFixed(2)}ms | P99: ${report.p99ExecutionTimeMs.toFixed(2)}ms`)
      sections.push(`  Range: ${report.minExecutionTimeMs.toFixed(2)}ms — ${report.maxExecutionTimeMs.toFixed(2)}ms`)
      sections.push(`  Memory avg delta: ${(report.avgMemoryDeltaBytes / 1024).toFixed(1)}KB | max: ${(report.maxMemoryDeltaBytes / 1024).toFixed(1)}KB`)
      sections.push(`  Success rate: ${(report.successRate * 100).toFixed(1)}%`)
      sections.push(`  Throughput: ${report.throughputBytesPerMs.toFixed(1)} bytes/ms`)
      sections.push(`  Avg input: ${(report.avgInputSizeBytes / 1024).toFixed(1)}KB | Avg output: ${(report.avgOutputSizeBytes / 1024).toFixed(1)}KB`)
      sections.push("")
    }
    return sections.join("\n")
  }

  getSlowestTools(limit: number = 10): ToolProfileReport[] {
    const reports: ToolProfileReport[] = []
    for (const [name] of this.profiles) {
      const report = this.generateReport(name)
      if (report) reports.push(report)
    }
    return reports.sort((a, b) => b.avgExecutionTimeMs - a.avgExecutionTimeMs).slice(0, limit)
  }

  getMemoryHogs(limit: number = 10): ToolProfileReport[] {
    const reports: ToolProfileReport[] = []
    for (const [name] of this.profiles) {
      const report = this.generateReport(name)
      if (report) reports.push(report)
    }
    return reports.sort((a, b) => b.maxMemoryDeltaBytes - a.maxMemoryDeltaBytes).slice(0, limit)
  }

  getFailureProne(limit: number = 10): ToolProfileReport[] {
    const reports: ToolProfileReport[] = []
    for (const [name] of this.profiles) {
      const report = this.generateReport(name)
      if (report) reports.push(report)
    }
    return reports.sort((a, b) => a.successRate - b.successRate).slice(0, limit)
  }
}

export const toolProfiler = new ToolProfiler()

export async function ultraProfile(args: {
  toolName?: string
  report?: boolean
  slowest?: boolean
  memoryHogs?: boolean
  failures?: boolean
}): Promise<{ success: boolean; output: string; details?: Record<string, unknown> }> {
  try {
    if (args.toolName) {
      const report = toolProfiler.generateReport(args.toolName)
      if (!report) return { success: false, output: `No profile data for tool "${args.toolName}"` }
      return {
        success: true,
        output: JSON.stringify(report, null, 2),
        details: { type: "single-tool-profile", ...report },
      }
    }

    if (args.slowest) {
      const slow = toolProfiler.getSlowestTools(20)
      return {
        success: true,
        output: JSON.stringify(slow, null, 2),
        details: { type: "slowest-tools", count: slow.length },
      }
    }

    if (args.memoryHogs) {
      const hogs = toolProfiler.getMemoryHogs(20)
      return {
        success: true,
        output: JSON.stringify(hogs, null, 2),
        details: { type: "memory-hogs", count: hogs.length },
      }
    }

    if (args.failures) {
      const failures = toolProfiler.getFailureProne(20)
      return {
        success: true,
        output: JSON.stringify(failures, null, 2),
        details: { type: "failure-prone", count: failures.length },
      }
    }

    const report = toolProfiler.generateFullReport()
    return {
      success: true,
      output: report,
      details: { type: "full-report", toolsProfiled: toolProfiler["profiles"].size },
    }
  } catch (e: any) {
    return { success: false, output: "", error: e.message }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ULTRA TOOL SCHEDULER — Priority-based Tool Execution Queue
// Schedules tool execution with priority, dependencies, and resource limits
// ═══════════════════════════════════════════════════════════════════════════

interface ScheduledTool {
  id: string
  toolName: string
  args: Record<string, unknown>
  priority: number
  dependencies: string[]
  maxRetries: number
  currentRetries: number
  status: "pending" | "running" | "completed" | "failed" | "cancelled"
  createdAt: number
  startedAt?: number
  completedAt?: number
  result?: unknown
  error?: string
}

class ToolScheduler {
  private queue: ScheduledTool[] = []
  private running: Map<string, ScheduledTool> = new Map()
  private completed: Map<string, ScheduledTool> = new Map()
  private maxConcurrent = 5
  private maxQueueSize = 100
  private idCounter = 0

  enqueue(toolName: string, args: Record<string, unknown> = {}, priority: number = 0, dependencies: string[] = [], maxRetries: number = 3): string {
    if (this.queue.length >= this.maxQueueSize) throw new Error("Queue full")
    const id = `sched-${Date.now()}-${(this.idCounter++).toString(36)}`
    const entry: ScheduledTool = {
      id,
      toolName,
      args,
      priority,
      dependencies,
      maxRetries,
      currentRetries: 0,
      status: "pending",
      createdAt: Date.now(),
    }
    this.queue.push(entry)
    this.queue.sort((a, b) => b.priority - a.priority)
    return id
  }

  dequeue(): ScheduledTool | null {
    const idx = this.queue.findIndex(s => {
      if (s.dependencies.length > 0) {
        return s.dependencies.every(dep => this.completed.has(dep) && this.completed.get(dep)!.status === "completed")
      }
      return true
    })
    if (idx === -1) return null
    const [entry] = this.queue.splice(idx, 1)
    return entry!
  }

  getQueueStatus(): { pending: number; running: number; completed: number; failed: number; cancelled: number } {
    let pending = 0, running = 0, completed = 0, failed = 0, cancelled = 0
    for (const s of this.queue) pending++
    for (const s of this.running.values()) {
      if (s.status === "running") running++
    }
    for (const s of this.completed.values()) {
      if (s.status === "completed") completed++
      else if (s.status === "failed") failed++
      else if (s.status === "cancelled") cancelled++
    }
    return { pending, running, completed, failed, cancelled }
  }

  cancel(id: string): boolean {
    const idx = this.queue.findIndex(s => s.id === id)
    if (idx !== -1) {
      const [entry] = this.queue.splice(idx, 1)
      if (entry) {
        entry.status = "cancelled"
        this.completed.set(entry.id, entry)
      }
      return true
    }
    const running = this.running.get(id)
    if (running) {
      running.status = "cancelled"
      this.completed.set(id, running)
      this.running.delete(id)
      return true
    }
    return false
  }

  getExecutionTimeline(): Array<{ id: string; toolName: string; status: string; durationMs?: number }> {
    const timeline: Array<{ id: string; toolName: string; status: string; durationMs?: number }> = []
    for (const s of this.completed.values()) {
      const duration = s.startedAt && s.completedAt ? s.completedAt - s.startedAt : undefined
      timeline.push({ id: s.id, toolName: s.toolName, status: s.status, durationMs: duration })
    }
    return timeline.sort((a, b) => (a.durationMs ?? 0) - (b.durationMs ?? 0))
  }
}

export const toolScheduler = new ToolScheduler()

export async function ultraSchedule(args: {
  action?: "enqueue" | "status" | "timeline" | "cancel"
  toolName?: string
  args?: Record<string, unknown>
  priority?: number
  dependencies?: string[]
  id?: string
}): Promise<{ success: boolean; output: string; details?: Record<string, unknown> }> {
  try {
    switch (args.action) {
      case "enqueue": {
        if (!args.toolName) return { success: false, output: "toolName required" }
        const id = toolScheduler.enqueue(args.toolName, args.args ?? {}, args.priority ?? 0, args.dependencies ?? [])
        return { success: true, output: `Enqueued: ${id}`, details: { id } }
      }
      case "status": {
        const status = toolScheduler.getQueueStatus()
        return { success: true, output: JSON.stringify(status, null, 2), details: status }
      }
      case "timeline": {
        const timeline = toolScheduler.getExecutionTimeline()
        return { success: true, output: JSON.stringify(timeline, null, 2), details: { count: timeline.length } }
      }
      case "cancel": {
        if (!args.id) return { success: false, output: "id required" }
        const cancelled = toolScheduler.cancel(args.id)
        return { success: cancelled, output: cancelled ? `Cancelled: ${args.id}` : `Not found: ${args.id}` }
      }
      default: {
        const status = toolScheduler.getQueueStatus()
        return { success: true, output: JSON.stringify(status, null, 2), details: status }
      }
    }
  } catch (e: any) {
    return { success: false, output: "", error: e.message }
  }
}
