'use strict';

// Hostinger API client — a JS port of the Go `internal/hostinger` package.
// Same shape-tolerant decoders, same OpenAPI-aligned endpoints and quirks
// (VM uses `state`; memory/disk are MB; snapshot is singular per VM; hostname /
// root-password use PUT; PTR needs the IPv4 address ID; metrics needs
// date_from/date_to). Bearer auth; retries on 429/5xx. Only network seam.

const DEFAULT_BASE = 'https://developers.hostinger.com';

class HError extends Error {
  constructor(message, status, method, path) {
    super(message);
    this.name = 'HError';
    this.status = status; this.method = method; this.path = path;
  }
}

class HostingerClient {
  constructor({ tokenProvider, baseURLProvider }) {
    this._token = tokenProvider;
    this._base = baseURLProvider;
  }
  get token() { return (this._token() || '').trim(); }
  get baseURL() { return ((this._base() || '').trim() || DEFAULT_BASE).replace(/\/+$/, ''); }

  async _do(method, path, body) {
    const token = this.token;
    if (!token) throw new HError('Hostinger API token is empty', 0, method, path);
    const url = this.baseURL + path;
    const headers = { Authorization: 'Bearer ' + token, Accept: 'application/json' };
    const opts = { method, headers };
    if (body !== undefined && body !== null) {
      headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const maxRetries = 3;
    let lastErr = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      if (attempt > 0) await sleep(500 * (1 << (attempt - 1)));
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 20000);
      opts.signal = ctrl.signal;
      let resp;
      try { resp = await fetch(url, opts); }
      catch (e) { clearTimeout(timer); lastErr = new HError('http: ' + e.message, 0, method, path); continue; }
      clearTimeout(timer);
      const text = await resp.text();
      if (resp.status < 200 || resp.status >= 300) {
        const err = new HError(`api ${method} ${path} => ${resp.status}: ${text.trim().slice(0, 300)}`, resp.status, method, path);
        if (resp.status === 429 || resp.status >= 500) { lastErr = err; continue; }
        throw err;
      }
      if (!text) return null;
      try { return JSON.parse(text); } catch { return text; }
    }
    throw lastErr || new HError('request failed', 0, method, path);
  }

  // ===== Virtual machines =====
  async listVMs() { return (await this._listPaged('/api/vps/v1/virtual-machines')).map(decodeVM); }
  async getVM(id) { return decodeSingle(await this._do('GET', '/api/vps/v1/virtual-machines/' + id), decodeVM); }
  async startVM(id) { return decodeAction(await this._do('POST', `/api/vps/v1/virtual-machines/${id}/start`)); }
  async stopVM(id) { return decodeAction(await this._do('POST', `/api/vps/v1/virtual-machines/${id}/stop`)); }
  async restartVM(id) { return decodeAction(await this._do('POST', `/api/vps/v1/virtual-machines/${id}/restart`)); }
  async startRecovery(id, rootPassword) { return decodeAction(await this._do('POST', `/api/vps/v1/virtual-machines/${id}/recovery`, { root_password: rootPassword })); }
  async stopRecovery(id) { return decodeAction(await this._do('DELETE', `/api/vps/v1/virtual-machines/${id}/recovery`)); }
  async recreateVM(id, templateID, password) {
    const body = { template_id: Number(templateID) };
    if (password) body.password = password;
    return decodeAction(await this._do('POST', `/api/vps/v1/virtual-machines/${id}/recreate`, body));
  }
  setRootPassword(id, password) { return this._do('PUT', `/api/vps/v1/virtual-machines/${id}/root-password`, { password }); }
  setHostname(id, hostname) { return this._do('PUT', `/api/vps/v1/virtual-machines/${id}/hostname`, { hostname }); }
  resetHostname(id) { return this._do('DELETE', `/api/vps/v1/virtual-machines/${id}/hostname`); }
  setPTR(id, ipAddressID, domain) { return this._do('POST', `/api/vps/v1/virtual-machines/${id}/ptr/${ipAddressID}`, { domain }); }
  deletePTR(id, ipAddressID) { return this._do('DELETE', `/api/vps/v1/virtual-machines/${id}/ptr/${ipAddressID}`); }
  async updateNameservers(id, ns1, ns2, ns3) {
    const body = { ns1, ns2 };
    if (ns3) body.ns3 = ns3;
    return decodeAction(await this._do('PUT', `/api/vps/v1/virtual-machines/${id}/nameservers`, body));
  }
  setPanelPassword(id, password) { return this._do('PUT', `/api/vps/v1/virtual-machines/${id}/panel-password`, { password }); }
  // purchaseVM SPENDS REAL MONEY. setup = {templateID, dataCenterID, postInstallScriptID?, password?, hostname?, installMonarx?, enableBackups?, ns1?, ns2?}
  async purchaseVM(itemID, paymentMethodID, setup) {
    const body = { item_id: itemID, setup: vmSetupBody(setup) };
    if (paymentMethodID) body.payment_method_id = Number(paymentMethodID);
    const r = await this._do('POST', '/api/vps/v1/virtual-machines', body);
    return isObj(r) && isObj(r.data) ? r.data : asObj(r);
  }
  // setupVM provisions an already-purchased (unconfigured) VM.
  async setupVM(id, setup) { return decodeAction(await this._do('POST', `/api/vps/v1/virtual-machines/${id}/setup`, vmSetupBody(setup))); }

  // snapshot (singular, one per VM) — returns null if none (404)
  async getSnapshot(vmID) {
    let resp;
    try { resp = await this._do('GET', `/api/vps/v1/virtual-machines/${vmID}/snapshot`); }
    catch (e) { if (e.status === 404) return null; throw e; }
    return decodeSingle(resp, decodeSnapshot);
  }
  createSnapshot(vmID) { return this._do('POST', `/api/vps/v1/virtual-machines/${vmID}/snapshot`); }
  deleteSnapshot(vmID) { return this._do('DELETE', `/api/vps/v1/virtual-machines/${vmID}/snapshot`); }
  async restoreSnapshot(vmID) { return decodeAction(await this._do('POST', `/api/vps/v1/virtual-machines/${vmID}/snapshot/restore`)); }

  // backups
  async listBackups(vmID) { return extractItems(await this._do('GET', `/api/vps/v1/virtual-machines/${vmID}/backups`)).map(decodeBackup); }
  async restoreBackup(vmID, backupID) { return decodeAction(await this._do('POST', `/api/vps/v1/virtual-machines/${vmID}/backups/${backupID}/restore`)); }

  // metrics — from/to are ISO strings
  async getMetrics(vmID, fromISO, toISO) {
    const q = `date_from=${encodeURIComponent(fromISO)}&date_to=${encodeURIComponent(toISO)}`;
    let resp = await this._do('GET', `/api/vps/v1/virtual-machines/${vmID}/metrics?${q}`);
    if (isObj(resp) && isObj(resp.data)) resp = resp.data;
    return decodeMetrics(asObj(resp));
  }

  // actions
  async getAction(vmID, actionID) { return decodeAction(await this._do('GET', `/api/vps/v1/virtual-machines/${vmID}/actions/${actionID}`)); }
  async listActions(vmID) { return (await this._listPaged(`/api/vps/v1/virtual-machines/${vmID}/actions`)).map(decodeActionRecord); }

  // ===== Firewalls =====
  async listFirewalls() { return (await this._listPaged('/api/vps/v1/firewall')).map(decodeFirewallGroup); }
  async getFirewall(id) { return decodeSingle(await this._do('GET', `/api/vps/v1/firewall/${id}`), decodeFirewallGroup); }
  async createFirewall(name) { return decodeSingle(await this._do('POST', '/api/vps/v1/firewall', { name }), decodeFirewallGroup); }
  deleteFirewall(id) { return this._do('DELETE', `/api/vps/v1/firewall/${id}`); }
  async attachFirewall(firewallID, vmID) { return decodeAction(await this._do('POST', `/api/vps/v1/firewall/${firewallID}/activate/${vmID}`)); }
  async detachFirewall(firewallID, vmID) { return decodeAction(await this._do('POST', `/api/vps/v1/firewall/${firewallID}/deactivate/${vmID}`)); }
  async createFirewallRule(firewallID, protocol, port, source, sourceDetail) {
    [protocol, source] = normalizeFirewallRule(protocol, source);
    const body = { protocol, port, source };
    if (sourceDetail) body.source_detail = sourceDetail;
    return decodeSingle(await this._do('POST', `/api/vps/v1/firewall/${firewallID}/rules`, body), decodeFirewallRule);
  }
  async updateFirewallRule(firewallID, ruleID, protocol, port, source, sourceDetail) {
    [protocol, source] = normalizeFirewallRule(protocol, source);
    const body = { protocol, port, source };
    if (sourceDetail) body.source_detail = sourceDetail;
    return decodeSingle(await this._do('PUT', `/api/vps/v1/firewall/${firewallID}/rules/${ruleID}`, body), decodeFirewallRule);
  }
  deleteFirewallRule(firewallID, ruleID) { return this._do('DELETE', `/api/vps/v1/firewall/${firewallID}/rules/${ruleID}`); }
  // syncFirewall re-pushes a group (is_synced=false) to a VM's live firewall.
  async syncFirewall(firewallID, vmID) { return decodeAction(await this._do('POST', `/api/vps/v1/firewall/${firewallID}/sync/${vmID}`)); }

  // ===== Public keys =====
  async listPublicKeys() { return (await this._listPaged('/api/vps/v1/public-keys')).map(decodePublicKey); }
  async createPublicKey(name, key) { return decodeSingle(await this._do('POST', '/api/vps/v1/public-keys', { name, key }), decodePublicKey); }
  deletePublicKey(id) { return this._do('DELETE', `/api/vps/v1/public-keys/${id}`); }
  async attachPublicKeys(vmID, ids) { return decodeAction(await this._do('POST', `/api/vps/v1/public-keys/attach/${vmID}`, { ids })); }
  async listVMPublicKeys(vmID) { return extractItems(await this._do('GET', `/api/vps/v1/virtual-machines/${vmID}/public-keys`)).map(decodePublicKey); }

  // ===== Docker (per VM) =====
  async listDockerProjects(vmID) { return extractItems(await this._do('GET', `/api/vps/v1/virtual-machines/${vmID}/docker`)).map(decodeDockerProject); }
  async getDockerProject(vmID, name) { return decodeSingle(await this._do('GET', `/api/vps/v1/virtual-machines/${vmID}/docker/${name}`), decodeDockerProject); }
  async listDockerContainers(vmID, name) { return extractItems(await this._do('GET', `/api/vps/v1/virtual-machines/${vmID}/docker/${name}/containers`)).map(decodeDockerContainer); }
  async getDockerLogs(vmID, name) { return extractLogLines(await this._do('GET', `/api/vps/v1/virtual-machines/${vmID}/docker/${name}/logs`)); }
  startDockerProject(vmID, name) { return this._do('POST', `/api/vps/v1/virtual-machines/${vmID}/docker/${name}/start`); }
  stopDockerProject(vmID, name) { return this._do('POST', `/api/vps/v1/virtual-machines/${vmID}/docker/${name}/stop`); }
  restartDockerProject(vmID, name) { return this._do('POST', `/api/vps/v1/virtual-machines/${vmID}/docker/${name}/restart`); }
  updateDockerProject(vmID, name) { return this._do('POST', `/api/vps/v1/virtual-machines/${vmID}/docker/${name}/update`); }
  downDockerProject(vmID, name) { return this._do('DELETE', `/api/vps/v1/virtual-machines/${vmID}/docker/${name}/down`); }
  // createDockerProject — content is the compose YAML; environment is optional.
  async createDockerProject(vmID, name, content, environment) {
    const body = { project_name: name, content };
    if (environment) body.environment = environment;
    return decodeAction(await this._do('POST', `/api/vps/v1/virtual-machines/${vmID}/docker`, body));
  }

  // ===== Post-install scripts =====
  async listPostInstallScripts() { return (await this._listPaged('/api/vps/v1/post-install-scripts')).map(decodePostInstallScript); }
  async getPostInstallScript(id) { return decodeSingle(await this._do('GET', `/api/vps/v1/post-install-scripts/${id}`), decodePostInstallScript); }
  async createPostInstallScript(name, content) { return decodeSingle(await this._do('POST', '/api/vps/v1/post-install-scripts', { name, content }), decodePostInstallScript); }
  async updatePostInstallScript(id, name, content) { return decodeSingle(await this._do('PUT', `/api/vps/v1/post-install-scripts/${id}`, { name, content }), decodePostInstallScript); }
  deletePostInstallScript(id) { return this._do('DELETE', `/api/vps/v1/post-install-scripts/${id}`); }

  // ===== Malware scanner (Monarx) =====
  // getMonarx returns {installed:false} on 404 (agent not installed).
  async getMonarx(vmID) {
    let resp;
    try { resp = await this._do('GET', `/api/vps/v1/virtual-machines/${vmID}/monarx`); }
    catch (e) { if (e.status === 404) return { installed: false, raw: {} }; throw e; }
    const m = isObj(resp) && isObj(resp.data) ? resp.data : asObj(resp);
    return {
      installed: true,
      records: mapInt(m, 'records'), malicious: mapInt(m, 'malicious'), compromised: mapInt(m, 'compromised'),
      scannedFiles: mapInt(m, 'scanned_files'),
      scanStartedAt: mapTimeStr(m, 'scan_started_at'), scanEndedAt: mapTimeStr(m, 'scan_ended_at'), raw: m,
    };
  }
  async installMonarx(vmID) { return decodeAction(await this._do('POST', `/api/vps/v1/virtual-machines/${vmID}/monarx`)); }
  async uninstallMonarx(vmID) { return decodeAction(await this._do('DELETE', `/api/vps/v1/virtual-machines/${vmID}/monarx`)); }

  // ===== Billing =====
  async listSubscriptions() { return (await this._listPaged('/api/billing/v1/subscriptions')).map(decodeSubscription); }
  enableAutoRenewal(subID) { return this._do('PATCH', `/api/billing/v1/subscriptions/${subID}/auto-renewal/enable`); }
  disableAutoRenewal(subID) { return this._do('DELETE', `/api/billing/v1/subscriptions/${subID}/auto-renewal/disable`); }
  async listPaymentMethods() { return (await this._listPaged('/api/billing/v1/payment-methods')).map(decodePaymentMethod); }
  setDefaultPaymentMethod(id) { return this._do('POST', `/api/billing/v1/payment-methods/${id}`); }
  deletePaymentMethod(id) { return this._do('DELETE', `/api/billing/v1/payment-methods/${id}`); }
  async listCatalog() { return (await this._listPaged('/api/billing/v1/catalog')).map(decodeCatalogItem); }

  // ===== DNS =====
  async getDNSRecords(domain) { return extractItems(await this._do('GET', `/api/dns/v1/zones/${domain}`)).map(decodeDNSRecord); }
  // updateDNSRecords: zone = [{name,type,ttl,records:[{content,isDisabled}]}]; overwrite replaces the whole zone.
  updateDNSRecords(domain, zone, overwrite) { return this._do('PUT', `/api/dns/v1/zones/${domain}`, { overwrite: !!overwrite, zone: encodeZone(zone) }); }
  // deleteDNSRecords: filters = [{name,type}]
  deleteDNSRecords(domain, filters) { return this._do('DELETE', `/api/dns/v1/zones/${domain}`, { filters: (filters || []).map((r) => ({ name: r.name, type: r.type })) }); }
  resetDNS(domain) { return this._do('POST', `/api/dns/v1/zones/${domain}/reset`); }
  validateDNSRecords(domain, zone, overwrite) { return this._do('POST', `/api/dns/v1/zones/${domain}/validate`, { overwrite: !!overwrite, zone: encodeZone(zone) }); }
  async listDNSSnapshots(domain) { return extractItems(await this._do('GET', `/api/dns/v1/snapshots/${domain}`)).map(decodeDNSSnapshot); }
  restoreDNSSnapshot(domain, snapshotID) { return this._do('POST', `/api/dns/v1/snapshots/${domain}/${snapshotID}/restore`); }

  // ===== Domains =====
  async listDomains() { return (await this._listPaged('/api/domains/v1/portfolio')).map(decodeDomain); }
  async getDomain(domain) { return decodeDomainDetail(await this._do('GET', `/api/domains/v1/portfolio/${domain}`)); }
  enableDomainLock(domain) { return this._do('PUT', `/api/domains/v1/portfolio/${domain}/domain-lock`); }
  disableDomainLock(domain) { return this._do('DELETE', `/api/domains/v1/portfolio/${domain}/domain-lock`); }
  enableDomainPrivacy(domain) { return this._do('PUT', `/api/domains/v1/portfolio/${domain}/privacy-protection`); }
  disableDomainPrivacy(domain) { return this._do('DELETE', `/api/domains/v1/portfolio/${domain}/privacy-protection`); }
  updateDomainNameservers(domain, ns1, ns2, ns3, ns4) {
    const body = { ns1, ns2 };
    if (ns3) body.ns3 = ns3;
    if (ns4) body.ns4 = ns4;
    return this._do('PUT', `/api/domains/v1/portfolio/${domain}/nameservers`, body);
  }
  async checkDomainAvailability(name, tlds, withAlternatives) {
    const body = { domain: name, tlds: tlds || [], with_alternatives: !!withAlternatives };
    return extractItems(await this._do('POST', '/api/domains/v1/availability', body)).map((it) => ({
      domain: mapStr(it, 'domain'), isAvailable: mapBool(it, 'is_available'),
      isAlternative: mapBool(it, 'is_alternative'), restriction: mapStr(it, 'restriction'),
    }));
  }

  // ===== Reference =====
  async listTemplates() { return extractItems(await this._do('GET', '/api/vps/v1/templates')).map((it) => ({ id: mapInt(it, 'id'), name: mapStr(it, 'name'), description: mapStr(it, 'description'), documentation: mapStr(it, 'documentation'), raw: it })); }
  async getTemplate(id) { const m = unwrapObj(await this._do('GET', `/api/vps/v1/templates/${id}`)); return { id: mapInt(m, 'id'), name: mapStr(m, 'name'), description: mapStr(m, 'description'), documentation: mapStr(m, 'documentation'), raw: m }; }
  async listDataCenters() { return extractItems(await this._do('GET', '/api/vps/v1/data-centers')).map((it) => ({ id: mapInt(it, 'id'), name: mapStr(it, 'name'), city: mapStr(it, 'city'), location: mapStr(it, 'location'), continent: mapStr(it, 'continent'), raw: it })); }

  // listPaged walks ?page=N until a short page (50/page). Capped at 100 pages.
  async _listPaged(path) {
    const pageSize = 50, maxPages = 100;
    let all = [];
    for (let page = 1; page <= maxPages; page++) {
      const sep = path.includes('?') ? '&' : '?';
      const items = extractItems(await this._do('GET', `${path}${sep}page=${page}`));
      all = all.concat(items);
      if (items.length < pageSize) break;
    }
    return all;
  }
}

