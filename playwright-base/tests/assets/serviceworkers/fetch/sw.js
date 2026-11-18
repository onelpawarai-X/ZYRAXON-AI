// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

self.intercepted = [];

self.addEventListener('fetch', event => {
  self.intercepted.push(event.request.url)
  event.respondWith(fetch(event.request));
});

self.addEventListener('activate', event => {
  event.waitUntil(clients.claim());
});

fetch('/request-from-within-worker.txt')
