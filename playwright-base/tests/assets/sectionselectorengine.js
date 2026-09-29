// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

({
  query(root, selector) {
    return root.querySelector('section');
  },
  queryAll(root, selector) {
    return Array.from(root.querySelectorAll('section'));
  }
})