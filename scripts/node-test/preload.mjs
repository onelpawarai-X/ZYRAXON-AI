// Copyright (c) 2026 onelpawarai. All rights reserved.

// Registers a DOM for tests that touch `document`, `URL.createObjectURL`, and
// friends. Node has no DOM, so happy-dom stands one up before the test files run.
import { GlobalRegistrator } from "@happy-dom/global-registrator"

GlobalRegistrator.register({ url: "http://localhost/" })
