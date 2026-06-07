'use strict';

/* ============================ DOM + utils ============================ */
function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  if (props) for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k === 'dataset') Object.assign(e.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k in e && k !== 'list') { try { e[k] = v; } catch { e.setAttribute(k, v); } }
    else e.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return e;
}
const $ = (s) => document.querySelector(s);
function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }

let busyCount = 0;
function setBusy(on) { busyCount += on ? 1 : -1; if (busyCount < 0) busyCount = 0; $('#busy').classList.toggle('hidden', busyCount === 0); }

async function apiCall(method, ...args) {
  setBusy(true);
  try {
    const res = await window.api.call(method, ...args);
    if (!res || res.ok === false) { const msg = (res && res.error) || 'request failed'; toast('Error', msg, 'err'); throw new Error(msg); }
    return res.data;
  } finally { setBusy(false); }
}
async function tryApi(method, ...args) { try { return await apiCall(method, ...args); } catch { return undefined; } }
async function call(promise) {
  setBusy(true);
  try { const res = await promise; if (!res || res.ok === false) { toast('Error', (res && res.error) || 'failed', 'err'); throw new Error('failed'); } return res.data; }
  finally { setBusy(false); }
}

function toast(title, body, kind = '') {
  const node = h('div', { class: 'toast ' + kind }, h('div', { class: 't-title' }, title), body ? h('div', { class: 't-body' }, body) : null);
  $('#toast-root').append(node);
  setTimeout(() => { node.style.opacity = '0'; setTimeout(() => node.remove(), 250); }, kind === 'err' ? 6000 : 3200);
}

function closeModal() { clear($('#modal-root')); }
function confirmDialog(title, body, { okLabel = 'Confirm', danger = true } = {}) {
  return new Promise((resolve) => {
    const done = (v) => { closeModal(); resolve(v); };
    $('#modal-root').append(h('div', { class: 'modal-backdrop', onclick: (e) => { if (e.target.classList.contains('modal-backdrop')) done(false); } },
      h('div', { class: 'modal' },
        h('div', { class: 'modal-head' }, title),
        body ? h('div', { class: 'modal-body' }, h('div', {}, body)) : null,
        h('div', { class: 'modal-foot' },
          h('button', { class: 'ghost', onclick: () => done(false) }, 'Cancel'),
          h('button', { class: danger ? 'danger' : 'primary', onclick: () => done(true) }, okLabel)))));
  });
}

function openForm({ title, sub, fields, submitLabel = 'Save', wide = false }) {
  return new Promise((resolve) => {
    const inputs = {};
    const done = (v) => { closeModal(); resolve(v); };
    const body = h('div', { class: 'modal-body' });
    for (const f of fields) {
      let input;
      if (f.type === 'textarea') { input = h('textarea', { class: 'mono', rows: f.rows || 3, placeholder: f.placeholder || '' }); input.value = f.value || ''; }
      else if (f.type === 'checkbox') { input = h('input', { type: 'checkbox' }); input.checked = !!f.value; }
      else if (f.type === 'select') { input = h('select', {}, ...(f.options || []).map((o) => h('option', { value: o.value, selected: o.value === f.value }, o.label))); }
      else if (f.type === 'checklist') {
        const set = new Set((f.value || []).map(String));
        input = h('div', { class: 'picker' });
        for (const o of (f.options || [])) {
          const cb = h('input', { type: 'checkbox' }); cb.checked = set.has(String(o.value));
          cb.addEventListener('change', () => { cb.checked ? set.add(String(o.value)) : set.delete(String(o.value)); });
          input.append(h('label', { class: 'pick' }, cb, h('span', {}, o.label)));
        }
        input._checklistSet = set;
      } else { input = h('input', { type: f.type || 'text', class: f.mono ? 'mono' : '', placeholder: f.placeholder || '' }); input.value = f.value != null ? f.value : ''; }
      inputs[f.name] = input;
      body.append(f.type === 'checkbox'
        ? h('div', { class: 'field' }, h('div', { class: 'checkrow' }, input, h('label', {}, f.label)), f.help && h('div', { class: 'help' }, f.help))
        : h('div', { class: 'field' }, h('label', {}, f.label), input, f.help && h('div', { class: 'help' }, f.help)));
    }
    const collect = () => {
      const out = {};
      for (const f of fields) {
        const i = inputs[f.name];
        if (f.type === 'checkbox') out[f.name] = i.checked;
        else if (f.type === 'number') out[f.name] = i.value.trim() === '' ? null : Number(i.value);
        else if (f.type === 'checklist') out[f.name] = (f.options || []).filter((o) => i._checklistSet.has(String(o.value))).map((o) => o.value);
        else out[f.name] = i.value;
      }
      return out;
    };
    const submit = () => done(collect());
    body.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.type !== 'checkbox') { e.preventDefault(); submit(); } });
    $('#modal-root').append(h('div', { class: 'modal-backdrop', onclick: (e) => { if (e.target.classList.contains('modal-backdrop')) done(null); } },
      h('div', { class: 'modal' + (wide ? ' wide' : '') },
        h('div', { class: 'modal-head' }, title, sub && h('span', { class: 'sub' }, sub)),
        body,
        h('div', { class: 'modal-foot' },
          h('button', { class: 'ghost', onclick: () => done(null) }, 'Cancel'),
          h('button', { class: 'primary', onclick: submit }, submitLabel)))));
    const first = body.querySelector('input,textarea,select'); if (first) first.focus();
  });
}

