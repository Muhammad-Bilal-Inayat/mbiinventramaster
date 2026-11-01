-- Phase 4 slice 5 — Online store (tenant database).
-- Reference copy only: the app also creates these tables on demand via
-- ensurePhase4Slice5Tables, so older tenants get them without a manual run.
-- Orders are a separate channel from POS sales: placement checks stock but
-- deducts nothing; confirm deducts FEFO stock; reject moves nothing.
-- Controlled medicines are never sold online (no anonymous prescription).
CREATE TABLE IF NOT EXISTS online_orders (
  id VARCHAR(96) PRIMARY KEY,
  order_no VARCHAR(64) NOT NULL UNIQUE,
  branch_id VARCHAR(96) NOT NULL,
  customer_name VARCHAR(220) NOT NULL,
  customer_phone VARCHAR(60) NOT NULL,
  address VARCHAR(400) NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  total DECIMAL(14,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_online_order_status (status)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS online_order_items (
  order_id VARCHAR(96) NOT NULL,
  medicine_id VARCHAR(96) NOT NULL,
  medicine_name VARCHAR(220) NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(14,2) NOT NULL,
  PRIMARY KEY (order_id, medicine_id)
) ENGINE=InnoDB;

-- Master feature flags (registry database, not the tenant database):
-- tenants.feature_flags_json JSON NULL, added by ensureMasterTables with an
-- INFORMATION_SCHEMA check. Today only {"onlineStore": true|false} exists;
-- more per-function flags reuse this column. Default (missing) = ON.
