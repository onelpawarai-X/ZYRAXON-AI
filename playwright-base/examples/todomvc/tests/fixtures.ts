// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

/* eslint-disable notice/notice */

import { test as baseTest } from '@jarvis-browser/test';

export { expect } from '@jarvis-browser/test';

export const test = baseTest.extend({
  page: async ({ page }, use) => {
    await page.goto('https://demo.jarvisbrowser.dev/todomvc');
    await use(page);
  },
});
