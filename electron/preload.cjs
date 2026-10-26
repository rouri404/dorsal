// What only the AppImage can do, offered to the page as window.dorsal: hearing the computer's
// sound for the music modes, the tray, which shows the music and can stop it, and the app's
// settings.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dorsal", {
  music: {
    start: () => ipcRenderer.invoke("music:start"),
    stop: () => ipcRenderer.invoke("music:stop"),
    state: (on, source) => ipcRenderer.send("music:state", on, source),
    onStopRequest: (fn) => void ipcRenderer.on("music:stop-request", () => fn()),
  },
  tray: () => ipcRenderer.invoke("app:tray"),
  quit: () => ipcRenderer.send("app:quit"),
  settings: {
    get: () => ipcRenderer.invoke("settings:get"),
    set: (next) => ipcRenderer.invoke("settings:set", next),
  },
});
