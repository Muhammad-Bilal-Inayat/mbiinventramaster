-- Phase 4 slice 4: staff attendance + payroll profiles (tenant DB only).
-- The app also auto-creates these on first use (ensurePhase4Slice4Tables).
CREATE TABLE IF NOT EXISTS attendance (
  id VARCHAR(96) PRIMARY KEY,
  user_id VARCHAR(96) NOT NULL,
  branch_id VARCHAR(96) NOT NULL,
  attendance_date DATE NOT NULL,
  check_in TIMESTAMP NULL,
  check_out TIMESTAMP NULL,
  hours DECIMAL(6,2) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_attendance_user_date (user_id, attendance_date),
  INDEX idx_attendance_date (attendance_date)
) ENGINE=InnoDB;
CREATE TABLE IF NOT EXISTS staff_profiles (
  user_id VARCHAR(96) PRIMARY KEY,
  monthly_salary DECIMAL(14,2) NOT NULL DEFAULT 0
) ENGINE=InnoDB;
