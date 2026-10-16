// Copyright (c) 2026 onelpawarai. All rights reserved.
//
// Ambient declarations for optional runtime dependencies.
//
// `node-llama-cpp` and `pdfjs-dist` are imported dynamically and only when the
// feature that needs them is used (local llama inference, PDF reading). They are
// intentionally not install-time dependencies, so the compiler cannot resolve
// their types. The call sites already treat the imported values as `any`, so a
// permissive module shape is enough to keep typecheck green without pulling the
// packages in.

declare module "node-llama-cpp" {
  const mod: any
  export = mod
}

declare module "pdfjs-dist" {
  const mod: any
  export = mod
}

declare module "pdfjs-dist/legacy/build/pdf.mjs" {
  const mod: any
  export = mod
}
