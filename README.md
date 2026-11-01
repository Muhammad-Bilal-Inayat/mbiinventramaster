# MBI Inventra SaaS — Pharmacy & Inventory Management

Modern multi-tenant pharmacy command center: one Node.js API, MariaDB data isolation, PWA shell, device-aware sessions and Git-to-VPS deployment.

Brand: MBI Inventra logo is in `public/assets/brand/` (MBI-LOGO.png, logo-192.png, logo-512.png, favicon.png). It is used on login, header, PWA manifest and favicon. The old teal-cross icon.svg is in `_archive/` and must not be used.

## Project structure (Phase 0)

```text
src/                  Express API: server, routes, store, security, catalog
public/               PWA: index, app, styles, service worker, manifest, brand assets
db/migrations/        001 master_control, 002 tenant template, 003 MariaDB index
infra/                nginx.conf (HTTP bootstrap), nginx-https.conf, backup.sh
_archive/             Reference only: sketches, alternative specs, duplicate zip.
                      Never served, never in Docker images (.dockerignore).
Dockerfile            Root build (copies src/ and public/)
docker-compose.yml    api + mariadb:11.4 + redis:7 + nginx
```

## Local preview

```bash
cp .env.example .env
npm install
ALLOW_DEMO_AUTH=true STORAGE_MODE=memory npm run dev
```

Open `http://localhost:3000` and sign in with `owner` / `demo12345` for the seeded preview tenant. This demo account must not be used in production. In production, `ALLOW_DEMO_AUTH` must stay `false` and `JWT_SECRET` must be set: the server refuses to start in production without it.

## Production shape

Use `STORAGE_MODE=mariadb`, a strong `JWT_SECRET`, MariaDB credentials and a private VPS network. Run `docker compose up -d --build`; put Nginx/Let's Encrypt in front of the API. Only ports 80/443 should be public. Run `./infra/backup.sh` before releases and keep encrypted backups outside the release folder.

HTTPS flow: start with `infra/nginx.conf` (HTTP + Certbot challenge), issue certificates, then copy `infra/nginx-https.conf` over `infra/nginx.conf`, replace `example.com` with your domain, and restart Nginx. Do not enable HTTPS before certificates exist, or Nginx will fail to start.

## Tenant isolation

The production plan is `master_control` plus one database per tenant. The signed token carries tenant identity; route middleware resolves tenant from the token and refuses client-supplied tenant IDs. Migrations are additive. Subscription lock/archive does not delete data.

Device rule (Phase 0, fixed): 3 devices per tenant, every plan. Login reuses an existing HWID device instead of minting a new one, and refuses a fourth active device. A revoked device is rejected on every protected route, even on an old token. A non-active tenant (locked, maintenance, archived) is rejected on every protected route, even on an old token.

CORS rule (Phase 0): no origin is reflected in production. Set `CORS_ORIGIN` to a comma-separated allow-list for a separate frontend origin. Same-origin PWA requests need no CORS entry.

## What Phase 0 does NOT do yet

- Real POS, purchase, inventory CRUD, khata, sales transactions: not yet built (Phase 2/3).
- Offline sync storage: `/api/sync/push` returns 501 SYNC_NOT_IMPLEMENTED and requires `x-idempotency-key`, so clients must keep records in their local queue. It never pretends a record was saved.
- Sync cursor: `/api/sync/health` returns `cursor: null, cursorImplemented: false`. Cursor sync lands in Phase 6.
- MariaDB tenant provisioning: `db/migrations/003_mariadb_index.sql` creates the empty `tenant_user_index` table and `tenants.branch_summary_json` column that the MariaDB store queries. Inserting tenant/user rows into that index is Phase 1 provisioning work, not done in Phase 0.
- MariaDB dashboard: in MariaDB mode the dashboard returns zeros until real reporting queries land in Phase 2/3. Demo dashboard numbers exist only in memory mode and must never be shown as production data.

## Pre-push verify rule (standing, 2026-11-01)

No push to main without: `npm run check` + `npm run build` green, every
new/changed endpoint tested (success + auth fail + invalid input), a grep
audit of `src/` + `public/` for TODO/stub/placeholder/demo/hardcoded, every
visible button/nav/page either fully functional or clearly labelled
"Coming soon / not built yet" (no fake success, fake trend, or fake number),
no unused exports/functions/routes, and any remaining stub returning only
501/503 with a clear "not saved" message — never a fake success. Claim only
the scope that was actually tested. After push, verify via the GitHub API
tree (commit SHA, parent, file count, key paths) and reset the local clone.

## AI + drag-drop home (Groq, per tenant)

- AI chat: POST /api/ai/chat, JWT tenant only. The server calls Groq with
  GROQ_API_KEY from the server env only. No key in Git, no key in a request,
  no key in chat. If the key is missing: 503 AI_NOT_CONFIGURED, no credit
  consumed, never a fake answer.