// ============================ helpers ============================
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const asObj = (v) => (isObj(v) ? v : {});
const unwrapObj = (resp) => (isObj(resp) && isObj(resp.data) ? resp.data : asObj(resp));

// normalizeFirewallRule maps loose protocol/source values onto the enums the
// API requires: protocol → TCP|UDP|ICMP|GRE|ESP|AH|ICMPv6|SSH|HTTP|HTTPS|MySQL|
// PostgreSQL|any ; source → any|custom. Returns [protocol, source].
function normalizeFirewallRule(protocol, source) {
  const p = String(protocol || '').trim().toLowerCase();
  const protoMap = {
    tcp: 'TCP', udp: 'UDP', icmp: 'ICMP', icmpv6: 'ICMPv6', gre: 'GRE', esp: 'ESP',
    ah: 'AH', ssh: 'SSH', http: 'HTTP', https: 'HTTPS', mysql: 'MySQL',
    postgresql: 'PostgreSQL', postgres: 'PostgreSQL', any: 'any', '': 'any',
  };
  const proto = protoMap[p] || String(protocol || '').toUpperCase();
  const s = String(source || '').trim().toLowerCase();
  const src = (s === 'any' || s === 'anywhere' || s === '') ? 'any' : 'custom';
  return [proto, src];
}

