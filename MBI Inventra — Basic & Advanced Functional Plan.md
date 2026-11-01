# MBI Inventra — Basic & Advanced Functional Plan

## Final decision

Aapki complete function list system mein rahegi. Koi function remove nahi hoga. Basic aur Advanced sirf access/limit ke plans honge. Is tarah future mein tenant ka plan upgrade karne par data migration ki zaroorat nahi hogi; feature flags and permissions se module unlock hoga.

The public pharmacy/shop app will be tenant-aware. Master Admin panel separate control plane hoga. Every request will resolve the tenant from the verified session, never from a client-supplied `tenant_id`.

## Plan A — Basic

Basic small pharmacy ya single-branch business ke liye hoga. It includes the complete daily business workflow:

### Identity, tenant and security

Tenant registration, 10-day trial, username/email/mobile login, password reset, email OTP, optional Google sign-in, phone verification, JWT session, refresh token, logout, device tracking, password policy, login audit, TOTP 2FA, licence countdown, device bind, HWID reset, device unlock request and device revoke.

### Dashboard and shop setup

Sales, purchase, cash-in-hand, profit snapshot, top products, low-stock cards, expiry alerts, daily notes, activity log, quick search, keyboard shortcuts, pharmacy profile, user settings, general settings, transaction settings, print settings, item settings, feature flags, invoice layout and receipt configuration.

### POS and sales

Fast billing, barcode scanner, batch selection, FEFO/FIFO suggestion, thermal printing for 58/80 mm, sale invoice, sale return, credit note, draft bill, offline auto-save, duplicate invoice protection, customer price/margin rule, discount cap, invoice preview, printable invoice, sale-by-item and sale-by-date reports.

### Purchases and suppliers

Purchase bill, purchase return, purchase order, goods inward, batch and expiry intake, supplier selection, walk-in supplier, payment-out, purchase draft restore, supplier ledger, purchase reports and batch traceability.

### Inventory

Medicine catalogue, central medicine import, generic salt and brand alternative, SKU/barcode, batch, expiry, stock summary, stock detail, item detail, low stock, shortage registry, duplicate-medicine guard, oversell warning, CSV/Excel import/export, 30/60/90-day expiry radar and FIFO allocation report.

### Parties, khata and money

Customer khata, supplier khata, party groups, receivable/payable/net cards, ledger statement, running balance, manual payment, walk-in customer, walk-in supplier, bank accounts, bank transactions, bank statement, cheques, loan accounts, expenses, expense categories, cashier shift open/close, partial payments and balance due.

### Reports and backup

Profit and loss, balance sheet snapshot, bill-wise profit, discount report, tax report, party statement, item report, stock report, low-stock report, expiry report, expense report, bank report, order report, loan statement, Excel export, print, date filter and user filter.

### Offline PWA and sync

Installable PWA, offline login session, offline billing, inventory lookup, khata entry, purchase draft, local auto-save, IndexedDB queue, boot sync, focus sync, 30-second polling, live server events, push/pull sync controls, sync health, diagnostics, local rotating backup and tenant anchor protection.

Basic limits are configurable. Default recommendation: 2 users, 2 devices and 2 branches. These limits can be changed by Master Admin without deleting existing data.

## Plan B — Advanced

Advanced includes every Basic feature plus the complete enterprise and master-control feature set from your list.

### Advanced multi-branch and warehouse

Multi-branch HQ, up to 10 branches by default, consolidated chain dashboard, branch-wise permissions, inter-branch stock transfer, transfer request/approval/dispatch/receive, multi-godown, multi-warehouse, inter-godown transfer, branch sync, mesh sync, consolidated reports and AI reorder velocity.

### Advanced permissions and administration

Master Command Center, Master Server Hub, tenant fleet list, tenant create/save/status, plan change, licence create/extend/revoke/verify, staff management, staff kill-switch, passcode reset, device transfer slot, device revoke, safe impersonation with a visible banner, per-user roles, per-function permissions, field-level permissions, branch scope, approval limits, role-audit log, master overrides and tenant-own overrides.

Master permissions always beat tenant permissions and cannot be silently overwritten by a tenant owner.

### Advanced finance and accounting

Double-entry accounting, chart of accounts, journal vouchers, trial balance, ledgers/statements, consolidated financial audit, party-wise P&L, item-wise P&L, category profitability heatmap and consolidated branch financial reports.

### Advanced pharmacy and regulatory

Prescription management, patient chronic-medication refill, controlled-drug approval flow, narcotics register, controlled-items register, DRAP Form-7/Form-8 registers, warranty register, controlled print controls, sale orders, quotations, estimates, delivery challans, warranty bill conversion and extended 180-day FEFO radar.

### Advanced online commerce and communication

Online customer storefront, digital product catalogue, web orders, promotions, online-store sales/performance reports, SMTP email settings, test mail, admin alerts, WhatsApp pairing, QR flow, WhatsApp send/history, WhatsApp Meta Cloud API configuration and recipient delivery tracking. External WhatsApp/SMS provider fees are separate; the software connector is included.

