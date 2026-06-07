# hostinger-electron

A cross-platform **desktop** app for managing [Hostinger](https://hostinger.com)
VPS — virtual machines (power, recovery, recreate, hostname, PTR, nameservers),
snapshots, backups, metrics, firewalls, public keys, Docker projects, and
billing — plus a session-local ops log of every mutating action.

This is an [Electron](https://www.electronjs.org/) port of
[`hostinger-tui`](https://github.com/nexusriot/hostinger-tui) (the Go Bubble Tea
terminal UI). Same Hostinger API surface, same shape-tolerant decoding, same
OpenAPI-aligned quirks — exposed through a windowed GUI and shipped as `.deb`
packages and an AppImage.

---

## Tabs

| Tab | What's there |
|---|---|
| **Dashboard** | VM / running / firewall / key / subscription counts |
| **Virtual Machines** | list + details; start/stop/restart, recovery mode, recreate OS, set/reset hostname, set root password, nameservers, PTR (set/delete on primary IPv4), snapshot (one per VM), backups (restore), metrics (24h), public-key attach, Docker projects, actions log, copy SSH command |
| **Firewalls** | groups (create/delete), rules (add/delete), attach/detach to a VM |
| **Public Keys** | list, add, delete |
| **Billing** | subscriptions (toggle auto-renewal) + payment methods |
| **Ops log** | every mutating action this session performed |

### Faithful to the API's quirks (same as the TUI)

- Base URL is **`https://developers.hostinger.com`** (not api.hostinger.com).
- VM uses **`state`** (not `status`); **`memory`/`disk` are MB**.
- The snapshot endpoint is **singular** — one snapshot per VM (404 ⇒ "none").
- Hostname and root-password use **PUT**; recreate needs an integer `template_id`.
- PTR endpoints take the **IPv4 address ID** (from the VM's `ipv4[]`), not the raw IP.
- Metrics needs `date_from`/`date_to` and returns time-bucketed series; the app
  reduces each to its latest sample (CPU %, RAM/disk/traffic bytes, uptime).
- Responses are decoded **shape-tolerantly** (bare array or `{data:[…]}`;
  single objects flat or under `data`), and transient `429`/`5xx` are retried
  (3 attempts, exponential backoff) — exactly like the Go client.

---

## Architecture

```
src/main.js             Electron main: window, menu, ops log, one generic IPC
                        dispatcher (h:call) + config/ssh/util channels
src/hostinger-client.js HostingerClient — JS port of the Go client. ~50 methods
                        over developers.hostinger.com. The ONLY network seam.
src/config.js           config store; reads/writes the SAME file as the Go TUI
                        (~/.config/hostinger-tui/config.json), env overrides
src/preload.js          contextBridge: window.api.call(method, ...args) + helpers
renderer/               the UI (no framework): index.html + styles.css + renderer.js
```

- ~50 client methods are reached through a **single validated dispatcher**
  (`api.call('listVMs')`, `api.call('getVM', id)`, …); `main.js` resolves the
  method on the client (rejecting private/unknown names) and records mutations
  in the ops log.
- **contextIsolation on**, `nodeIntegration` off, strict CSP. Plain-DOM
  renderer via a tiny `h()` helper, with shared `table()`, `openForm()`
  (incl. a `checklist` field type), `confirmDialog()`, `modalPanel()`, `toast()`.

---

## Configuration

Reads the **same** JSON the Go TUI uses, so both stay in sync:

- `$HOSTINGER_CONFIG` (if set)
- `$XDG_CONFIG_HOME/hostinger-tui/config.json` or `~/.config/hostinger-tui/config.json`
- `<userData>/config.json` (fallback)

Env overrides (win over the file): `HOSTINGER_TOKEN`, `HOSTINGER_API_BASE_URL`.

```jsonc
{
  "api": { "token": "…", "base_url": "https://developers.hostinger.com" },
  "ssh": { "user": "root", "port": 22, "identity_file": "~/.ssh/id_ed25519" },
  "ssh_by_vm": { "12345": { "user": "root", "port": 2222 } }
}
```

Open **⚙ Settings** (or `Ctrl+,`) and paste your token from
hPanel → Account → API. The per-VM `ssh_by_vm` overrides drive the **Copy SSH
command** button on VM details.

---

## Develop / run / build

```sh
make install      # npm install (downloads Electron + electron-builder)
make run          # launch the app
make dev          # launch with devtools open

make deb          # .deb for host arch              -> dist/
make deb-amd64    # / deb-arm64 / deb-armhf
make debs         # all three arches
make appimage     # portable AppImage
make dist         # deb + AppImage
```

…or `./build-deb.sh [amd64|arm64|armhf]`. Install with
`sudo apt install ./dist/hostinger-electron_0.1.0_amd64.deb`.

## License

MIT.
