# MBI Inventra SaaS — Implementation Plan

## Product scope

A SaaS-style multi-tenant pharmacy management application served from one Node.js VPS. Each tenant has isolated data, subusers, branches, device bindings and PWA sync. Basic and Advanced plans share one codebase; server-side entitlements control access.

## Architecture

React-style PWA frontend assets are served by a Node.js/Express API. The API owns authentication, tenant resolution, permission checks, plan entitlements, device trust, dashboard data and sync endpoints. MariaDB is the production store; a safe in-memory demo adapter allows Preview and local smoke tests without secrets. Docker Compose runs API, MariaDB, Redis and Nginx on the VPS.

Tenant resolution is derived from the signed access token and server registry. Client-provided tenant IDs are not trusted. Production uses `master_control` plus one database per tenant; migrations create the master schema and tenant template without destructive drops.

## Design movement

- Clinical Command Center (0.04): dense operational panels with navy authority and teal actions.
- Calm Ledger (0.03): airy accounting interface with soft gray surfaces and restrained typography.
- Signal Grid (0.02): alert-led interface where status colors encode action priority.

Chosen direction: **Clinical Command Center**.

Core principles are operational clarity, quick scanning, trustworthy status signals and low-friction POS actions. Navy carries navigation and trust; teal marks safe primary actions; blue is informational; amber and red are reserved for attention. Layout uses a persistent command rail, wide content canvas, KPI strip, trend panels and alert queues. Signature elements are pill status labels, compact metric cards and a teal active rail. Motion stays subtle: content fades in, active tabs slide by 2px, and alerts pulse only once on first arrival. Typography uses Inter/system sans with large navy numerals and small uppercase section labels. Brand essence: a calm control room for pharmacy owners; precise, secure, practical. Voice is direct: “Keep every branch in sync.” and “Resolve today’s risks before they become tomorrow’s losses.”

## Project structure

- `src/server.ts`: Express entry, routes, static assets and graceful shutdown.
- `src/catalog.ts`: plans, modules, permissions and sample tenant data.
- `src/security.ts`: JWT, password hashing, device signing and permission helpers.
- `src/store.ts`: memory demo store plus MariaDB pool adapter boundary.
- `src/routes.ts`: health, auth, dashboard, tenants, devices, sync and catalog endpoints.
- `db/migrations/`: non-destructive MariaDB master and tenant schemas.
- `public/`: SaaS dashboard, PWA manifest, route manifest and service worker.
- `infra/`: Docker, Nginx and backup helpers.

## Build workflow

Install locked dependencies, run typecheck and tests, build the static client, run the API health check, commit to Git, push `main`, then deploy the release tag to VPS after an encrypted MariaDB backup. The repository is the source of truth; the VPS never edits source files.
