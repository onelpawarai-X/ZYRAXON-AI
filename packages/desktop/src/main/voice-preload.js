// Copyright (c) 2026 onelpawarai. All rights reserved.

const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("voiceBridge", {
  send: (data) => ipcRenderer.send("voice-message", data),
  getState: () => ipcRenderer.invoke("voice-get-state"),
  onEvent: (callback) => {
    ipcRenderer.on("voice-event", (_event, data) => callback(data))
  },
})
