-- License Manager (Phase 5): registry tables, reference copy only.
-- The app creates these additively on MariaDB boot (ensureMasterTables
-- in src/store.ts) and on demand (ensureTables in src/master.ts).
-- No tenant business data lives here. A tenant has at most one
-- non-revoked license at a time; revoked licenses never block a new one.
CREATE TABLE IF NOT EXISTS licenses (
  id VARCHAR(96) PRIMARY KEY,
  license_key VARCHAR(64) NOT NULL UNIQUE,
  tenant_id VARCHAR(64) NULL,
  plan ENUM('basic','advanced') NOT NULL DEFAULT 'basic',
  status ENUM('active','suspended','revoked') NOT NULL DEFAULT 'active',
  start_date DATE NULL,
  expiry_date DATE NULL,
  lifetime BOOLEAN NOT NULL DEFAULT FALSE,
  max_devices INT NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_license_tenant (tenant_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS master_support_notes (
  tenant_id VARCHAR(64) PRIMARY KEY,
  note TEXT NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
