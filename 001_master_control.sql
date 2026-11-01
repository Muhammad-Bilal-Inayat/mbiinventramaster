CREATE DATABASE IF NOT EXISTS master_control CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE master_control;

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
