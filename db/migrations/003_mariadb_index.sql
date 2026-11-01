-- Phase 0: missing tables/columns that src/store.ts (MariaDB mode) already queries.
-- This file runs on first MariaDB init (see docker-compose.yml) and is
-- additive only: IF NOT EXISTS, never DROP, never ALTER away data.
-- 002_tenant_template.sql is a per-tenant template, NOT an init file, so
-- it is deliberately not mounted into /docker-entrypoint-initdb.d.
-- The tenant_user_index rows themselves are created by tenant provisioning
-- in Phase 1; this migration only creates the empty table + column.
-- Run this file inside your registry database (the one in MARIADB_DATABASE).
-- The old 'USE master_control' line was removed: it failed on any other DB name.

CREATE TABLE IF NOT EXISTS tenant_user_index (
  user_id VARCHAR(96) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  name VARCHAR(160) NOT NULL,
  login VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(80) NOT NULL,
  branch_ids_json JSON NOT NULL,
  permissions_json JSON NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_tenant_user_index_tenant (tenant_id)
) ENGINE=InnoDB;

ALTER TABLE tenants ADD COLUMN IF NOT EXISTS branch_summary_json JSON NULL;
