# MBI Inventra SaaS — Git to VPS Production Master Specification

## Target

The final product will be a modern SaaS-style pharmacy/business management platform. Code will be stored in Git, tested on every push, built as Docker images, backed up before deployment, and deployed to a VPS behind a custom domain and HTTPS. Three active devices will work simultaneously per tenant without direct database access.

The same codebase will serve Basic and Advanced plans. Feature access will be controlled by server-side plan entitlements and user permissions, not by hiding menus only in the frontend.

## Git repository structure

```text
mbi-inventra/
  apps/
    web/                 React + Vite PWA
    api/                 Node.js + TypeScript API
    worker/              scheduled jobs and queues
  packages/
    shared/              types, Zod schemas, permissions
    ui/                  SaaS design system
  database/
    migrations/          versioned MariaDB migrations
    seeds/               safe demo/medicine seeds
  infra/
    docker-compose.yml
    nginx/
    backup/
    monitoring/
  docs/
    architecture/
    api/
    runbooks/
  .github/workflows/
    ci.yml
    deploy.yml
```

The `main` branch is production. Pull requests run typecheck, lint, unit tests, API tests, tenant-isolation tests, build and migration checks. A release tag creates immutable Docker image tags. Deployment uses the release tag, never an unreviewed working tree.

## Git-to-VPS pipeline

1. Developer pushes code to Git.
2. CI installs locked dependencies.
3. CI runs lint, TypeScript checks, unit tests and API tests.
4. CI runs MariaDB migration tests on a temporary database.
5. CI tests that Tenant A cannot read Tenant B data.
6. CI builds React PWA and Node.js API.
7. CI builds and tags Docker images.
8. VPS deployment creates an encrypted MariaDB backup and restore point.
9. VPS pulls the approved image tag.
10. Database migrations run in non-destructive mode.
11. API, worker, PWA and Nginx restart using Docker Compose.
12. Health checks verify API, MariaDB, disk, SSL and backup age.
13. If health checks fail, deployment stops and previous image can be rolled back.

The deployment must never run a destructive `DROP DATABASE`, `DROP TABLE` or wipe command. Tenant deletion is not part of deployment.

## VPS services

- `nginx`: HTTPS, domain routing, compression, security headers and reverse proxy.
- `web`: React/PWA static assets.
- `api`: Node.js API, auth, tenants, permissions and business routes.
- `worker`: scheduled reports, backups, notifications, sync flush and cleanup scans.
- `mariadb`: `master_control` database plus tenant databases.
- `redis`: optional but recommended for queues, rate limiting and realtime fan-out.
- `backup`: scheduled encrypted dumps and restore-point management.

Only ports 80 and 443 are public. MariaDB, Redis and internal Node ports bind to the private Docker network only.

## SaaS tenant model

The `master_control` database stores tenant registry, domain mappings, plans, subscriptions, licences, devices, master users, feature entitlements and deployment metadata. Each tenant gets a separate MariaDB database such as `tenant_000001`.

The API resolves the tenant from a verified session and domain mapping. Client-provided tenant IDs are ignored. Every tenant database has migration version, tenant anchor and audit tables. A tenant can be suspended or placed in maintenance mode, but data remains intact.

## Three-device support

Three device slots are supported as a first-class feature, not a browser-tab trick:

- Device 1: Owner/Admin.
- Device 2: Branch Manager/POS.
- Device 3: Pharmacist/Inventory.

Every device has a server-issued device ID, signed device key, device name, assigned user, assigned branch, status, last seen, IP history and revoked-at timestamp. Admin can approve, freeze, revoke or transfer a device. A fourth device is rejected or requires an Advanced entitlement change.

Devices use HTTPS REST for commands and WebSocket/SSE for live events. Stock-changing operations use MariaDB transactions, row locks and idempotency keys. The server is the authority for invoice numbers, stock quantity and permissions.

## Basic plan function set

Basic includes auth, trial, tenant setup, dashboard, POS, barcode, thermal printing, sale returns, credit notes, drafts, purchases, purchase returns, purchase orders, goods inward, medicines, batches, expiry, FEFO/FIFO, low-stock, shortage registry, customer/supplier khata, payments, banks, expenses, cashier shifts, basic financial/stock/party reports, CSV/Excel, offline PWA, local backup, sync health, device binding, HWID check, TOTP, audit and settings.