### Advanced AI

Owner-only AI Copilot, tenant-aware AI Q&A, chat sessions, data-aware structured queries, AI guide, local fallback response, model rotation, AI telemetry, API-key management, quota management, master override/reset and immutable AI audit records. AI must never reveal another tenant's data or provide medical diagnosis.

### Advanced master operations

Database doctor, database diagnostics, database overview, table view/export, SQL dump, schema download, system logs, immutable operational logs, log stats, frontend error reports, LAN mode, heartbeat, broadcast, email broadcast, notifications, receipts, resend, support tickets, depletion forecast, data-cleanup scan, homepage popup, blog CMS, testimonials, SEO pages, public lead capture, checkout-order management, registration leads and Google-user management.

### Advanced staff operations

Staff list, custom staff, shop location, check-in/check-out, manual attendance, monthly attendance, holidays, payroll, advances, attendance dashboard, scheduled attendance report email, booker management, booker ledger, commission tracking and commission reports.

### Advanced recovery and continuity

Encrypted per-tenant backup, restore points on boot and before deployment, backup listing, restore workflow, master client backup directory, lifetime recovery window, sync restore points, sync quarantine for contaminated records, server health, data health, vault health and version/build health.

Advanced default recommendation: 15 users, 15 devices and 10 branches. Existing higher ceilings are grandfathered and never silently reduced.

## Tenant data isolation and no-delete policy

Use one MariaDB server with a permanent `master_control` database and a separate database per tenant, for example `tenant_000001`. The master database contains tenants, subscriptions, devices, plans, domains, migration versions and encrypted database credentials. Each tenant database contains only that tenant's business tables.

The application creates tenant databases and tables automatically through versioned Knex migrations. Database names are generated by the server; users cannot inject a database name. Every tenant database also includes an internal `tenant_anchor` and a schema version table.

Tenant data will not be deleted on VPS restart, redeploy, logout, domain change, migration or device change. Tenant deletion in Master Panel will be disabled by default and replaced with suspend/lock/archive. A real wipe requires a separate master 2FA confirmation, typed tenant name, fresh encrypted backup and a cooling-off period. Normal “delete” actions use soft-delete and recovery status.

## PWA and offline rules

The PWA stores only the minimum encrypted offline workspace in IndexedDB. The server remains the authority for stock quantity, invoice numbering and permissions. Offline records get a client UUID and idempotency key. On reconnect, the server validates the tenant anchor, user, device, permission, record version and stock availability before committing.

Duplicate sale requests are rejected safely. Stock conflicts are resolved by the server transaction. Deletions are tombstones, not silent local removal. Sync is additive by default; records remain on the server even when an old device starts fresh.

## Recommended Node.js packages

Use open-source packages, not paid plugins:

- `express`, `typescript`, `tsx`, `zod`, `knex`, `mysql2`
- `argon2`, `jsonwebtoken`, `otplib`, `helmet`, `cors`
- `rate-limiter-flexible`, `pino`, `socket.io`, `compression`
- `node-cron`, `ioredis`, `bullmq` where background jobs are needed
- `vite`, `react`, `react-router-dom`, `vite-plugin-pwa`, `dexie`
- `react-hook-form`, `recharts`, `pdfkit`, `exceljs`, `papaparse`
- `multer`, `sharp`, `nodemailer`, `swagger-ui-express`

Redis is optional for a single VPS but recommended for rate limiting, job queues and live sync fan-out. MariaDB, Node.js, Nginx and the application can run without paid plugins.

## VPS and domain deployment

1. Point the domain DNS A record to the VPS IP.
2. Install Docker, Docker Compose, Nginx and firewall rules.
3. Run Node.js API, React/PWA static server, MariaDB and optional Redis in separate containers.
4. Put Nginx in front; expose only ports 80 and 443. Never expose MariaDB publicly.
5. Issue free Let's Encrypt SSL and force HTTPS.
6. Store secrets in VPS environment/secrets files, never in the frontend bundle.
7. Run migrations at deployment using a non-destructive migration command.
8. Run an encrypted MariaDB dump before deployment and on a scheduled daily basis.
9. Keep at least 7 daily, 4 weekly and 6 monthly backups on a separate disk or storage target.
10. Run health checks for API, MariaDB, disk space, backup age, sync queue, SSL expiry and tenant count.

## Implementation order

First build the control plane and tenant provisioning. Next build auth, permissions, devices, MariaDB migrations and tenant isolation. Then implement medicine, batches, stock, purchases and POS. After that implement khata, reports, PWA offline queue and sync. Finally add advanced accounting, regulatory, online store, WhatsApp, AI, CMS, fleet and master operations.

All production routes must pass: HTTPS check, token check, device check, tenant check, branch scope, permission code, request validation, transaction, audit event and response sanitization.

## Final scope statement

The attached function list is treated as the full product scope. Basic is the safe daily-operation edition; Advanced is the full enterprise edition. Both use the same MariaDB/Node.js core, so plan changes do not create a second codebase and do not move or delete tenant data.
