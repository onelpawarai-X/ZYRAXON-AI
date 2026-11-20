// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

onconnect = event => {
  const port = event.ports[0];
  port.onmessage = e => port.postMessage('echo:' + e.data);
};