function modalPanel(title, contentNode, { wide = true } = {}) {
  return new Promise((resolve) => {
    const done = () => { closeModal(); resolve(); };
    $('#modal-root').append(h('div', { class: 'modal-backdrop', onclick: (e) => { if (e.target.classList.contains('modal-backdrop')) done(); } },
      h('div', { class: 'modal' + (wide ? ' wide' : '') },
        h('div', { class: 'modal-head' }, title),
        h('div', { class: 'modal-body' }, contentNode),
        h('div', { class: 'modal-foot' }, h('button', { class: 'primary', onclick: done }, 'Close')))));
  });
}

/* ============================ table ============================ */
function table(rows, columns, { onRow, empty = 'No items.' } = {}) {
  if (!rows || rows.length === 0) return h('div', { class: 'empty' }, empty);
  const thead = h('thead', {}, h('tr', {}, ...columns.map((c) => h('th', { class: c.cls }, c.label))));
  const tbody = h('tbody', {});
  for (const row of rows) {
    const tr = h('tr', { class: onRow ? 'selectable' : '' });
    for (const c of columns) {
      const val = c.render ? c.render(row) : row[c.key];
      const td = h('td', { class: c.cls });
      if (val && val.nodeType) td.append(val); else td.textContent = val == null ? '' : String(val);
      tr.append(td);
    }
    if (onRow) tr.addEventListener('click', (e) => { if (e.target.tagName !== 'BUTTON') onRow(row); });
    tbody.append(tr);
  }
  return h('div', { class: 'table-wrap' }, h('table', {}, thead, tbody));
}
function statusCell(s) { const v = (s || '').toLowerCase(); return h('span', { class: 'status ' + v }, s || '—'); }
function fmtTime(s) { if (!s) return '—'; return String(s).replace('T', ' ').slice(0, 19); }
function fmtBytes(n) { n = Number(n) || 0; if (!n) return '—'; const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; } return n.toFixed(1) + ' ' + u[i]; }
function fmtMB(mb) { mb = Number(mb) || 0; if (!mb) return '—'; return mb >= 1024 ? (mb / 1024).toFixed(mb % 1024 ? 1 : 0) + ' GB' : mb + ' MB'; }
function fmtMoneyCents(c, cur) { return ((Number(c) || 0) / 100).toFixed(2) + (cur ? ' ' + cur : ''); }
function kv(k, v) { return h('div', { style: 'display:contents' }, h('dt', {}, k), h('dd', {}, v == null || v === '' ? '—' : (v.nodeType ? v : String(v)))); }
function rawCard(raw) {
  if (!raw || !Object.keys(raw).length) return null;
  const pre = h('pre', { class: 'rawjson hidden' }, JSON.stringify(raw, null, 2));
  return h('div', { class: 'card' }, h('h3', {}, 'Raw'), h('span', { class: 'back-link', onclick: () => pre.classList.toggle('hidden') }, 'toggle raw API fields'), pre);
}
function mergeRow(row, fetched) {
  const out = { ...(fetched || {}) };
  for (const [k, v] of Object.entries(row || {})) {
    if (v == null || v === '' || v === 0) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  if (fetched && fetched.raw && Object.keys(fetched.raw).length) out.raw = fetched.raw;
  else if (row && row.raw) out.raw = row.raw;
  return out;
}

function infoCard(title, pairs) { const dl = h('dl', { class: 'kv' }); for (const [k, v] of pairs) dl.append(kv(k, v)); return h('div', { class: 'card' }, h('h3', {}, title), dl); }
function actionsCard(title, buttons) { return h('div', { class: 'card' }, h('h3', {}, title), h('div', { class: 'action-grid' }, ...buttons.filter(Boolean))); }
function btn(label, onclick, cls = 'sm') { return h('button', { class: cls, onclick }, label); }
function action(method, args, { confirm, okMsg, after } = {}) {
  return async () => {
    if (confirm && !(await confirmDialog(confirm.title, confirm.body))) return;
    if ((await tryApi(method, ...args)) !== undefined) { toast(okMsg || 'Done', null, 'ok'); if (after) after(); }
  };
}

/* ============================ app shell ============================ */
const App = { cfg: null, tab: 'dashboard' };
const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: '◧' },
  { id: 'vms', label: 'Virtual Machines', icon: '🖥' },
  { id: 'firewalls', label: 'Firewalls', icon: '🛡' },
  { id: 'pubkeys', label: 'Public Keys', icon: '🔑' },
  { id: 'billing', label: 'Billing', icon: '💳' },
  { id: 'ops', label: 'Ops log', icon: '📜' },
];
function renderSidebar() {
  const ul = clear($('#tablist'));
  for (const t of TABS) ul.append(h('li', { class: t.id === App.tab ? 'active' : '', onclick: () => switchTab(t.id) }, h('span', {}, t.icon), h('span', {}, t.label)));
}
function crumb(main, sub) { const c = clear($('#crumb')); c.append(h('span', {}, main)); if (sub) c.append(h('span', { class: 'sub' }, '— ' + sub)); }
function switchTab(id) { App.tab = id; renderSidebar(); renderTab(); }
function backLink(toTab) { return h('div', { class: 'back-link', onclick: () => switchTab(toTab) }, '← back'); }