- Credits: 1 chat request = 1 credit. Default credits = plan aiQuota
  (Basic 20, Advanced 300). Master Admin sets a custom number per tenant
  via POST /api/master/ai-credits (Master key) and reads it via
  GET /api/master/ai-credits?tenantId=. Credits finished or disabled:
  403, AI stays off, tenant data stays on.
- AI icon: the chat button uses the MBI logo (public/assets/brand/MBI-LOGO.png).
- Home drag-drop: GET/POST /api/home/layout. Each tenant drags its own
  widgets (kpis, branch, alerts, top, activity, command) into its own order.
  Layout is saved in that tenant's own database only, never shared.
  The layout must contain each widget exactly once, or the API returns 400.
- Tenant AI context is only that tenant's name, plan, branches and
  dashboard counts. No other tenant's data is ever sent to the AI.

## Phase 4 slice 3: Prescriptions + Controlled drugs (local, not pushed yet)

Advanced only, same rule as slices 1–2. New permissions
prescriptions.create / prescriptions.dispense (owner + pharmacist;
provisioned owners get them too).
- Medicine flag isControlled (create form checkbox, or
  POST /api/inventory/medicines/:id/controlled, inventory.edit).
- Prescriptions: create (patient, doctor, branch, items with dosage),
  list, dispense (FEFO stock deduction, no sale), cancel (pending only).
- Controlled sale gate: a controlled medicine in a POS sale needs a
  PENDING prescription for the same branch covering the quantity
  (else 400 CONTROLLED_PRESCRIPTION_REQUIRED / PRESCRIPTION_QTY_EXCEEDED);
  the sale marks the prescription dispensed. Reuse of a dispensed
  prescription is 409. Every controlled sale and dispense writes a
  controlled-log entry (GET /api/controlled-log).
- Frontend: new Prescriptions nav page (create, dispense, cancel,
  controlled log), Prescription ID field on the Sales page, controlled
  checkbox on the Add medicine form.
- Migration db/migrations/007_tenant_prescriptions_controlled.sql
  (tenant DBs only; tables + is_controlled column also auto-created).
- Remaining Phase 4 modules NOT built yet: online store, staff
  attendance/payroll.

## Phase 4 slice 2: Accounting (pushed, commit 54fd7e1)

Advanced only, same rule as slice 1. No separate stored ledger table:
the summary and ledger are derived from Phase 3 sales, purchases and
khata entries every time, so accounting can never drift from the menus.
- GET /api/accounting/summary (accounting.view, Advanced gate, optional
  ?from=&to=&branchId=): revenue, approved purchases, profit (sales minus
  batch purchase cost), receivable (positive customer khata balances),
  payable (positive supplier khata balances), cash received on sales,
  plus a ledger (sale cash/revenue, sale credit, purchase stock/payment/
  payable, khata payments, newest 200, chronological).
- Honest limit: this is a derived summary + ledger, not an immutable
  journal. A sale whose balance was later paid or returned shows its
  CURRENT balance in the ledger, not its original credit at sale time.
  A stored, immutable journal at transaction time is a future accounting
  step, not claimed here.
- Frontend: Accounting panel inside the Reports page (summary cards +
  ledger table). No new nav item, no new migration file (derived only).
- Remaining Phase 4 modules NOT built yet: prescriptions, controlled
  drugs, online store, staff attendance/payroll.

## Phase 4 slice 1: Reports/Export + Branch Transfer (pushed, commit c1cdd5a)

Phase 4 is 7 modules, so it is built in slices, not all at once — this slice
is the one that syncs directly with Phase 3 data. Remaining Phase 4 modules
(prescriptions, controlled drugs, full accounting, online store, staff
attendance/payroll) are NOT built yet and stay Coming soon.
- Reports: GET /api/reports/sales (reports.view) with ?from=&to=&branchId=.
  Totals come from the same sales/purchases/stock tables as Phase 3, so
  report total = dashboard revenue = sales list total. Profit = sales minus
  batch purchase cost. CSV: GET /api/reports/sales/export (reports.export,
  downloaded with the session token, not a bare link).
- Transfers: POST /api/transfers (transfers.request) creates a PENDING
  transfer — no stock moves. POST /api/transfers/:id/approve
  (transfers.approve) moves stock source -> destination in one MariaDB
  transaction (source stock re-checked, insufficient = 400, no partial move);
  reject moves nothing; double approve = 409; same-branch = 400.
- Advanced-only: both reports and transfers return 403 PLAN_NOT_ADVANCED
  for Basic tenants, server-side, not just hidden in the UI.
- Frontend: Reports nav page is now real (filters, summary, branch/top
  products, CSV download, transfer request/approve/reject). Branches,
  Devices, Sync, Settings stay Coming soon.
- Tables: db/migrations/006_tenant_reports_transfers.sql (tenant DBs only),
  also auto-created on first use.

