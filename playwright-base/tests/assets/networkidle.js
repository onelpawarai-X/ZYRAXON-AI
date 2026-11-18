// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

async function main() {
  window.ws = new WebSocket('ws://localhost:' + window.location.port + '/ws');
  window.ws.addEventListener('message', message => {});

  fetch('fetch-request-a.js');
  window.top.fetchSecond = () => {
    // Do not return the promise here.
    fetch('fetch-request-b.js');
  };
}

main();
