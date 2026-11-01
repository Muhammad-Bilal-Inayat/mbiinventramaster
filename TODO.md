# MBI Inventra — Delivery TODO

## Delivered in this foundation

- [ ] One Node.js API serves a modern SaaS dashboard and health endpoint.
- [ ] Basic and Advanced plan catalogs exist in one codebase.
- [ ] Tenant is resolved from signed server session, not a client-supplied tenant ID.
- [ ] Three device slots have registration/status/revoke APIs and device-scoped sessions.
- [ ] User, branch and function permission checks are represented server-side.
- [ ] MariaDB master-control and tenant-template migrations are included.
- [ ] PWA manifest, service worker, offline shell and route manifest are included.
- [ ] Docker Compose, production Dockerfile, Nginx and backup scripts are included.

## Next production modules

- [ ] Replace demo memory adapter with provisioned MariaDB tenant databases on VPS.
- [ ] Add real user registration, OTP email, Google OAuth and TOTP enrollment UI.
- [ ] Add CRUD pages and transactional APIs for medicines, batches, inventory, sales, purchases and khata.
- [ ] Add WebSocket/SSE live tenant events and cursor-based offline queue reconciliation.
- [ ] Add Master Admin provisioning, subscription, licence, domain and support screens.
- [ ] Add accounting, prescriptions, controlled-drug registers, attendance, payroll, store, WhatsApp, AI and CMS modules.
- [ ] Add CI workflow for lint, typecheck, tenant isolation, build and Docker release.
- [ ] Connect GitHub repository and deploy to a real VPS with secrets, DNS and backups.

## Acceptance constraints

- A tenant user must never receive another tenant's records.
- Device 1, Device 2 and Device 3 must sync through the API without direct database access.
- Subscription changes must not delete tenant data.
- Migrations must be additive and must not drop tenant databases or live tables.
- Offline records must use idempotency keys and server-side conflict validation.
- Production secrets must never be committed to Git.
