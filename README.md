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