// vmSetupBody builds the {template_id, data_center_id, ...} setup object shared
// by purchaseVM and setupVM.
function vmSetupBody(s) {
  s = s || {};
  const b = { template_id: Number(s.templateID || 0), data_center_id: Number(s.dataCenterID || 0) };
  if (s.postInstallScriptID) b.post_install_script_id = Number(s.postInstallScriptID);
  if (s.password) b.password = s.password;
  if (s.hostname) b.hostname = s.hostname;
  if (s.installMonarx) b.install_monarx = true;
  if (s.enableBackups) b.enable_backups = true;
  if (s.ns1) b.ns1 = s.ns1;
  if (s.ns2) b.ns2 = s.ns2;
  return b;
}

// encodeZone turns the JS zone shape into the API request payload.
function encodeZone(zone) {
  return (zone || []).map((r) => {
    const entry = { name: r.name, type: r.type, records: (r.records || []).map((v) => ({ content: v.content, is_disabled: !!v.isDisabled })) };
    if (r.ttl > 0) entry.ttl = r.ttl;
    return entry;
  });
}

function extractItems(resp) {
  if (Array.isArray(resp)) return resp.filter(isObj);
  if (isObj(resp) && Array.isArray(resp.data)) return resp.data.filter(isObj);
  return [];
}
function decodeSingle(resp, decode) {
  if (isObj(resp) && isObj(resp.data)) return decode(resp.data);
  if (isObj(resp)) return decode(resp);
  return decode({});
}
function decodeAction(resp) {
  if (!isObj(resp)) return { id: 0, raw: {} };
  if (isObj(resp.data)) return decodeActionRecord(resp.data);
  return decodeActionRecord(resp);
}

