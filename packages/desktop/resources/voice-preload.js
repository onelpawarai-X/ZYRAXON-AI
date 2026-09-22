const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("electronBridge", {
  send: (channel, data) => {
    ipcRenderer.send(channel, data)
  },
  receive: (channel, callback) => {
    ipcRenderer.on(channel, (event, ...args) => callback(...args))
  },
  invoke: (channel, data) => {
    return ipcRenderer.invoke(channel, data)
  },
})
