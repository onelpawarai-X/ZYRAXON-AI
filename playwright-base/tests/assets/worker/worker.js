// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

console.log('hello from the worker');

function workerFunction() {
  return 'worker function result';
}

self.addEventListener('message', event => {
  console.log('got this data: ' + event.data);
});

(async function() {
  while (true) {
    self.postMessage(workerFunction.toString());
    await new Promise(x => setTimeout(x, 100));
  }
})();