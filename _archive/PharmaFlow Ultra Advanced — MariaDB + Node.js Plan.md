# PharmaFlow Ultra Advanced — MariaDB + Node.js Plan

## Single-plan architecture

System ka central source of truth ek office/server computer par chalega. Teen registered devices browser se Node.js server par HTTPS ke through connect honge. Device 1 owner/admin, Device 2 branch manager/POS aur Device 3 pharmacist/inventory ho sakta hai. Roles fixed nahi honge: admin panel se har user ko exact function-level permission aur branch scope assign ki ja sakegi.

Recommended stack: Node.js + TypeScript + Express, MariaDB 11, Redis optional for session/rate-limit cache, Socket.IO/WebSocket for live updates, React + Vite frontend, Nginx reverse proxy, local encrypted file storage and scheduled MariaDB backups. Zero-cost deployment ke liye ye sab existing server computer par chal sakta hai.

## 3-device sync method

MariaDB central database rahega. Devices database ko direct access nahi karenge; sirf Node.js API se baat karenge. Isse database credentials clients mein expose nahi honge.

Every stock-changing record ko `stock_movements` ledger, `idempotency_key`, `server_version`, `created_at` and `created_by` ke saath save kiya jayega. Sale, transfer, purchase ya adjustment ek MariaDB transaction mein complete hoga. Commit ke baad server WebSocket event teenon devices ko bhejega. Agar koi device temporarily offline ho, to woh last sync cursor save karega aur reconnect par missing events order mein pull karega.

Conflict rule: stock quantity ka final decision server transaction karega. Client local quantity ko authoritative nahi maanega. Duplicate request ko idempotency key rokegi. Transfer workflow Request → Approve → Dispatch → Receive hoga.

## Per-user function control

Permission sirf role-level nahi hogi. Admin kisi user ke liye individual permission set kar sakega:

- Inventory: view, create, edit, delete, stock adjustment, export.
- Sales: view, create sale, void, refund, discount, price override.
- Purchases: view, create, edit, approve, receive, return.
- Transfers: request, approve, dispatch, receive, reject.
- Reports: view, export, financial reports, audit reports.
- Users: create, edit, disable, reset password, assign device.
- Settings: pharmacy, branch, tax, invoice, backup, security.

Har permission ke saath branch scope hoga: all branches, assigned branches, ya own branch. High-risk actions ke liye approval limit aur second approval required ki ja sakti hai.

## HWID and device security

Raw hardware ID ko database mein plain text save nahi karna. Device registration ke waqt application ek device key pair create karegi. Private key device ke secure local storage mein rahegi; server par public key aur salted/HMAC-protected device fingerprint save hoga. Har login/request mein device signed challenge bhejega.

Admin panel se device ko register, approve, rename, assign user/branch, revoke, freeze aur replace kiya ja sakega. Device change par old device revoke hoga. Password leak hone par bhi unregistered device login nahi kar sakega.

HWID ko single security layer nahi banana chahiye kyun ke hardware replace, OS reinstall ya VM par HWID change ho sakta hai. Isliye layered security use hogi: device key, MFA, short-lived access token, refresh-token rotation, session list, failed-login lockout, rate limit, audit log and optional IP allowlist. Recovery ke liye owner-approved device reset code required hoga.

## Admin panel modules

Admin dashboard mein system health, active devices, failed logins, low stock, expiring batches, pending approvals and last backup status dikhega. User management mein per-user permissions, role, branch, approval limit, active sessions and assigned device controls honge. Security center MFA policy, password policy, session timeout, IP allowlist, login lockout and emergency revoke provide karega. Audit center before/after values ke saath every important action show karega.

## MariaDB rules

Use InnoDB tables, foreign keys, UTC timestamps, utf8mb4, strict SQL mode and transactions. Unique indexes: `(organization_id, barcode)`, `(organization_id, sku)`, `(medicine_id, batch_no)`, `(branch_id, batch_id)` and `idempotency_key`. Index branch, barcode, expiry date, status, created_at and server_version. Sensitive prescription data encrypt karke store karein. Soft-delete master records; sales and audit records ko hard-delete na karein.

## Server access

Nginx HTTPS termination karega aur Node.js ko localhost par proxy karega. Devices public database port ko access nahi karenge. Local-only deployment mein firewall sirf office LAN allow karega. Remote branches ke liye secure VPN/private network use karein; database port ko internet par expose na karein.

## Backup and recovery

Daily encrypted `mariadb-dump` backup local second disk ya USB par save hoga. Weekly restore test karna mandatory hai. Backup status admin dashboard par show hoga. Emergency recovery ke liye latest backup, application `.env` secret backup and device revoke procedure documented honge.

## Core API shape

`POST /auth/login`, `POST /auth/refresh`, `POST /devices/register`, `POST /devices/revoke`, `GET /me/permissions`, `GET /branches`, `GET /medicines`, `GET /inventory`, `POST /sales`, `POST /purchases`, `POST /transfers`, `POST /transfers/:id/approve`, `POST /transfers/:id/receive`, `GET /reports`, `GET /audit-logs`.

Every protected route middleware order: HTTPS check → access token → device signature → account status → branch scope → permission code → validation → transaction → audit event.

## Important reality

Three-device sync, HWID lock and full security central server ke saath achievable hain, lekin 100% unbreakable security exist nahi karti. Strong layered controls, backups and admin recovery process practical target hain. Paid cloud ki zaroorat nahi; existing computer, local network and open-source software use kiya ja sakta hai. Electricity, existing hardware and internet/VPN availability separate operational requirements hain.
