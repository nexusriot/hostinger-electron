'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

// Config compatible with the Go hostinger-tui:
//   ~/.config/hostinger-tui/config.json  (or $XDG_CONFIG_HOME/hostinger-tui)
// Env overrides (win over file): HOSTINGER_TOKEN, HOSTINGER_API_BASE_URL.
// The in-app Settings dialog writes back to the loaded file (default the shared
// TUI path) so both tools stay in sync.

const APP = 'hostinger-tui';
const DEFAULT_BASE = 'https://developers.hostinger.com';

const DEFAULTS = {
  api: { token: '', base_url: DEFAULT_BASE },
  ssh: { user: 'root', port: 22, identity_file: '' },
  ssh_by_vm: {},
  ui: { refresh_seconds: 0, auto_refresh: false },
  saved_views: [],
};

function sharedTuiPath() {
  const base = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  return path.join(base, APP, 'config.json');
}
function deepMerge(base, over) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const k of Object.keys(over || {})) {
    if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k])) out[k] = deepMerge(base[k] || {}, over[k]);
    else if (over[k] !== undefined) out[k] = over[k];
  }
  return out;
}

class ConfigStore {
  constructor(userDataDir) {
    this.userDataDir = userDataDir;
    this.data = deepMerge(DEFAULTS, {});
    this.loadedFrom = null;
    this.writePath = sharedTuiPath();
    this.load();
  }
  candidatePaths() {
    const list = [];
    if (process.env.HOSTINGER_CONFIG) list.push(process.env.HOSTINGER_CONFIG);
    list.push(sharedTuiPath());
    if (this.userDataDir) list.push(path.join(this.userDataDir, 'config.json'));
    return list;
  }
  load() {
    for (const p of this.candidatePaths()) {
      try {
        this.data = deepMerge(DEFAULTS, JSON.parse(fs.readFileSync(p, 'utf8')));
        this.loadedFrom = p; this.writePath = p; break;
      } catch { /* next */ }
    }
  }
  get token() {
    const env = (process.env.HOSTINGER_TOKEN || '').trim();
    if (env) return env;
    return (this.data.api && this.data.api.token || '').trim();
  }
  get baseURL() {
    const env = (process.env.HOSTINGER_API_BASE_URL || '').trim();
    if (env) return env;
    return (this.data.api && this.data.api.base_url || '').trim() || DEFAULT_BASE;
  }
  get ssh() { return this.data.ssh || DEFAULTS.ssh; }
  get sshByVM() { return this.data.ssh_by_vm || {}; }

  sshFor(vmID, hostname) {
    const out = { ...this.ssh };
    for (const k of [vmID, hostname]) {
      if (!k) continue;
      const ov = this.sshByVM[k];
      if (ov) {
        if (ov.user) out.user = ov.user;
        if (ov.port) out.port = ov.port;
        if (ov.identity_file) out.identity_file = ov.identity_file;
        if (ov.jump_host) out.jump_host = ov.jump_host;
        break;
      }
    }
    return out;
  }

  save(partial) {
    this.data = deepMerge(this.data, partial || {});
    fs.mkdirSync(path.dirname(this.writePath), { recursive: true });
    fs.writeFileSync(this.writePath, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    this.loadedFrom = this.writePath;
    return true;
  }
  publicView() {
    return {
      loadedFrom: this.loadedFrom, writePath: this.writePath,
      tokenSet: !!this.token, tokenFromEnv: !!(process.env.HOSTINGER_TOKEN || '').trim(),
      baseURL: this.baseURL, baseFromEnv: !!(process.env.HOSTINGER_API_BASE_URL || '').trim(),
      ssh: this.ssh,
    };
  }
}

module.exports = { ConfigStore, DEFAULT_BASE };