const VIEWS = {};
async function renderTab() {
  const view = clear($('#view'));
  if (!App.cfg.tokenSet) view.append(tokenBanner());
  const fn = VIEWS[App.tab];
  if (fn) { try { await fn(view); } catch (e) { view.append(h('div', { class: 'empty' }, 'Failed: ' + e.message)); } }
}
function tokenBanner() {
  return h('div', { class: 'banner' }, 'No Hostinger API token configured. ',
    h('a', { onclick: openSettings }, 'Open Settings'), ' to add one (or set HOSTINGER_TOKEN).');
}

/* ============================ DASHBOARD ============================ */
VIEWS.dashboard = async function (view) {
  crumb('Dashboard');
  const [vms, fws, keys, subs] = await Promise.all([
    tryApi('listVMs'), tryApi('listFirewalls'), tryApi('listPublicKeys'), tryApi('listSubscriptions'),
  ]);
  const n = (a) => (Array.isArray(a) ? a.length : '—');
  const running = Array.isArray(vms) ? vms.filter((v) => v.state === 'running').length : '—';
  view.append(h('div', { class: 'detail' },
    infoCard('Overview', [
      ['Virtual machines', n(vms)], ['Running', running], ['Firewall groups', n(fws)],
      ['Public keys', n(keys)], ['Subscriptions', n(subs)]])));
};

/* ============================ VIRTUAL MACHINES ============================ */
VIEWS.vms = (view) => {
  crumb('Virtual Machines');
  return apiCall('listVMs').then((rows) => {
    view.append(h('div', { class: 'toolbar' }, h('span', { class: 'hint' }, 'Click a VM for details, power & lifecycle actions')));
    view.append(table(rows, [
      { key: 'id', label: 'ID', cls: 'mono' },
      { key: 'hostname', label: 'Hostname' },
      { label: 'State', render: (r) => statusCell(r.state) },
      { key: 'ip', label: 'IPv4', cls: 'mono' },
      { key: 'plan', label: 'Plan' },
      { label: 'vCPU', cls: 'num', render: (r) => r.vcpu || '—' },
      { label: 'RAM', cls: 'num', render: (r) => fmtMB(r.ramMB) },
      { label: 'Region', render: (r) => r.region || r.dataCenterID || '—' },
    ], { onRow: (r) => vmDetails(r.id, r), empty: 'No virtual machines.' }));
  });
};

