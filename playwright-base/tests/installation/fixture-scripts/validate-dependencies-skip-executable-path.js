// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

const jarvis = require('jarvis');

process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = 1;

(async () => {
  const browser = await jarvis.chromium.launch({
    executablePath: jarvis.chromium.executablePath()
  });
  await browser.close();
})();