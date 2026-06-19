# Hostinger API Reference

A practical reference for the [Hostinger API](https://developers.hostinger.com/),
scoped to what `hostinger-electron` uses (and could use). Generated from the official
OpenAPI spec at [github.com/hostinger/api](https://github.com/hostinger/api/blob/main/openapi.json)
(`openapi: 3.0.0`, spec version **0.19.1**).

The full API exposes **133 operations across 36 tags**. This app is VPS-focused
and wires up the entire VPS + Billing surface plus DNS and domain management
(see [Coverage](#coverage)).

> The endpoint tables below name the client method that calls each endpoint.
> Names are shown in PascalCase; the JS client (`src/hostinger-client.js`) uses
> the camelCase equivalent (`ListVMs` → `listVMs`, `GetSnapshot` → `getSnapshot`).
> The IPC bridge in `src/main.js` exposes every client method to the renderer
> generically via `window.api.call(method, …)`.

---

## Conventions

| | |
|---|---|
| **Base URL** | `https://developers.hostinger.com` |
| **Auth** | `Authorization: Bearer <API_TOKEN>` (HTTP bearer). Tokens are created at <https://hpanel.hostinger.com/profile/api> and inherit the owning user's permissions. They may optionally expire. |
| **Content type** | All requests must send `Content-Type: application/json`. `POST`/`PUT`/`PATCH` may carry a JSON body. |
| **Pagination** | List endpoints return **50 items/page**. Use `?page=N` to page (e.g. `/api/vps/v1/public-keys?page=2`). |
| **Rate limiting** | Over-limit returns `429 Too Many Requests`. Rate-limit headers are included on responses. Repeated abuse can temporarily block your IP. |
| **Errors** | Non-2xx responses return JSON with an `error` (human-readable) field and a `correlation_id` field (quote it when contacting support). |
| **Async ops** | Mutating VPS calls return an **action** record (`id`, `state` = `pending`/`completed`/`failed`). Poll `GET .../actions/{actionId}` until terminal. |

> **Client behaviour** (`src/hostinger-client.js`): `fetch` with a 20 s
> `AbortController` timeout; up to 3 attempts with truncated exponential
> back-off (500 ms → 1 s) on `429` and `5xx`; bails immediately on other `4xx`.
> Collection responses are unwrapped from either a bare array or a
> `{ "data": [...] }` envelope, and paginated lists walk `?page=N` until a short
> page (`_listPaged`).

---

## Coverage

Legend: ✅ implemented in the client · ⛔ not implemented · ➖ partial

| Category | Endpoints | Status |
|---|---:|---|
| VPS: Virtual machine | 15 | ✅ 15/15 (incl. purchase / setup / panel-password) |
| VPS: Snapshots | 4 | ✅ 4/4 |
| VPS: Backups | 2 | ✅ 2/2 |
| VPS: Actions | 2 | ✅ 2/2 |
| VPS: Recovery | 2 | ✅ 2/2 |
| VPS: PTR records | 2 | ✅ 2/2 |
| VPS: Public Keys | 4 | ✅ 4/4 |
| VPS: Firewall | 10 | ✅ 10/10 (rule-update + sync added) |
| VPS: Docker Manager | 10 | ✅ 10/10 (create-project added) |
| VPS: OS Templates | 2 | ✅ 2/2 |
| VPS: Data centers | 1 | ✅ 1/1 |
| VPS: Post-install scripts | 5 | ✅ 5/5 |
| VPS: Malware scanner (Monarx) | 3 | ✅ 3/3 |
| Billing: Subscriptions | 3 | ✅ 3/3 |
| Billing: Payment methods | 3 | ✅ 3/3 |
| Billing: Catalog | 1 | ✅ 1/1 |
| DNS: Zone | 5 | ✅ 5/5 |
| DNS: Snapshot | 3 | ➖ 2/3 (list + restore; no single-snapshot GET) |
| Domains (Portfolio / Availability) | 9 | ➖ 6/9 (list, detail, lock, privacy, NS, availability) |
| Domains (WHOIS / Forwarding / Purchase) | 8 | ⛔ 0/8 |
| Hosting (Websites / Databases / WordPress / NodeJS / …) | 23 | ⛔ 0/23 |
| Reach (Contacts / Segments / Profiles) | 11 | ⛔ 0/11 |
| Ecommerce: Stores | 2 | ⛔ 0/2 |
| Horizons: Websites | 2 | ⛔ 0/2 |
| Domain Access Verifier | 1 | ⛔ 0/1 |

---

## VPS

All VPS paths are prefixed `/api/vps/v1`. `{id}` below is `{virtualMachineId}`.

### Virtual machine
| Method | Path | Summary | Client |
|---|---|---|---|
| GET | `/virtual-machines` | List VMs | ✅ `ListVMs` |
| POST | `/virtual-machines` | **Purchase** a new VM — body `{item_id*, payment_method_id, setup*, coupons}` | ✅ `PurchaseVM` |
| GET | `/virtual-machines/{id}` | VM details | ✅ `GetVM` |
| POST | `/virtual-machines/{id}/setup` | Setup a purchased VM — `{template_id*, data_center_id*, post_install_script_id, password, hostname, install_monarx, enable_backups, ns1, ns2, public_key}` | ✅ `SetupVM` |
| POST | `/virtual-machines/{id}/start` | Start | ✅ `StartVM` |
| POST | `/virtual-machines/{id}/stop` | Stop | ✅ `StopVM` |
| POST | `/virtual-machines/{id}/restart` | Restart | ✅ `RestartVM` |
| POST | `/virtual-machines/{id}/recreate` | Reinstall OS — `{template_id*, password, panel_password, post_install_script_id}` | ✅ `RecreateVM` |
| PUT | `/virtual-machines/{id}/hostname` | Set hostname — `{hostname*}` | ✅ `SetHostname` |
| DELETE | `/virtual-machines/{id}/hostname` | Reset hostname | ✅ `ResetHostname` |
| PUT | `/virtual-machines/{id}/root-password` | Set root password — `{password*}` | ✅ `SetRootPassword` |
| PUT | `/virtual-machines/{id}/panel-password` | Set panel password — `{password*}` | ✅ `SetPanelPassword` |
| PUT | `/virtual-machines/{id}/nameservers` | Set NS — `{ns1*, ns2, ns3}` | ✅ `UpdateNameservers` |
| GET | `/virtual-machines/{id}/metrics` | Time-bucketed usage — query `date_from*`, `date_to*` (RFC3339) | ✅ `GetMetrics` |
| GET | `/virtual-machines/{id}/public-keys` | Keys attached to VM | ✅ `ListVMPublicKeys` |

### Snapshots — singular (one per VM)
| Method | Path | Client |
|---|---|---|
| GET | `/virtual-machines/{id}/snapshot` (404 ⇒ none) | ✅ `GetSnapshot` |
| POST | `/virtual-machines/{id}/snapshot` | ✅ `CreateSnapshot` |
| DELETE | `/virtual-machines/{id}/snapshot` | ✅ `DeleteSnapshot` |
| POST | `/virtual-machines/{id}/snapshot/restore` | ✅ `RestoreSnapshot` |

### Backups
| Method | Path | Client |
|---|---|---|
| GET | `/virtual-machines/{id}/backups` | ✅ `ListBackups` |
| POST | `/virtual-machines/{id}/backups/{backupId}/restore` | ✅ `RestoreBackup` |

### Actions (async op log)
| Method | Path | Client |
|---|---|---|
| GET | `/virtual-machines/{id}/actions` | ✅ `ListActions` |
| GET | `/virtual-machines/{id}/actions/{actionId}` | ✅ `GetAction` |

### Recovery
| Method | Path | Body | Client |
|---|---|---|---|
| POST | `/virtual-machines/{id}/recovery` | `{root_password*}` | ✅ `StartRecovery` |
| DELETE | `/virtual-machines/{id}/recovery` | — | ✅ `StopRecovery` |

### PTR records (reverse DNS)
| Method | Path | Body | Client |
|---|---|---|---|
| POST | `/virtual-machines/{id}/ptr/{ipAddressId}` | `{domain*}` | ✅ `SetPTR` |
| DELETE | `/virtual-machines/{id}/ptr/{ipAddressId}` | — | ✅ `DeletePTR` |

> `{ipAddressId}` is the **IPv4 address id** from `GET /virtual-machines/{id}`, not the IP string.

### Public Keys (account-level)
| Method | Path | Body | Client |
|---|---|---|---|
| GET | `/public-keys` | — | ✅ `ListPublicKeys` |
| POST | `/public-keys` | `{name*, key*}` | ✅ `CreatePublicKey` |
| POST | `/public-keys/attach/{id}` | `{ids*: int[]}` | ✅ `AttachPublicKeys` |
| DELETE | `/public-keys/{publicKeyId}` | — | ✅ `DeletePublicKey` |

### Firewall
| Method | Path | Body | Client |
|---|---|---|---|
| GET | `/firewall` | — | ✅ `ListFirewalls` |
| POST | `/firewall` | `{name*}` | ✅ `CreateFirewall` |
| GET | `/firewall/{firewallId}` | — | ✅ `GetFirewall` |
| DELETE | `/firewall/{firewallId}` | — | ✅ `DeleteFirewall` |
| POST | `/firewall/{firewallId}/activate/{id}` | — | ✅ `AttachFirewall` |
| POST | `/firewall/{firewallId}/deactivate/{id}` | — | ✅ `DetachFirewall` |
| POST | `/firewall/{firewallId}/rules` | rule body (below) | ✅ `CreateFirewallRule` |
| PUT | `/firewall/{firewallId}/rules/{ruleId}` | rule body (below) | ✅ `UpdateFirewallRule` |
| DELETE | `/firewall/{firewallId}/rules/{ruleId}` | — | ✅ `DeleteFirewallRule` |
| POST | `/firewall/{firewallId}/sync/{id}` | — | ✅ `SyncFirewall` |

**Firewall rule body** (POST/PUT `/rules`):
```jsonc
{
  "protocol": "TCP",      // enum: TCP UDP ICMP GRE any ESP AH ICMPv6 SSH HTTP HTTPS MySQL PostgreSQL
  "port": "443",          // single port or range "80-443"
  "source": "any",        // enum: any | custom
  "source_detail": "351.15.24.0/24"  // CIDR when source = custom
}
```

> The client accepts loose protocol/source values and normalizes them to these
> enums before sending (`normalizeFirewallRule` in `src/hostinger-client.js`):
> `tcp→TCP`, `udp→UDP`, …; `anywhere/ipv4/ipv6 → any|custom`.

### Docker Manager
| Method | Path | Body | Client |
|---|---|---|---|
| GET | `/virtual-machines/{id}/docker` | — | ✅ `ListDockerProjects` |
| POST | `/virtual-machines/{id}/docker` | `{project_name*, content* (compose YAML), environment}` | ✅ `CreateDockerProject` |
| GET | `/virtual-machines/{id}/docker/{projectName}` | — | ✅ `GetDockerProject` |
| GET | `/virtual-machines/{id}/docker/{projectName}/containers` | — | ✅ `ListDockerContainers` |
| GET | `/virtual-machines/{id}/docker/{projectName}/logs` | — | ✅ `GetDockerLogs` |
| POST | `/virtual-machines/{id}/docker/{projectName}/start` | — | ✅ `StartDockerProject` |
| POST | `/virtual-machines/{id}/docker/{projectName}/stop` | — | ✅ `StopDockerProject` |
| POST | `/virtual-machines/{id}/docker/{projectName}/restart` | — | ✅ `RestartDockerProject` |
| POST | `/virtual-machines/{id}/docker/{projectName}/update` | — | ✅ `UpdateDockerProject` |
| DELETE | `/virtual-machines/{id}/docker/{projectName}/down` | — | ✅ `DownDockerProject` |

### OS Templates / Data centers
| Method | Path | Client |
|---|---|---|
| GET | `/templates` | ✅ `ListTemplates` |
| GET | `/templates/{templateId}` | ✅ `GetTemplate` |
| GET | `/data-centers` | ✅ `ListDataCenters` |

### Post-install scripts
| Method | Path | Body | Client |
|---|---|---|---|
| GET | `/post-install-scripts` | — | ✅ `ListPostInstallScripts` |
| POST | `/post-install-scripts` | `{name*, content*}` | ✅ `CreatePostInstallScript` |
| GET | `/post-install-scripts/{postInstallScriptId}` | — | ✅ `GetPostInstallScript` |
| PUT | `/post-install-scripts/{postInstallScriptId}` | `{name*, content*}` | ✅ `UpdatePostInstallScript` |
| DELETE | `/post-install-scripts/{postInstallScriptId}` | — | ✅ `DeletePostInstallScript` |

### Malware scanner — Monarx
| Method | Path | Note | Client |
|---|---|---|---|
| GET | `/virtual-machines/{id}/monarx` | Scan metrics (404 ⇒ not installed) | ✅ `GetMonarx` |
| POST | `/virtual-machines/{id}/monarx` | Install Monarx agent | ✅ `InstallMonarx` |
| DELETE | `/virtual-machines/{id}/monarx` | Uninstall | ✅ `UninstallMonarx` |

---

## Billing

All paths prefixed `/api/billing/v1`.

| Method | Path | Summary | Client |
|---|---|---|---|
| GET | `/subscriptions` | List subscriptions | ✅ `ListSubscriptions` |
| PATCH | `/subscriptions/{subscriptionId}/auto-renewal/enable` | Enable auto-renew | ✅ `EnableAutoRenewal` |
| DELETE | `/subscriptions/{subscriptionId}/auto-renewal/disable` | Disable auto-renew | ✅ `DisableAutoRenewal` |
| GET | `/payment-methods` | List payment methods | ✅ `ListPaymentMethods` |
| POST | `/payment-methods/{paymentMethodId}` | Set default | ✅ `SetDefaultPaymentMethod` |
| DELETE | `/payment-methods/{paymentMethodId}` | Delete | ✅ `DeletePaymentMethod` |
| GET | `/catalog` | Catalog item list (plans/prices — drives VM purchase) | ✅ `ListCatalog` |

---

## DNS — `/api/dns/v1`
| Method | Path | Body | Client |
|---|---|---|---|
| GET | `/zones/{domain}` | — | ✅ `GetDNSRecords` |
| PUT | `/zones/{domain}` | `{overwrite, zone*: [{name*, type*, ttl, records*}]}` | ✅ `UpdateDNSRecords` |
| DELETE | `/zones/{domain}` | `{filters*: [{name*, type*}]}` | ✅ `DeleteDNSRecords` |
| POST | `/zones/{domain}/reset` | — | ✅ `ResetDNS` |
| POST | `/zones/{domain}/validate` | `{overwrite, zone*}` | ✅ `ValidateDNSRecords` |
| GET | `/snapshots/{domain}` | — | ✅ `ListDNSSnapshots` |
| GET | `/snapshots/{domain}/{snapshotId}` | — | ⛔ |
| POST | `/snapshots/{domain}/{snapshotId}/restore` | — | ✅ `RestoreDNSSnapshot` |

## Domains — `/api/domains/v1`
| Method | Path | Body | Client |
|---|---|---|---|
| GET | `/portfolio` | — | ✅ `ListDomains` |
| GET | `/portfolio/{domain}` | — | ✅ `GetDomain` |
| PUT | `/portfolio/{domain}/domain-lock` | — | ✅ `EnableDomainLock` |
| DELETE | `/portfolio/{domain}/domain-lock` | — | ✅ `DisableDomainLock` |
| PUT | `/portfolio/{domain}/privacy-protection` | — | ✅ `EnableDomainPrivacy` |
| DELETE | `/portfolio/{domain}/privacy-protection` | — | ✅ `DisableDomainPrivacy` |
| PUT | `/portfolio/{domain}/nameservers` | `{ns1*, ns2*, ns3, ns4}` | ✅ `UpdateDomainNameservers` |
| POST | `/availability` | `{domain*, tlds*, with_alternatives}` | ✅ `CheckDomainAvailability` |
| POST | `/portfolio` | Purchase a domain | ⛔ |
| WHOIS | `/whois...`, Forwarding `/forwarding...` | — | ⛔ |

---

## Other categories (not in scope)

Full surface, for reference / future expansion.

### Hosting — `/api/hosting/v1`
- **Websites**: `GET|POST /websites`
- **Databases**: list/create/delete, `change-password`, `repair`, `phpmyadmin-link`
- **WordPress**: install, list installations
- **NodeJS**: builds list / from-archive / logs
- **Domains**: parked domains, subdomains, free subdomain, verify-ownership
- **Orders**: `GET /orders` · **Datacenters**: `GET /datacenters`

### Reach (email marketing) — `/api/reach/v1`
- Contacts, contact groups, profiles, segments + segment contacts

### Ecommerce — `/api/ecommerce/v1/stores` · Horizons — `/api/horizons/v1/websites` · Domain Access Verifier — `/api/v2/direct/verifications/active`

---

## Correctness notes

1. **Firewall rule enums** — `normalizeFirewallRule` (in `src/hostinger-client.js`)
   maps loose input to the spec enums before POST/PUT: `tcp→TCP`, `udp→UDP`,
   `icmp→ICMP`, …; `anywhere→any`, `ipv4/ipv6→custom`. Applied by both
   `createFirewallRule` and `updateFirewallRule`.
2. **Firewall rule update / sync** — `updateFirewallRule` and `syncFirewall`
   cover `PUT .../rules/{ruleId}` and `POST .../sync/{vmId}`.
3. **Pagination** — `_listPaged` walks `?page=N` until a short page; applied to
   VMs, public keys, firewalls, subscriptions, payment methods, actions,
   post-install scripts, catalog and domains.
4. **Metric series** — `getMetrics` returns the latest sample *and* the full
   time-ordered series per metric (`cpuSeries`, `ramSeries`, …) for charting.

## Safety note — purchasing

`POST /virtual-machines` (`purchaseVM`) **spends real money** on the account's
default payment method. Gate it behind an explicit confirmation in the UI that
names the plan, price, template and data center before calling it. `setupVM`
provisions an already-purchased (unconfigured) VM and does not charge.

---

*Spec source: `https://raw.githubusercontent.com/hostinger/api/main/openapi.json`
(v0.19.1). Regenerate this table when the spec version changes.*