async function vmDetails(id, row) {
  const view = clear($('#view')); crumb('VM', id);
  const v = mergeRow(row, await apiCall('getVM', id));
  const refresh = () => vmDetails(id, row);
  const ptrID = (v.ipv4 && v.ipv4[0] && v.ipv4[0].id) || 0;

  view.append(backLink('vms'),
    h('div', { class: 'detail' },
      infoCard(v.hostname || ('VM ' + id), [
        ['ID', v.id], ['State', statusCell(v.state)], ['IPv4', (v.ipv4 || []).map((x) => x.address).join(', ') || v.ip],
        ['IPv6', (v.ipv6 || []).map((x) => x.address).join(', ')], ['Plan', v.plan],
        ['vCPU', v.vcpu], ['RAM', fmtMB(v.ramMB)], ['Disk', fmtMB(v.diskMB)], ['Bandwidth', fmtMB(v.bandwidthMB)],
        ['Template', v.template || v.templateID], ['Region', v.region || v.dataCenterID],
        ['Nameservers', [v.ns1, v.ns2].filter(Boolean).join(', ')], ['Created', fmtTime(v.createdAt)]]),
      actionsCard('Power', [
        btn('Start', action('startVM', [id], { okMsg: 'Starting', after: refresh })),
        btn('Stop', action('stopVM', [id], { confirm: { title: 'Stop VM?', body: id }, okMsg: 'Stopping', after: refresh })),
        btn('Restart', action('restartVM', [id], { confirm: { title: 'Restart VM?', body: id }, okMsg: 'Restarting', after: refresh })),
        btn('Start recovery', async () => { const f = await openForm({ title: 'Start recovery mode', sub: id, submitLabel: 'Start', fields: [{ name: 'pw', label: 'Temporary root password', type: 'password' }] }); if (f && (await tryApi('startRecovery', id, f.pw)) !== undefined) { toast('Recovery starting', null, 'ok'); refresh(); } }),
        btn('Stop recovery', action('stopRecovery', [id], { okMsg: 'Leaving recovery', after: refresh })),
      ]),
      actionsCard('Manage', [
        btn('Set hostname', async () => { const f = await openForm({ title: 'Set hostname', fields: [{ name: 'h', label: 'Hostname', value: v.hostname }] }); if (f && (await tryApi('setHostname', id, f.h)) !== undefined) { toast('Hostname set', null, 'ok'); refresh(); } }),
        btn('Reset hostname', action('resetHostname', [id], { confirm: { title: 'Reset hostname?', body: id }, okMsg: 'Hostname reset', after: refresh })),
        btn('Set root password', async () => { const f = await openForm({ title: 'Set root password', fields: [{ name: 'p', label: 'New root password', type: 'password' }] }); if (f && (await tryApi('setRootPassword', id, f.p)) !== undefined) toast('Root password set', null, 'ok'); }),
        btn('Nameservers', async () => { const f = await openForm({ title: 'Update nameservers', submitLabel: 'Save', fields: [{ name: 'ns1', label: 'NS1', value: v.ns1 }, { name: 'ns2', label: 'NS2', value: v.ns2 }, { name: 'ns3', label: 'NS3 (optional)' }] }); if (f && (await tryApi('updateNameservers', id, f.ns1, f.ns2, f.ns3)) !== undefined) { toast('Nameservers updated', null, 'ok'); refresh(); } }),
        btn('Set PTR', async () => { if (!ptrID) { toast('No IPv4 address ID', null); return; } const f = await openForm({ title: 'Set reverse DNS (PTR)', sub: (v.ipv4[0] && v.ipv4[0].address) || '', fields: [{ name: 'domain', label: 'Domain' }] }); if (f && (await tryApi('setPTR', id, ptrID, f.domain)) !== undefined) toast('PTR set', null, 'ok'); }),
        btn('Delete PTR', async () => { if (!ptrID) { toast('No IPv4 address ID', null); return; } if (!(await confirmDialog('Delete PTR?', (v.ipv4[0] && v.ipv4[0].address) || ''))) return; if ((await tryApi('deletePTR', id, ptrID)) !== undefined) toast('PTR deleted', null, 'ok'); }),
        btn('Recreate OS', () => recreateModal(id, refresh)),
      ]),
      actionsCard('Data', [
        btn('Snapshot', () => snapshotModal(id)),
        btn('Backups', () => backupsModal(id)),
        btn('Metrics', () => metricsModal(id, v.hostname)),
        btn('Public keys', () => vmKeysModal(id)),
        btn('Docker', () => dockerModal(id, v.hostname)),
        btn('Actions log', async () => { const rows = (await tryApi('listActions', id)) || []; modalPanel('Actions — ' + id, table(rows, [{ key: 'id', label: 'ID', cls: 'mono' }, { key: 'name', label: 'Name' }, { label: 'State', render: (r) => statusCell(r.state) }, { label: 'Created', cls: 'mono', render: (r) => fmtTime(r.createdAt) }, { label: 'Updated', cls: 'mono', render: (r) => fmtTime(r.updatedAt) }], { empty: 'No actions.' })); }),
        sshButton(id, v.ip),
      ]),
      rawCard(v.raw)));
}

