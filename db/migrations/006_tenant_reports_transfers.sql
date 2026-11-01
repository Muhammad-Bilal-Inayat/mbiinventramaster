-- Phase 4 slice 1: Reports use existing sales/purchases/stock tables (no new
-- report tables). Only transfers is new, for a TENANT database, NOT master_control.
-- Also auto-created on first use via ensurePhase4Tables. Additive only.
CREATE TABLE IF NOT EXISTS transfers (id VARCHAR(96) PRIMARY KEY, medicine_id VARCHAR(96) NOT NULL, batch_id VARCHAR(96) NOT NULL, batch_no VARCHAR(96) NOT NULL, from_branch_id VARCHAR(96) NOT NULL, to_branch_id VARCHAR(96) NOT NULL, quantity INT NOT NULL, status VARCHAR(30) NOT NULL DEFAULT 'pending', created_by VARCHAR(96) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_transfer_status (status)) ENGINE=InnoDB;
