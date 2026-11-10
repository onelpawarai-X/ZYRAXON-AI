// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

const { app, BrowserWindow } = require('electron');

app.whenReady().then(() => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
  });
  setTimeout(() => {
    win.loadURL('data:text/html,<h1>Foobar</h1>');
  }, 2_000);
})

app.on('window-all-closed', e => e.preventDefault());