function sshButton(vmID, host) {
  return btn('Copy SSH cmd', async () => {
    if (!host) { toast('No IP/host', null); return; }
    const cmd = await call(window.api.ssh.command(vmID, host));
    window.api.util.copy(cmd); toast('Copied SSH command', cmd, 'ok');
  });
}

async function recreateModal(id, after) {
  const tpls = (await tryApi('listTemplates')) || [];
  const f = await openForm({ title: 'Recreate VM (reinstall OS)', sub: id + ' — DESTROYS all data', submitLabel: 'Recreate',
    fields: [
      { name: 'tpl', label: 'OS template', type: tpls.length ? 'select' : 'number', options: tpls.map((t) => ({ value: String(t.id), label: `${t.name} (${t.id})` })) },
      { name: 'pw', label: 'Root password (optional)', type: 'password' },
    ] });
  if (!f) return;
  if (!(await confirmDialog('Recreate VM?', 'ALL data on ' + id + ' will be lost.'))) return;
  if ((await tryApi('recreateVM', id, Number(f.tpl), f.pw)) !== undefined) { toast('Recreate started', null, 'ok'); if (after) after(); }
}

async function snapshotModal(id) {
  const snap = await tryApi('getSnapshot', id); // null if none
  const body = h('div', {});
  if (snap && snap.id) {
    body.append(infoCard('Current snapshot', [['ID', snap.id], ['Created', fmtTime(snap.createdAt)], ['Expires', fmtTime(snap.expiresAt)], ['Restore (s)', snap.restoreSeconds]]),
      h('div', { class: 'toolbar' },
        btn('Restore', action('restoreSnapshot', [id], { confirm: { title: 'Restore snapshot?', body: 'Reverts the VM to this snapshot.' }, okMsg: 'Restoring', after: closeModal })),
        btn('Delete', async () => { if (!(await confirmDialog('Delete snapshot?', id))) return; if ((await tryApi('deleteSnapshot', id)) !== undefined) { toast('Deleted', null, 'ok'); closeModal(); } }, 'sm danger'),
        btn('Recreate (overwrite)', action('createSnapshot', [id], { confirm: { title: 'Overwrite snapshot?', body: 'Replaces the existing snapshot.' }, okMsg: 'Snapshot started', after: closeModal }))));
  } else {
    body.append(h('div', { class: 'empty' }, 'No snapshot exists for this VM.'),
      h('div', { class: 'toolbar' }, h('button', { class: 'primary', onclick: action('createSnapshot', [id], { okMsg: 'Snapshot started', after: closeModal }) }, '+ Create snapshot')));
  }
  modalPanel('Snapshot — ' + id, body);
}

async function backupsModal(id) {
  const rows = (await tryApi('listBackups', id)) || [];
  modalPanel('Backups — ' + id, table(rows, [
    { key: 'id', label: 'ID', cls: 'mono' },
    { label: 'Size', cls: 'num', render: (r) => fmtBytes((r.sizeKB || 0) * 1024) },
    { key: 'location', label: 'Location' },
    { label: 'Created', cls: 'mono', render: (r) => fmtTime(r.createdAt) },
    { label: '', cls: 'actions', render: (r) => btn('Restore', action('restoreBackup', [id, r.id], { confirm: { title: 'Restore backup?', body: 'Overwrites current VM state with backup #' + r.id }, okMsg: 'Restoring', after: closeModal })) },
  ], { empty: 'No backups.' }));
}

async function metricsModal(id, host) {
  const to = new Date();
  const from = new Date(to.getTime() - 24 * 3600 * 1000);
  const m = await tryApi('getMetrics', id, from.toISOString(), to.toISOString());
  if (!m) { modalPanel('Metrics — ' + id, h('div', { class: 'empty' }, 'No metrics.')); return; }
  modalPanel('Metrics (last 24h) — ' + (host || id),
    infoCard('Latest samples', [
      ['CPU', (m.cpuPercent || 0).toFixed(1) + ' %'], ['RAM', fmtBytes(m.ramBytes)], ['Disk', fmtBytes(m.diskBytes)],
      ['Incoming', fmtBytes(m.incomingBytes)], ['Outgoing', fmtBytes(m.outgoingBytes)],
      ['Uptime', m.uptimeMS ? (m.uptimeMS / 3600000).toFixed(1) + ' h' : '—'], ['Sample at', fmtTime(m.lastSampleAt)]]));
}

