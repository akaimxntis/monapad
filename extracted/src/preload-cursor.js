const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  // update text of cursor.html
  onUpdateState: (callback) => ipcRenderer.on("update-state", callback),
});