Default entitlement: 2 users, 2 devices, 2 branches. These are server-side limits and can be adjusted by Master Admin. Basic users cannot access Advanced modules even if they manipulate frontend code.

## Advanced plan function set

Advanced includes every Basic function plus multi-branch HQ, 10 branches, 15 users, 15 devices, multi-godown, multi-warehouse, inter-branch transfers, approval workflows, field-level permissions, double-entry accounting, chart of accounts, journals, trial balance, consolidated audits, prescriptions, chronic refills, controlled drugs, narcotics and DRAP registers, warranty workflows, sale orders, quotations, estimates, delivery challans, 180-day FEFO, online store, web orders, promotions, WhatsApp connector, email alerts, AI Copilot, data-aware AI queries, attendance, payroll, bookers, commissions, CMS, blog, support, master fleet, database doctor, advanced backups, restore points, system health and consolidated chain analytics.

## All screen groups

### Public and auth

Landing page, pricing, plan comparison, trial registration, login, Google sign-in, OTP, forgot password, reset password, MFA setup, device verification, checkout, blog listing, blog detail, privacy, terms and public lead capture.

### Tenant app

Dashboard, POS billing, sales invoice, sale return, credit note, sale drafts, sale orders, quotations, estimates, delivery challan, purchases, purchase return, purchase order, goods inward, suppliers, inventory, medicines, batches, expiry radar, shortage registry, godowns, stock transfer, customers, parties, customer khata, supplier khata, payments, bank, cheques, loans, expenses, cashier shifts, cash-in-hand, prescriptions, chronic refills, controlled registers, online orders, promotions, accounting, journal vouchers, ledgers, reports, attendance, payroll, bookers, commissions, daily notes, activity logs, low-stock alerts, sync/backup, help desk, feedback, utilities, updates and settings.

### Master app

Master login, master MFA, fleet overview, tenant list, tenant provisioning, tenant status, maintenance lock, plans, subscriptions, licences, licence keys, devices, staff controls, role management, feature overrides, safe impersonation, central medicine catalogue, domain manager, registration leads, Google users, broadcasts, notifications, support tickets, server hub, health, database doctor, database overview, schema/download, SQL export, backups, restore points, audit logs, security logs, error logs, CMS, blog, testimonials, homepage popups, email settings, WhatsApp gateway settings, depletion forecast and system cleanup scan.

## Security gates on every protected request

HTTPS, secure headers, access token, refresh token rotation, device signature, MFA state, account status, subscription status, tenant resolution, branch scope, permission code, request validation, idempotency check, MariaDB transaction, audit log and sanitized response.

Passwords use Argon2id. Sessions have expiry and revocation. Login, OTP and public forms use rate limits and honeypots. Failed logins use progressive backoff. Sensitive prescription, device and backup fields are encrypted. Admin actions use step-up MFA.

## Offline and PWA

The PWA uses a service worker for cached shell assets and IndexedDB for encrypted local queues. Offline billing, inventory lookup, drafts, khata and purchase drafts continue to work. On reconnect, the sync engine pushes UUID-based records with idempotency keys and pulls server deltas by cursor/version. Tombstones prevent deleted records from reappearing. Stock conflicts are decided on the server, not by last-write-wins.

## Data safety and backups

Automatic restore point on startup and before release deployment. Daily encrypted MariaDB dump, weekly restore test, backup age shown in Master Server Hub. Live data is never auto-deleted. Log archives may move to an archive table but are not destroyed. A real tenant wipe is a separate master operation and is disabled by default.

## Design system

Use the supplied modern dashboard direction: deep navy navigation, teal primary actions, light gray workspace, white cards, blue analytics, green healthy status, amber warning and red critical alert. The design system must provide responsive desktop, tablet and mobile states, keyboard navigation, accessible contrast, consistent empty/loading/error states, searchable tables and fast POS interactions.

## Deployment information needed later

When ready for actual deployment, the required inputs are: Git provider/repository, production branch, VPS IP/provider, SSH key or deployment runner, domain name, DNS access, backup destination and SMTP/WhatsApp credentials if those optional services are enabled. Credentials should be stored as VPS secrets, never committed to Git.