async function vmKeysModal(id) {
  const attached = (await tryApi('listVMPublicKeys', id)) || [];
  const body = h('div', {},
    h('div', { class: 'toolbar' }, h('button', { class: 'primary', onclick: async () => {
      const all = (await tryApi('listPublicKeys')) || [];
      if (!all.length) { toast('No stored keys — add some in Public Keys tab', null); return; }
      const f = await openForm({ title: 'Attach public keys', sub: 'VM ' + id, submitLabel: 'Attach',
        fields: [{ name: 'ids', label: 'Keys', type: 'checklist', value: attached.map((k) => k.id), options: all.map((k) => ({ value: k.id, label: `${k.name} (${k.id})` })) }] });
      if (!f) return;
      if ((await tryApi('attachPublicKeys', id, (f.ids || []).map(Number))) !== undefined) { toast('Keys attached', null, 'ok'); closeModal(); vmKeysModal(id); }
    } }, '+ Attach keys')),
    table(attached, [{ key: 'id', label: 'ID', cls: 'mono' }, { key: 'name', label: 'Name' }], { empty: 'No keys attached.' }));
  modalPanel('Public keys — VM ' + id, body);
}

async function dockerModal(id, host) {
  const rows = (await tryApi('listDockerProjects', id)) || [];
  const body = h('div', {}, table(rows, [
    { key: 'name', label: 'Project' },
    { label: 'State', render: (r) => statusCell(r.state) },
    { key: 'services', label: 'Services', cls: 'num' },
    { label: '', cls: 'actions', render: (r) => h('span', {},
      btn('Start', action('startDockerProject', [id, r.name], { okMsg: 'Starting', after: () => { closeModal(); dockerModal(id, host); } })),
      btn('Stop', action('stopDockerProject', [id, r.name], { okMsg: 'Stopping', after: () => { closeModal(); dockerModal(id, host); } })),
      btn('Restart', action('restartDockerProject', [id, r.name], { okMsg: 'Restarting' })),
      btn('Update', action('updateDockerProject', [id, r.name], { okMsg: 'Updating' })),
      btn('Containers', async () => { const cs = (await tryApi('listDockerContainers', id, r.name)) || []; modalPanel('Containers — ' + r.name, table(cs, [{ key: 'name', label: 'Name' }, { key: 'image', label: 'Image', cls: 'mono' }, { label: 'State', render: (x) => statusCell(x.state) }, { key: 'status', label: 'Status' }, { label: 'Ports', cls: 'mono', render: (x) => (x.ports || []).join(', ') }], { empty: 'No containers.' })); }),
      btn('Logs', async () => { const lines = (await tryApi('getDockerLogs', id, r.name)) || []; modalPanel('Logs — ' + r.name, h('pre', { class: 'rawjson' }, lines.join('\n') || '(empty)')); }),
      btn('Down', action('downDockerProject', [id, r.name], { confirm: { title: 'Bring project down?', body: r.name }, okMsg: 'Down', after: () => { closeModal(); dockerModal(id, host); } }), 'sm danger')) },
  ], { empty: 'No Docker projects on this VM.' }));
  modalPanel('Docker — ' + (host || id), body);
}

