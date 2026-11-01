-- Phase 4 slice 3: prescriptions + controlled drug log (tenant DB only).
-- The app also auto-creates these on first use (ensurePhase4Slice3Tables),
-- including the is_controlled column on existing medicines tables.
ALTER TABLE medicines ADD COLUMN IF NOT EXISTS is_controlled BOOLEAN NOT NULL DEFAULT FALSE;
CREATE TABLE IF NOT EXISTS prescriptions (
  id VARCHAR(96) PRIMARY KEY,
  patient_name VARCHAR(220) NOT NULL,
  doctor_name VARCHAR(220) NOT NULL,
  branch_id VARCHAR(96) NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  created_by VARCHAR(96) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_rx_status (status)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS prescription_items (
  prescription_id VARCHAR(96) NOT NULL,
  medicine_id VARCHAR(96) NOT NULL,
  quantity INT NOT NULL,
  dosage VARCHAR(120) NULL,
  instructions VARCHAR(300) NULL,
  PRIMARY KEY (prescription_id, medicine_id)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS controlled_logs (
  id VARCHAR(96) PRIMARY KEY,
  medicine_id VARCHAR(96) NOT NULL,
  batch_id VARCHAR(96) NOT NULL,
  branch_id VARCHAR(96) NOT NULL,
  quantity INT NOT NULL,
  prescription_id VARCHAR(96) NULL,
  action VARCHAR(30) NOT NULL,
  created_by VARCHAR(96) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_controlled_medicine (medicine_id)
) ENGINE=InnoDB;
