CREATE TABLE IF NOT EXISTS tenant_settings (
  setting_key VARCHAR(120) PRIMARY KEY,
  setting_value JSON NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS branches (
  id VARCHAR(96) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  city VARCHAR(120) NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(96) PRIMARY KEY,
  name VARCHAR(160) NOT NULL,
  login VARCHAR(160) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(80) NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_branch_access (
  user_id VARCHAR(96) NOT NULL,
  branch_id VARCHAR(96) NOT NULL,
  PRIMARY KEY (user_id, branch_id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (branch_id) REFERENCES branches(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS user_permissions (
  user_id VARCHAR(96) NOT NULL,
  permission_code VARCHAR(120) NOT NULL,
  PRIMARY KEY (user_id, permission_code),
  FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS medicines (
  id VARCHAR(96) PRIMARY KEY,
  sku VARCHAR(96) NOT NULL UNIQUE,
  barcode VARCHAR(128) NULL UNIQUE,
  name VARCHAR(220) NOT NULL,
  generic_salt VARCHAR(220) NULL,
  strength VARCHAR(120) NULL,
  dosage_form VARCHAR(80) NULL,
  category VARCHAR(120) NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_medicine_name (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS medicine_batches (
  id VARCHAR(96) PRIMARY KEY,
  medicine_id VARCHAR(96) NOT NULL,
  batch_no VARCHAR(96) NOT NULL,
  expiry_date DATE NOT NULL,
  purchase_price DECIMAL(14,2) NOT NULL DEFAULT 0,
  sale_price DECIMAL(14,2) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_medicine_batch (medicine_id, batch_no),
  FOREIGN KEY (medicine_id) REFERENCES medicines(id),
  INDEX idx_batch_expiry (expiry_date)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS branch_stock (
  branch_id VARCHAR(96) NOT NULL,
  batch_id VARCHAR(96) NOT NULL,
  quantity INT NOT NULL DEFAULT 0,
  reserved_quantity INT NOT NULL DEFAULT 0,
  reorder_level INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (branch_id, batch_id),
  FOREIGN KEY (branch_id) REFERENCES branches(id),
  FOREIGN KEY (batch_id) REFERENCES medicine_batches(id)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS stock_movements (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  movement_uuid CHAR(36) NOT NULL UNIQUE,
  branch_id VARCHAR(96) NOT NULL,
  batch_id VARCHAR(96) NOT NULL,
  movement_type VARCHAR(40) NOT NULL,
  quantity INT NOT NULL,
  reference_id VARCHAR(96) NULL,
  idempotency_key VARCHAR(160) NOT NULL UNIQUE,
  server_version BIGINT UNSIGNED NOT NULL,
  created_by VARCHAR(96) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_movement_cursor (server_version),
  INDEX idx_movement_branch_time (branch_id, created_at)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_id VARCHAR(96) NOT NULL,
  action VARCHAR(120) NOT NULL,
  entity VARCHAR(96) NOT NULL,
  entity_id VARCHAR(96) NULL,
  before_json JSON NULL,
  after_json JSON NULL,
  ip_address VARCHAR(64) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_audit_time (created_at)
) ENGINE=InnoDB;