/* ============================ FIREWALLS ============================ */
VIEWS.firewalls = async function (view) {
  crumb('Firewalls');
  view.append(h('div', { class: 'toolbar' }, h('button', { class: 'primary', onclick: async () => {
    const f = await openForm({ title: 'Create firewall group', submitLabel: 'Create', fields: [{ name: 'name', label: 'Name', placeholder: 'web-fw' }] });
    if (f && (await tryApi('createFirewall', f.name)) !== undefined) { toast('Firewall created', f.name, 'ok'); renderTab(); }
  } }, '+ Create firewall')));
  const rows = await apiCall('listFirewalls');
  view.append(table(rows, [
    { key: 'id', label: 'ID', cls: 'mono' }, { key: 'name', label: 'Name' },
    { label: 'Synced', render: (r) => (r.isSynced ? 'yes' : 'no') }, { label: 'Rules', cls: 'num', render: (r) => (r.rules || []).length },
  ], { onRow: (r) => firewallDetails(r.id), empty: 'No firewall groups.' }));
};
async function firewallDetails(id) {
  const view = clear($('#view')); crumb('Firewalls', id);
  const g = await apiCall('getFirewall', id);
  const refresh = () => firewallDetails(id);
  view.append(backLink('firewalls'),
    h('div', { class: 'detail' },
      infoCard(g.name || ('Firewall ' + id), [['ID', g.id], ['Synced', g.isSynced ? 'yes' : 'no'], ['Created', fmtTime(g.createdAt)]]),
      h('div', { class: 'card' }, h('h3', {}, 'Rules'),
        table(g.rules || [], [
          { key: 'protocol', label: 'Proto' }, { key: 'port', label: 'Port', cls: 'mono' }, { key: 'source', label: 'Source' },
          { key: 'sourceDetail', label: 'Source detail', cls: 'mono' }, { key: 'action', label: 'Action' },
          { label: '', cls: 'actions', render: (r) => btn('Delete', async () => { if (!(await confirmDialog('Delete rule?', `${r.protocol} ${r.port}`))) return; if ((await tryApi('deleteFirewallRule', id, r.id)) !== undefined) { toast('Deleted', null, 'ok'); refresh(); } }, 'sm danger') },
        ], { empty: 'No rules.' })),
      actionsCard('Manage', [
        btn('Add rule', async () => {
          const f = await openForm({ title: 'Add firewall rule', wide: true, submitLabel: 'Add', fields: [
            { name: 'protocol', label: 'Protocol', type: 'select', options: ['TCP', 'UDP', 'ICMP', 'GRE', 'ESP', 'AH'].map((p) => ({ value: p, label: p })) },
            { name: 'port', label: 'Port', placeholder: '22 / 80-443 / any' },
            { name: 'source', label: 'Source', type: 'select', options: [{ value: 'any', label: 'anywhere (any)' }, { value: 'custom', label: 'custom CIDR' }] },
            { name: 'detail', label: 'Source detail (CIDR, if custom)', placeholder: '203.0.113.0/24' },
          ] });
          if (!f) return;
          if ((await tryApi('createFirewallRule', id, f.protocol, f.port, f.source, f.detail)) !== undefined) { toast('Rule added', null, 'ok'); refresh(); }
        }),
        btn('Attach to VM', async () => { const vms = (await tryApi('listVMs')) || []; const f = await openForm({ title: 'Attach firewall to VM', fields: [{ name: 'vm', label: 'VM', type: 'select', options: vms.map((v) => ({ value: v.id, label: `${v.hostname} (${v.id})` })) }] }); if (f && (await tryApi('attachFirewall', id, f.vm)) !== undefined) toast('Attached', null, 'ok'); }),
        btn('Detach from VM', async () => { const vms = (await tryApi('listVMs')) || []; const f = await openForm({ title: 'Detach firewall from VM', fields: [{ name: 'vm', label: 'VM', type: 'select', options: vms.map((v) => ({ value: v.id, label: `${v.hostname} (${v.id})` })) }] }); if (f && (await tryApi('detachFirewall', id, f.vm)) !== undefined) toast('Detached', null, 'ok'); }),
        btn('Delete firewall', async () => { if (!(await confirmDialog('Delete firewall?', g.name))) return; if ((await tryApi('deleteFirewall', id)) !== undefined) { toast('Deleted', g.name, 'ok'); switchTab('firewalls'); } }, 'sm danger'),
      ]),
      rawCard(g.raw)));
}

/* ============================ PUBLIC KEYS ============================ */
VIEWS.pubkeys = async function (view) {
  crumb('Public Keys');
  view.append(h('div', { class: 'toolbar' }, h('button', { class: 'primary', onclick: async () => {
    const f = await openForm({ title: 'Add public key', wide: true, submitLabel: 'Add', fields: [{ name: 'name', label: 'Name', placeholder: 'my-laptop' }, { name: 'key', label: 'Public key', type: 'textarea', rows: 4, placeholder: 'ssh-ed25519 AAAA… user@host' }] });
    if (f && (await tryApi('createPublicKey', f.name, f.key)) !== undefined) { toast('Key added', f.name, 'ok'); renderTab(); }
  } }, '+ Add public key')));
  const rows = await apiCall('listPublicKeys');
  view.append(table(rows, [
    { key: 'id', label: 'ID', cls: 'mono' }, { key: 'name', label: 'Name' },
    { label: 'Key', cls: 'mono', render: (r) => (r.key || '').slice(0, 48) + ((r.key || '').length > 48 ? '…' : '') },
    { label: '', cls: 'actions', render: (r) => btn('Delete', async () => { if (!(await confirmDialog('Delete key?', r.name))) return; if ((await tryApi('deletePublicKey', r.id)) !== undefined) { toast('Deleted', r.name, 'ok'); renderTab(); } }, 'sm danger') },
  ], { empty: 'No public keys.' }));
};

