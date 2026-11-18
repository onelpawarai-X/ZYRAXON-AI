// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

console.log("Service worker script loaded");

chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed");
});