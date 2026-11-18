// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

const { app } = require('electron');

app.on('window-all-closed', e => e.preventDefault());