// ---- map helpers ----
function mapStr(m, ...keys) {
  if (!isObj(m)) return '';
  for (const k of keys) {
    const v = m[k];
    if (typeof v === 'string') { if (v !== '') return v; }
    else if (typeof v === 'number') { if (v !== 0) return String(Math.trunc(v)); }
    else if (typeof v === 'boolean') return String(v);
  }
  return '';
}
function mapInt(m, ...keys) { if (!isObj(m)) return 0; for (const k of keys) { const v = m[k]; if (typeof v === 'number') return Math.trunc(v); if (typeof v === 'string') { const n = parseInt(v, 10); if (n) return n; } } return 0; }
function mapBool(m, k) { return isObj(m) && m[k] === true; }
function mapTimeStr(m, ...keys) { if (!isObj(m)) return ''; for (const k of keys) { const v = m[k]; if (typeof v === 'string' && v) return v; if (typeof v === 'number' && v > 0) return new Date(v * 1000).toISOString(); } return ''; }

function decodeIPArray(m, key) {
  if (!isObj(m) || !Array.isArray(m[key])) return [];
  return m[key].filter(isObj).map((o) => ({ id: mapInt(o, 'id'), address: mapStr(o, 'address'), ptr: mapStr(o, 'ptr') }));
}

function decodeVM(m) {
  const state = (mapStr(m, 'state', 'status', 'powerState') || '').toLowerCase();
  const v = {
    id: mapStr(m, 'id', 'virtualMachineId', 'vmId'),
    hostname: mapStr(m, 'hostname', 'name', 'label'),
    state, status: state,
    plan: mapStr(m, 'plan'),
    vcpu: mapInt(m, 'cpus', 'vcpu'), ramMB: mapInt(m, 'memory', 'ram'), diskMB: mapInt(m, 'disk'), bandwidthMB: mapInt(m, 'bandwidth'),
    templateID: mapInt(m, 'template_id'), dataCenterID: mapInt(m, 'data_center_id'),
    ns1: mapStr(m, 'ns1'), ns2: mapStr(m, 'ns2'),
    createdAt: mapTimeStr(m, 'created_at', 'createdAt'),
    ipv4: decodeIPArray(m, 'ipv4'), ipv6: decodeIPArray(m, 'ipv6'),
    template: '', region: '', raw: m,
  };
  if (v.ipv4.length) v.ip = v.ipv4[0].address;
  else {
    v.ip = mapStr(m, 'ip', 'ipAddress', 'publicIp');
    if (!v.ip && Array.isArray(m.ipAddresses) && isObj(m.ipAddresses[0])) v.ip = mapStr(m.ipAddresses[0], 'address', 'ip');
  }
  if (isObj(m.template)) { v.template = mapStr(m.template, 'name'); const id = mapInt(m.template, 'id'); if (id) v.templateID = id; }
  if (isObj(m.data_center)) v.region = mapStr(m.data_center, 'city', 'name');
  return v;
}
function primaryIPv4ID(vm) { return (vm.ipv4 && vm.ipv4[0] && vm.ipv4[0].id) || 0; }

