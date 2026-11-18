#!/usr/bin/env bun
// Copyright (c) 2026 onelpawarai. All rights reserved.


import path from "path"
const toDynamicallyImport = path.join(process.cwd(), process.argv[2])
await import(toDynamicallyImport)
console.log(performance.now())
