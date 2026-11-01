-- Migration 004: AI credits + home layout, per tenant database.
-- Apply this file to EACH tenant database (tenant_000001, ...), NOT to
-- master_control. New tenants get these tables from provisionTenant.
-- Older tenants do NOT need a manual run: the store creates these tables
-- with CREATE TABLE IF NOT EXISTS on first home-layout / AI-credits use.
-- A tenant's layout and credits never live in another tenant's database.

CREATE TABLE IF NOT EXISTS home_layout (
  id INT PRIMARY KEY,
  layout_json JSON NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS ai_credits (
  id INT PRIMARY KEY,
  credits_total INT NOT NULL,
  credits_used INT NOT NULL DEFAULT 0,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
