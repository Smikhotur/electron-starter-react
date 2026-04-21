const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  pickSpreadsheet: () => ipcRenderer.invoke("pick-spreadsheet"),

  parseSpreadsheet: (filePath) =>
    ipcRenderer.invoke("parse-spreadsheet", filePath),

  buildMultipartPreview: (post) =>
    ipcRenderer.invoke("build-multipart-preview", post),

  uploadPosts: (payload) => ipcRenderer.invoke("upload-posts", payload),
});