function decodeSnapshot(m) { return { id: mapInt(m, 'id'), restoreSeconds: mapInt(m, 'restore_time'), createdAt: mapTimeStr(m, 'created_at'), expiresAt: mapTimeStr(m, 'expires_at'), raw: m }; }
function decodeBackup(m) { return { id: mapInt(m, 'id'), sizeKB: mapInt(m, 'size'), restoreSeconds: mapInt(m, 'restore_time'), location: mapStr(m, 'location'), createdAt: mapTimeStr(m, 'created_at'), raw: m }; }
function decodeActionRecord(m) { return { id: mapInt(m, 'id'), name: mapStr(m, 'name'), state: mapStr(m, 'state'), createdAt: mapTimeStr(m, 'created_at'), updatedAt: mapTimeStr(m, 'updated_at'), raw: m }; }
function decodeFirewallGroup(m) {
  const g = { id: mapInt(m, 'id'), name: mapStr(m, 'name'), isSynced: mapBool(m, 'is_synced'), createdAt: mapTimeStr(m, 'created_at'), updatedAt: mapTimeStr(m, 'updated_at'), rules: [], raw: m };
  if (Array.isArray(m.rules)) g.rules = m.rules.filter(isObj).map(decodeFirewallRule);
  return g;
}
function decodeFirewallRule(m) { return { id: mapInt(m, 'id'), action: mapStr(m, 'action'), protocol: mapStr(m, 'protocol'), port: mapStr(m, 'port'), source: mapStr(m, 'source'), sourceDetail: mapStr(m, 'source_detail'), raw: m }; }
function decodePublicKey(m) { return { id: mapInt(m, 'id'), name: mapStr(m, 'name'), key: mapStr(m, 'key'), raw: m }; }
function decodePostInstallScript(m) { return { id: mapInt(m, 'id'), name: mapStr(m, 'name'), content: mapStr(m, 'content'), createdAt: mapTimeStr(m, 'created_at'), updatedAt: mapTimeStr(m, 'updated_at'), raw: m }; }
function decodeCatalogItem(m) {
  const item = { id: mapStr(m, 'id'), name: mapStr(m, 'name'), category: mapStr(m, 'category'), prices: [], raw: m };
  if (Array.isArray(m.prices)) item.prices = m.prices.filter(isObj).map((p) => ({
    id: mapStr(p, 'id'), name: mapStr(p, 'name'), currency: mapStr(p, 'currency', 'currency_code'),
    price: mapInt(p, 'price'), firstPrice: mapInt(p, 'first_period_price', 'first_price'),
    period: mapInt(p, 'period'), periodUnit: mapStr(p, 'period_unit'), raw: p,
  }));
  return item;
}
function decodeDNSRecord(m) {
  const r = { name: mapStr(m, 'name'), type: mapStr(m, 'type'), ttl: mapInt(m, 'ttl'), records: [], raw: m };
  if (Array.isArray(m.records)) r.records = m.records.filter(isObj).map((v) => ({ content: mapStr(v, 'content'), isDisabled: mapBool(v, 'is_disabled') }));
  return r;
}
function decodeDNSSnapshot(m) { return { id: mapInt(m, 'id'), reason: mapStr(m, 'reason'), createdAt: mapTimeStr(m, 'created_at'), raw: m }; }
function decodeDomain(m) { return { id: mapInt(m, 'id'), domain: mapStr(m, 'domain'), type: mapStr(m, 'type'), status: mapStr(m, 'status'), createdAt: mapTimeStr(m, 'created_at'), expiresAt: mapTimeStr(m, 'expires_at'), raw: m }; }
function decodeDomainDetail(resp) {
  const m = unwrapObj(resp);
  const d = {
    domain: mapStr(m, 'domain'), status: mapStr(m, 'status'),
    isPrivacyAllowed: mapBool(m, 'is_privacy_protection_allowed'), isPrivacyProtected: mapBool(m, 'is_privacy_protected'),
    isLockable: mapBool(m, 'is_lockable'), isLocked: mapBool(m, 'is_locked'), ns1: '', ns2: '', raw: m,
  };
  if (isObj(m.name_servers)) { d.ns1 = mapStr(m.name_servers, 'ns1'); d.ns2 = mapStr(m.name_servers, 'ns2'); }
  return d;
}
function decodeSubscription(m) { return { id: mapStr(m, 'id'), name: mapStr(m, 'name'), status: mapStr(m, 'status'), billingPeriod: mapInt(m, 'billing_period'), billingPeriodUnit: mapStr(m, 'billing_period_unit'), currencyCode: mapStr(m, 'currency_code'), totalPrice: mapInt(m, 'total_price'), renewalPrice: mapInt(m, 'renewal_price'), isAutoRenewed: mapBool(m, 'is_auto_renewed'), createdAt: mapTimeStr(m, 'created_at'), expiresAt: mapTimeStr(m, 'expires_at'), nextBillingAt: mapTimeStr(m, 'next_billing_at'), raw: m }; }
function decodePaymentMethod(m) { return { id: mapInt(m, 'id'), name: mapStr(m, 'name'), identifier: mapStr(m, 'identifier'), paymentMethod: mapStr(m, 'payment_method'), isDefault: mapBool(m, 'is_default'), isExpired: mapBool(m, 'is_expired'), isSuspended: mapBool(m, 'is_suspended'), createdAt: mapTimeStr(m, 'created_at'), expiresAt: mapTimeStr(m, 'expires_at'), raw: m }; }
function decodeDockerProject(m) { return { name: mapStr(m, 'name'), state: mapStr(m, 'state', 'status'), services: mapInt(m, 'services', 'services_count'), createdAt: mapTimeStr(m, 'created_at'), raw: m }; }
function decodeDockerContainer(m) {
  const c = { name: mapStr(m, 'name'), image: mapStr(m, 'image'), state: mapStr(m, 'state'), status: mapStr(m, 'status'), ports: [], raw: m };
  if (Array.isArray(m.ports)) for (const p of m.ports) { if (typeof p === 'string') c.ports.push(p); else if (isObj(p)) { const s = mapStr(p, 'binding', 'port', 'value'); if (s) c.ports.push(s); } }
  return c;
}
function extractLogLines(resp) {
  if (resp == null) return [];
  if (typeof resp === 'string') return resp.split('\n');
  if (isObj(resp)) {
    for (const key of ['output', 'logs', 'data', 'content']) {
      const raw = resp[key];
      if (typeof raw === 'string') return raw.split('\n');
      if (Array.isArray(raw)) return raw.map((l) => (typeof l === 'string' ? l : mapStr(l, 'line', 'message', 'output')));
    }
  }
  if (Array.isArray(resp)) return resp.map((l) => (typeof l === 'string' ? l : mapStr(l, 'line', 'message', 'output')));
  return [];
}

