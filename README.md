# MBI Inventra SaaS

Modern multi-tenant pharmacy command center: one Node.js API, MariaDB data isolation, PWA shell, device-aware sessions and Git-to-VPS deployment.

## Local preview

```bash
cp .env.example .env
npm install
ALLOW_DEMO_AUTH=true STORAGE_MODE=memory npm run dev
```

Open `http://localhost:3000` and sign in with `owner` / `demo12345` for the seeded preview tenant. This demo account must not be used in production.

## Production shape

Use `STORAGE_MODE=mariadb`, strong `JWT_SECRET`, MariaDB credentials and a private VPS network. Run `docker compose up -d --build`; put Nginx/Let's Encrypt in front of the API. Only ports 80/443 should be public. Run `./infra/backup.sh` before releases and keep encrypted backups outside the release folder.

## Tenant isolation

The production plan is `master_control` plus one database per tenant. The signed token carries tenant identity; route middleware resolves tenant from the token and refuses client-supplied tenant IDs. Migrations are additive. Subscription lock/archive does not delete data.

## Git release

```bash
npm run check
npm test
git add .
git commit -m "feat: initialize MBI Inventra SaaS foundation"
git push origin main
```

See `plan.md`, `TODO.md` and `db/migrations/` for the implementation boundary and next modules.
