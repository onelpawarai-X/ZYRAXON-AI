// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

console.log("hello from worker-http-import.js");
importScripts("./import-me.js")
console.log("successfully imported");
self.postMessage("finished");
