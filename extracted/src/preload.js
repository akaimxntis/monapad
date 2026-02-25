const { contextBridge, ipcRenderer, webUtils, shell } = require("electron");
const log = require("electron-log");

contextBridge.exposeInMainWorld("electronAPI", {
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  openExternal: (url) => shell.openExternal(url),
  sendMessage: (msg) => ipcRenderer.send("message", msg),
  onReceive: (callback) => ipcRenderer.on("reply", callback),
  openFileDialog: () => ipcRenderer.invoke("dialog:openFile"),
  saveToFile: (filePath, content) => ipcRenderer.invoke("file:save", filePath, content),
  showSaveDialog: (defaultName) => ipcRenderer.invoke("dialog:saveFile", defaultName),
  readFile: (filePath) => ipcRenderer.invoke("file:read", filePath),
  showMessageBox: (options) => ipcRenderer.invoke("show-message-box", options),
  createNewWindow: () => ipcRenderer.invoke("window:createNew"),

  // === move tab between windows ===
  // open tab in new window
  createNewWindowWithTab: (tabData, position) => ipcRenderer.invoke("window:createNewWithTab", tabData, position),
  // receive tab data on new window
  onLoadTabData: (callback) => ipcRenderer.on("load-tab-data", (event, tabData) => callback(tabData)),
  // assign each window id
  onAssignWindowId: (callback) => ipcRenderer.on("assign-window-id", (_, id) => callback(id)),
  // get window id
  getWindowIdAt: (point) => ipcRenderer.invoke("window:getIdAt", point),
  // get window bounds
  getMyBounds: () => ipcRenderer.invoke("window:getMyBounds"),
  // get if window is minimized or not
  isWindowMinimized: (windowId) => ipcRenderer.invoke("isWindowMinimized", windowId),
  // send tab to different window
  sendTabToWindow: (windowId, tabData) => ipcRenderer.invoke("tab:sendToWindow", windowId, tabData),
  // focus window after tab is sent
  focusWindow: (windowId) => ipcRenderer.invoke("focus-window", windowId),
  // small window when dragging tab outside toolbar
  createCursorWindow: () => ipcRenderer.send("createCursorWindow"),
  moveCursorWindow: (x, y) => ipcRenderer.send("moveCursorWindow", { x, y }),
  destroyCursorWindow: () => ipcRenderer.send("destroyCursorWindow"),
  // receive change cursor window text command
  setCursorWindowState: (state) => ipcRenderer.send("setCursorWindowState", state),

  fileExists: (filePath) => ipcRenderer.invoke("file:exists", filePath),
  getPathForFile: (file) => webUtils.getPathForFile(file),
  openPath: (path) => ipcRenderer.invoke("open-path", path),
  onWindowFocus: (callback) => ipcRenderer.on("window-focus", (event, focused) => callback(focused)),
  onAttemptCloseWindow: (callback) => ipcRenderer.on("attempt-close-window", callback),

  // file watch
  watchFile: (filePath) => ipcRenderer.invoke("file:watch", filePath),
  unwatchFile: (filePath) => ipcRenderer.invoke("file:unwatch", filePath),
  onFileChanged: (callback) => ipcRenderer.on("file:changed", callback),

  minimizeWindow: () => ipcRenderer.send("window:minimize"),
  toggleMaximizeWindow: () => ipcRenderer.send("window:toggleMaximize"),
  closeWindow: () => ipcRenderer.send("window:close"),

  // printContent: (text) => ipcRenderer.send("print-content", text),

  // font
  getFonts: () => ipcRenderer.invoke("get-fonts"),

  // open file on launch
  onOpenFile: (cb) => ipcRenderer.on("open-file", (_, path) => cb(path)),
  removeOpenFileListener: () => ipcRenderer.removeAllListeners("open-file"),

  // theme
  getCustomThemes: () => ipcRenderer.invoke("get-custom-themes"),
  getUserDataPath: () => ipcRenderer.invoke("get-user-data-path"),
  readCssFile: (filePath) => ipcRenderer.invoke("read-css-file", filePath),
  watchCssFile: (filePath) => ipcRenderer.send("watch-css-file", filePath),
  unwatchCssFile: (filePath) => ipcRenderer.send("unwatch-css-file", filePath),
  onCssFileUpdated: (callback) => ipcRenderer.on("css-file-updated", (_, path) => callback(path)),
});

contextBridge.exposeInMainWorld("electronLog", {
  info: (...args) => log.info(...args),
  error: (...args) => log.error(...args),
  warn: (...args) => log.warn(...args),
});
