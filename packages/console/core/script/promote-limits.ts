#!/usr/bin/env bun
// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.


import { $ } from "bun"
import path from "path"
import { Subscription } from "../src/subscription"

const stage = process.argv[2]
if (!stage) throw new Error("Stage is required")

const root = path.resolve(process.cwd(), "..", "..", "..")

// read the secret
const ret = await $`bun sst secret list --fallback`.cwd(root).text()
const lines = ret.split("\n")
const value = lines.find((line) => line.startsWith("ZEN_LIMITS"))?.split("=")[1]
if (!value) throw new Error("ZEN_LIMITS not found")

// validate value
Subscription.validate(JSON.parse(value))

// update the secret
await $`bun sst secret set ZEN_LIMITS ${value} --stage ${stage}`
