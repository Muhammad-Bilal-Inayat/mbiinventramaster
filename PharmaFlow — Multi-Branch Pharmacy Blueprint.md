# PharmaFlow — Multi-Branch Pharmacy Blueprint

## Recommended direction

A secure cloud-based multi-branch system with one central database, branch-level inventory, batch/expiry tracking, FEFO (First Expiry, First Out), POS, purchase orders, inter-branch transfers, prescriptions, audit logs and management analytics.

## Best technology stack

- **Frontend:** Next.js + TypeScript + Tailwind CSS; responsive web portal and POS mode.
- **Backend:** NestJS + TypeScript with modular services and REST APIs; WebSockets for live stock updates.
- **Primary database:** PostgreSQL 16. Use relational transactions for sales, stock and payments.
- **Cache and concurrency:** Redis for sessions, dashboard cache, barcode lookup and stock locks.
- **Async jobs:** RabbitMQ or AWS SQS for notifications, report generation, invoice PDF and integrations.
- **Files:** S3-compatible object storage for prescriptions, invoice PDFs and backups.
- **Deployment:** Docker, managed PostgreSQL, CDN/WAF, daily encrypted backups and monitoring.

For a first production version, use a modular monolith rather than many independent microservices. Keep clear modules so services can be split later without making the first release expensive or fragile.

## Core database design

Use PostgreSQL with these main tables:

- `organizations`: pharmacy company / tenant.
- `branches`: branch profile, address, timezone, tax registration and active status.
- `users`: staff identity and login status.
- `roles`, `permissions`, `user_roles`: RBAC access control.
- `medicines`: generic name, brand name, strength, dosage form, barcode, category, controlled-drug flag.
- `suppliers`: supplier master data and payment terms.
- `medicine_batches`: batch number, medicine ID, supplier ID, purchase price, sale price, manufactured date, expiry date.
- `branch_stock`: branch ID, batch ID, on-hand quantity, reserved quantity, reorder level, rack/bin.
- `stock_movements`: immutable ledger for purchase, sale, return, transfer, adjustment and expiry write-off.
- `purchase_orders`, `purchase_items`: supplier purchase workflow.
- `sales`, `sale_items`, `payments`: POS and invoice records.
- `stock_transfers`, `transfer_items`: branch-to-branch request, dispatch, receive and reject states.
- `prescriptions`, `prescription_items`: patient prescription records with restricted access.
- `customers`: optional customer/patient profile.
- `audit_logs`: who changed what, before/after values, IP, timestamp.
- `notifications`: low-stock, expiry, approval and failed integration alerts.
- `integration_events`: payment/tax/e-invoice sync and retry status.

### Important database rules

1. Every business table carries `organization_id`; branch-specific tables also carry `branch_id`.
2. Never overwrite stock history. `stock_movements` is append-only; current quantity is updated transactionally in `branch_stock`.
3. Add unique constraints on `(organization_id, barcode)` and `(medicine_id, batch_number, supplier_id)` where appropriate.
4. Use database transactions and row locks while completing a sale or transfer to prevent overselling.
5. Index `branch_id`, `medicine_id`, `expiry_date`, `barcode`, `created_at` and status fields.
6. Use soft delete for master data; preserve invoices, prescriptions and audit records.
7. Encrypt sensitive prescription/patient fields at rest and restrict them with role permissions.

## Branch workflows

- **Head office:** creates medicines, users, suppliers, reorder policies and price rules.
- **Branch:** receives purchases, sells through POS, performs approved adjustments and requests transfers.
- **Transfer:** Request → Approve → Dispatch → In Transit → Receive; quantity differences require reason and audit entry.
- **Expiry:** Dashboard alert at 180/90/30 days; FEFO suggestion at POS; expired stock is blocked from sale.
- **Offline POS option:** cache product catalog and create signed local transactions; sync with conflict handling when online.

## Recommended color theme

**Theme name: Clinical Navy + Teal**

- Navy `#102A43`: sidebar, headings, trust and authority.
- Teal `#0F766E`: primary actions, pharmacy/health identity.
- Sky Blue `#2563EB`: links, analytics and informational states.
- Mint `#E8F3F1`: subtle backgrounds and selected navigation.
- Green `#15803D`: healthy stock / success.
- Amber `#B45309`: low stock / warning.
- Red `#C2413B`: expired, blocked or critical alert.
- Slate `#627D98`: secondary text.
- Background `#F5F7FA`, surfaces `#FFFFFF`.

This is better than an all-green design because navy gives enterprise trust, teal feels medical without looking like a hospital template, and amber/red remain clear for operational alerts. Use color with text and icons so the interface remains accessible for color-blind users.

## Security and advanced features

MFA for admin/manager accounts, branch-scoped permissions, approval workflows for stock adjustments, immutable audit logs, encrypted backups, session/device management, IP/device alerts, rate limiting, API keys for integrations, and automatic daily reconciliation between sales and stock.

## Visual files

- `pharmacy_architecture.mmd`: editable architecture source.
- `inventory_screen.html`: editable screen sketch source.
