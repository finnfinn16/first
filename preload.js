const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pomodoro', {
  getState: () => ipcRenderer.invoke('get-state'),
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (cfg) => ipcRenderer.invoke('config:set', cfg),
  start: () => ipcRenderer.send('control:start'),
  pause: () => ipcRenderer.send('control:pause'),
  reset: () => ipcRenderer.send('control:reset'),
  skip: () => ipcRenderer.send('control:skip'),
  closeWindow: () => ipcRenderer.send('window:close'),
  togglePin: () => ipcRenderer.send('window:toggle-pin'),
  onUpdate: (cb) => ipcRenderer.on('state:update', (_e, s) => cb(s)),
  onPhaseComplete: (cb) => ipcRenderer.on('phase:complete', (_e, d) => cb(d)),
});
