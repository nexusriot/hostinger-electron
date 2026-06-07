'use strict';

const { app, BrowserWindow, ipcMain, Menu, shell, clipboard } = require('electron');
const path = require('path');
const { HostingerClient } = require('./hostinger-client');
const { ConfigStore } = require('./config');

let cfg, client, win;

const opsLog = [];
function logOp(kind, target, result) {
  opsLog.unshift({ ts: new Date().toISOString(), kind, target, result });
  if (opsLog.length > 200) opsLog.length = 200;
}
function isMutation(method) { return !/^(list|get|ping)/.test(method); }

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 980, minHeight: 620,
    title: 'Hostinger', backgroundColor: '#0f0a1e',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: false },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  if (process.argv.includes('--dev')) win.webContents.openDevTools({ mode: 'detach' });
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    ...(isMac ? [{ role: 'appMenu' }] : []),
    { label: 'File', submenu: [
      { label: 'Settings…', accelerator: 'CmdOrCtrl+,', click: () => win && win.webContents.send('open-settings') },
      { type: 'separator' }, isMac ? { role: 'close' } : { role: 'quit' },
    ] },
    { role: 'editMenu' },
    { label: 'View', submenu: [
      { label: 'Refresh', accelerator: 'CmdOrCtrl+R', click: () => win && win.webContents.send('refresh') },
      { role: 'toggleDevTools' }, { type: 'separator' },
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' },
    ] },
    { role: 'help', submenu: [
      { label: 'Hostinger panel', click: () => shell.openExternal('https://hpanel.hostinger.com') },
      { label: 'API tokens (get token)', click: () => shell.openExternal('https://hpanel.hostinger.com/profile/api') },
    ] },
  ]));
}

app.whenReady().then(() => {
  cfg = new ConfigStore(app.getPath('userData'));
  client = new HostingerClient({ tokenProvider: () => cfg.token, baseURLProvider: () => cfg.baseURL });
  buildMenu();
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });

// generic dispatch: window.api.call(method, ...args)
ipcMain.handle('h:call', async (_evt, method, args) => {
  args = Array.isArray(args) ? args : [];
  if (typeof method !== 'string' || method.startsWith('_')) return { ok: false, error: 'invalid method' };
  const fn = client[method];
  if (typeof fn !== 'function') return { ok: false, error: 'unknown method: ' + method };
  const target = args.length ? String(args[0]).slice(0, 60) : '';
  try {
    const data = await fn.apply(client, args);
    if (isMutation(method)) logOp(method, target, 'ok');
    return { ok: true, data };
  } catch (e) {
    if (isMutation(method)) logOp(method, target, 'ERROR: ' + e.message);
    return { ok: false, error: e.message, status: e.status };
  }
});

ipcMain.handle('config:get', async () => ({ ok: true, data: cfg.publicView() }));
ipcMain.handle('config:save', async (_e, partial) => {
  try { cfg.save(partial); return { ok: true, data: cfg.publicView() }; }
  catch (e) { return { ok: false, error: e.message }; }
});
ipcMain.handle('ops:list', async () => ({ ok: true, data: opsLog.slice() }));

ipcMain.handle('ssh:command', async (_e, vmID, host) => {
  const o = cfg.sshFor(vmID, host);
  const parts = ['ssh'];
  if (o.identity_file) parts.push('-i', o.identity_file);
  if (o.port && o.port !== 22) parts.push('-p', String(o.port));
  if (o.jump_host) parts.push('-J', o.jump_host);
  parts.push(`${o.user || 'root'}@${host}`);
  return { ok: true, data: parts.join(' ') };
});
ipcMain.handle('util:openExternal', async (_e, url) => { if (url) shell.openExternal(url); return { ok: true }; });
ipcMain.handle('util:clipboard', async (_e, text) => { if (text) clipboard.writeText(String(text)); return { ok: true }; });
