-- Phase 5 slice 1: registry auto-setup reference (tenant DBs are NOT here).
-- The app itself runs these statements on MariaDB boot
-- (ensureMasterTables in src/store.ts) and again before provisioning,
-- inside whatever database MARIADB_DATABASE points to. No USE statement:
-- the old 001/003 files hardcoded master_control and failed on other DBs.
-- This file is only a readable copy of that same DDL; it is not required
-- to run it by hand anymore.
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(64) PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS tenants (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  database_name VARCHAR(96) NOT NULL UNIQUE,
  plan ENUM('basic','advanced') NOT NULL DEFAULT 'basic',
  status ENUM('active','locked','maintenance','archived') NOT NULL DEFAULT 'active',
  branch_summary_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS tenant_domains (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  hostname VARCHAR(255) NOT NULL UNIQUE,
  verified_at TIMESTAMP NULL,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS tenant_devices (
  id VARCHAR(96) PRIMARY KEY,
  tenant_id VARCHAR(64) NOT NULL,
  user_id VARCHAR(96) NOT NULL,
  device_name VARCHAR(120) NOT NULL,
  hwid_hash CHAR(64) NOT NULL,
  public_key TEXT NULL,
  status ENUM('active','pending','revoked','frozen') NOT NULL DEFAULT 'pending',
  last_seen_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES tenants(id),
  INDEX idx_device_tenant_status (tenant_id, status)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS master_audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_id VARCHAR(96) NOT NULL,
  action VARCHAR(96) NOT NULL,
  tenant_id VARCHAR(64) NULL,
  metadata_json JSON NULL,
  ip_address VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_master_audit_tenant_time (tenant_id, created_at)
) ENGINE=InnoDB;
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