/* ============================ BILLING ============================ */
VIEWS.billing = async function (view) {
  crumb('Billing');
  view.append(h('div', { class: 'toolbar' }, h('button', { class: 'sm', onclick: async () => { const pms = (await tryApi('listPaymentMethods')) || []; modalPanel('Payment methods', table(pms, [{ key: 'name', label: 'Name' }, { key: 'paymentMethod', label: 'Type' }, { key: 'identifier', label: 'Identifier', cls: 'mono' }, { label: 'Default', render: (r) => (r.isDefault ? 'yes' : '—') }, { label: 'Expired', render: (r) => (r.isExpired ? 'yes' : '—') }], { empty: 'No payment methods.' })); } }, 'Payment methods')));
  const rows = await apiCall('listSubscriptions');
  view.append(table(rows, [
    { key: 'name', label: 'Subscription' }, { label: 'Status', render: (r) => statusCell(r.status) },
    { label: 'Renewal', cls: 'num', render: (r) => fmtMoneyCents(r.renewalPrice, r.currencyCode) },
    { label: 'Period', render: (r) => `${r.billingPeriod} ${r.billingPeriodUnit}` },
    { label: 'Auto-renew', render: (r) => (r.isAutoRenewed ? 'on' : 'off') },
    { label: 'Next billing', cls: 'mono', render: (r) => fmtTime(r.nextBillingAt) },
    { label: '', cls: 'actions', render: (r) => r.isAutoRenewed
      ? btn('Disable renew', async () => { if (!(await confirmDialog('Disable auto-renewal?', r.name))) return; if ((await tryApi('disableAutoRenewal', r.id)) !== undefined) { toast('Auto-renew off', null, 'ok'); renderTab(); } })
      : btn('Enable renew', async () => { if ((await tryApi('enableAutoRenewal', r.id)) !== undefined) { toast('Auto-renew on', null, 'ok'); renderTab(); } }) },
  ], { empty: 'No subscriptions.' }));
};

/* ============================ OPS LOG ============================ */
VIEWS.ops = async function (view) {
  crumb('Ops log', 'session-local · last 200');
  const rows = await call(window.api.ops.list());
  view.append(table(rows, [
    { label: 'Time', cls: 'mono', render: (r) => new Date(r.ts).toLocaleTimeString() },
    { key: 'kind', label: 'Action', cls: 'mono' }, { key: 'target', label: 'Target', cls: 'mono' },
    { label: 'Result', render: (r) => r.result === 'ok' ? h('span', { class: 'status active' }, 'ok') : h('span', { class: 'status errored' }, r.result) },
  ], { empty: 'No actions yet this session.' }));
};

/* ============================ Settings ============================ */
async function openSettings() {
  const c = App.cfg;
  const f = await openForm({
    title: 'Settings', sub: c.loadedFrom ? ('config: ' + c.writePath) : ('will write to ' + c.writePath), wide: true, submitLabel: 'Save',
    fields: [
      { name: 'token', label: 'Hostinger API token', type: 'password', mono: true, placeholder: c.tokenSet ? '•••••• (set — blank to keep)' : 'Bearer token', help: c.tokenFromEnv ? 'Currently overridden by HOSTINGER_TOKEN.' : 'From hPanel → Account → API. Stored locally.' },
      { name: 'base', label: 'API base URL', value: c.baseURL, help: c.baseFromEnv ? 'Overridden by HOSTINGER_API_BASE_URL.' : '' },
      { name: 'ssh_user', label: 'Default SSH user', value: c.ssh.user || 'root' },
      { name: 'ssh_port', label: 'Default SSH port', type: 'number', value: c.ssh.port || 22 },
      { name: 'ssh_id', label: 'SSH identity file', value: c.ssh.identity_file || '' },
    ],
  });
  if (!f) return;
  const partial = { api: { base_url: f.base }, ssh: { user: f.ssh_user, port: Number(f.ssh_port) || 22, identity_file: f.ssh_id } };
  if (f.token && f.token.trim()) partial.api.token = f.token.trim();
  App.cfg = await call(window.api.config.save(partial));
  toast('Settings saved', null, 'ok');
  renderTab();
}

/* ============================ boot ============================ */
async function boot() {
  App.cfg = await call(window.api.config.get());
  renderSidebar();
  await renderTab();
  $('#btn-refresh').addEventListener('click', () => renderTab());
  $('#btn-settings').addEventListener('click', openSettings);
  window.api.on('refresh', () => renderTab());
  window.api.on('open-settings', openSettings);
}
boot();
