'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Single generic dispatch surface — the Hostinger client has ~50 methods, so
// the renderer calls them by name through one validated channel.

contextBridge.exposeInMainWorld('api', {
  call: (method, ...args) => ipcRenderer.invoke('h:call', method, args),
  config: {
    get: () => ipcRenderer.invoke('config:get'),
    save: (partial) => ipcRenderer.invoke('config:save', partial),
  },
  ops: { list: () => ipcRenderer.invoke('ops:list') },
  ssh: { command: (vmID, host) => ipcRenderer.invoke('ssh:command', vmID, host) },
  util: {
    openExternal: (url) => ipcRenderer.invoke('util:openExternal', url),
    copy: (text) => ipcRenderer.invoke('util:clipboard', text),
  },
  on: (event, cb) => {
    const valid = ['open-settings', 'refresh'];
    if (valid.includes(event)) ipcRenderer.on(event, () => cb());
  },
});