// Metrics: reduce time-bucketed series to the latest sample of each.
function latestSample(m, key) {
  const sub = isObj(m) ? m[key] : null;
  const usage = isObj(sub) ? sub.usage : null;
  if (!isObj(usage)) return [0, 0];
  let bestTS = 0, bestVal = 0;
  for (const [kts, v] of Object.entries(usage)) {
    const ts = parseInt(kts, 10) || 0;
    if (ts < bestTS) continue;
    bestTS = ts; bestVal = typeof v === 'number' ? v : 0;
  }
  return [bestTS, bestVal];
}
// allSamples returns the full time-ordered [{t: ISO, v}] series for m[key].usage.
function allSamples(m, key) {
  const sub = isObj(m) ? m[key] : null;
  const usage = isObj(sub) ? sub.usage : null;
  if (!isObj(usage)) return [];
  return Object.entries(usage)
    .map(([kts, v]) => ({ ts: parseInt(kts, 10) || 0, v: typeof v === 'number' ? v : 0 }))
    .sort((a, b) => a.ts - b.ts)
    .map((p) => ({ t: new Date(p.ts * 1000).toISOString(), v: p.v }));
}
function decodeMetrics(m) {
  const [cpuTS, cpu] = latestSample(m, 'cpu_usage');
  const [, ram] = latestSample(m, 'ram_usage');
  const [, disk] = latestSample(m, 'disk_space');
  const [, inc] = latestSample(m, 'incoming_traffic');
  const [, out] = latestSample(m, 'outgoing_traffic');
  const [, up] = latestSample(m, 'uptime');
  return {
    cpuPercent: cpu, ramBytes: Math.trunc(ram), diskBytes: Math.trunc(disk),
    incomingBytes: Math.trunc(inc), outgoingBytes: Math.trunc(out), uptimeMS: Math.trunc(up),
    lastSampleAt: cpuTS > 0 ? new Date(cpuTS * 1000).toISOString() : '',
    // full series for sparkline rendering
    cpuSeries: allSamples(m, 'cpu_usage'), ramSeries: allSamples(m, 'ram_usage'),
    diskSeries: allSamples(m, 'disk_space'),
    netInSeries: allSamples(m, 'incoming_traffic'), netOutSeries: allSamples(m, 'outgoing_traffic'),
    raw: m,
  };
}

module.exports = { HostingerClient, HError, DEFAULT_BASE, primaryIPv4ID, normalizeFirewallRule };