## Phase 3: POS, Purchases, Khata (pushed, commit 94c4fcf)

- POS sale: POST /api/sales (permission sales.create, branch access).
  FEFO allocation across batches, invoice INV-000001 style, stock + movement
  + audit + khata in one MariaDB transaction (pre-checked in memory).
  Insufficient stock fails the whole sale, nothing is sold. Cash sale must be
  fully paid; credit sale needs a customer and the balance goes to khata.
  Discount > 0 needs sales.discount permission (403 otherwise).
- Return: POST /api/sales/:id/return (sales.refund). Quantity over sold is
  blocked, stock comes back, khata balance falls (credit sale), refund is
  discount-apportioned. Any refund above the khata balance is a counter cash
  refund, not a khata entry.
- Parties & khata: POST/GET /api/parties, GET /api/parties/:id/statement,
  POST /api/parties/:id/pay (parties.payment). Customer balance = debit -
  credit, supplier balance = credit - debit. Payments are allocated FIFO to
  the oldest open credit sales / purchases, so sale/purchase balanceDue and
  khata balance stay the same truth.
- Purchases: POST /api/purchases (purchases.create). If the creator has
  purchases.approve, the purchase is approved at once and stock + supplier
  khata move. Otherwise it stays pending — no stock, no khata — until
  POST /api/purchases/:id/approve (purchases.approve, 403 for others, 409 on
  double approve). Existing batch numbers keep their sale price; new batches
  get the purchase's prices.
- Menus sync: dashboard is no longer zeros in MariaDB — revenue, profit
  (sales minus batch purchase cost), low/expiring counts, SKU count, branch
  performance, top products (discount-apportioned, so top revenue sums to
  dashboard revenue) and activity are all computed from the same sales,
  purchases, stock and batch tables. Memory mode shows the same computed
  dashboard once real sales/purchases exist; before that it shows the demo
  preview, labelled as such in the UI.
- Tables: db/migrations/005_tenant_pos_khata.sql (tenant DBs only), also
  auto-created on first use. Frontend: Sales / POS page and Purchases &
  Khata page are now real. Reports, Branches, Devices, Sync, Settings stay
  Coming soon (Devices API already works; its page is not built yet).

## Phase 2: Inventory core (pushed, commit a06ace2)

- Medicines: POST/GET /api/inventory/medicines, POST /api/inventory/medicines/import
  (max 200, partial failures in failed[]), POST /api/inventory/medicines/:id/active
  (deactivate, never hard delete). SKU and barcode unique per tenant.
- Batches: POST /api/inventory/batches, GET /api/inventory/medicines/:id/batches.
  Batch number unique per medicine. Expiry date YYYY-MM-DD.
- Stock: POST /api/inventory/stock/adjust (permission inventory.adjust,
  branch access enforced, idempotencyKey required). Transaction + row lock
  in MariaDB, stock never negative, movement + audit log in one transaction.
  Same idempotency key returns the same movement, stock is not doubled.
- FEFO: GET /api/inventory/fefo?medicineId=&branchId= returns the earliest
  non-expired batch with stock for that branch, or 404.
- Alerts: GET /api/inventory/alerts — low stock (quantity <= reorder level),
  expiring soon (90 days), expired with stock (do not sell).
- Frontend: Inventory nav page is now real (search, list, batches, add
  medicine/batch, adjust stock, alerts). Other nav pages stay Coming soon.

## Phase 1: tenant provisioning (MariaDB only)

POST /api/master/tenants creates a tenant the safe way:

- Header: `x-master-key` must equal the server env `MASTER_ADMIN_KEY`.
  If that env is unset, the route returns 503 and provisioning is disabled.
- Body: tenant name, plan (basic/advanced), owner name/login/password
  (min 8), branch name/city. No database name, no database password in the body.
- The server generates the database name (tenant_000001, tenant_000002, ...),
  creates that database, applies `db/migrations/002_tenant_template.sql`
  inside it only, seeds one branch + one Owner + owner permissions, then
  writes the master `tenants` row and the `tenant_user_index` row last.
- If provisioning fails after CREATE DATABASE, the new database is left
  in place and reported, never auto-dropped.
- Database credentials always come from the server env
  (MARIADB_HOST / MARIADB_USER / MARIADB_PASSWORD). They are never put in
  Git, never in a request, and never in chat. A password that was ever
  shared in chat must be changed in the hosting panel first, then updated
  in the server env — the old value must not be reused for a live test.
- `Host: localhost` means the database is only reachable from the server
  that hosts the site itself. A live MariaDB test therefore has to run on
  that server after deploy, not from a different machine.

## Git release

```bash
npm run check
npm test
git add .
git commit -m "feat: ..."
git push origin main
```

See `plan.md`, `TODO.md` and `db/migrations/` for the implementation boundary and next modules.
