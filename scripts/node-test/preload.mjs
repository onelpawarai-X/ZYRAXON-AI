// Copyright (c) 2026 onelpawarai. All rights reserved.

// Registers a DOM for tests that touch `document`, `URL.createObjectURL`, and
// friends. Node has no DOM, so happy-dom stands one up before the test files run.
import { GlobalRegistrator } from "@happy-dom/global-registrator"

// happy-dom replaces `fetch` with a browser fetch that enforces the same-origin
// policy, which refuses the real local HTTP listeners the HTTP-level suites start.
// The runtime's own fetch is kept aside first so those suites can use it and still
// exercise a real request.
const nativeFetch = globalThis.fetch

GlobalRegistrator.register({ url: "http://localhost/" })

globalThis.__zyraxonNativeFetch = nativeFetch
