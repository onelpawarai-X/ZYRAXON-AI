// Copyright (c) 2026 onelpawarai. All rights reserved.

// @refresh reload
import { mount, StartClient } from "@solidjs/start/client"

const root = document.getElementById("app")
if (!root) throw new Error("Root element #app not found")

mount(() => <StartClient />, root)
