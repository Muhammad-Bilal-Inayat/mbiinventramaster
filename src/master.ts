import mariadb from "mariadb";
import crypto from "node:crypto";
import { randomId } from "./security.js";
import type { PlanId } from "./catalog.js";

// Master registry helpers (licenses, support notes, domains, audit).
// This module never touches tenant business data (sales, orders,
// inventory). It only reads/writes the master registry database, or an
// in-memory map when STORAGE_MODE is not mariadb (so the master panel
// endpoints are testable without a live database).
//
// License enforcement rule (documented in the panel and the report):
// - A tenant with NO license record keeps working. Existing tenants are
//   never broken by adding this module.
// - A tenant WITH a license is blocked (423 LICENSE_BLOCKED) while its
//   effective license status is suspended, revoked, or expired, unless
//   the license is lifetime. Blocking never deletes or modifies data.
// - A tenant has at most one non-revoked license at a time. Revoked
//   licenses do not block a new license being created or assigned.

export type LicenseStatus = "active" | "suspended" | "revoked";
export type LicenseEffectiveStatus = "active" | "suspended" | "revoked" | "expired" | "unlicensed";

export interface LicenseRecord {
  id: string;
  key: string;
  tenantId: string | null;
  plan: PlanId;
  status: LicenseStatus;
  effectiveStatus: LicenseEffectiveStatus;
  startDate: string | null;
  expiryDate: string | null;
  lifetime: boolean;
  maxDevices: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LicenseInput {
  tenantId?: string | null;
  plan: PlanId;
  key?: string;
  startDate?: string | null;
  expiryDate?: string | null;
  lifetime?: boolean;
  maxDevices?: number | null;
  notes?: string | null;
}

export interface AuditRecord {
  id: string;
  actor: string;
  action: string;
  tenantId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface DomainRecord {
  id: string;
  tenantId: string;
  hostname: string;
  verifiedAt: string | null;
}

export interface AnnouncementRecord {
  id: string;
  tenantId: string | null;
  title: string;
  body: string;
  active: boolean;
  createdAt: string;
}

const LICENSE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateLicenseKey(): string {
  const bytes = crypto.randomBytes(12);
  const chars = [...bytes].map((b) => LICENSE_CHARS[b % LICENSE_CHARS.length]).join("");
  return `MBI-${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8, 12)}`;
}

export function isExpiryPassed(license: { expiryDate: string | null; lifetime: boolean }): boolean {
  if (license.lifetime || !license.expiryDate) return false;
  const expiry = license.expiryDate;
  if (/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return expiry < new Date().toISOString().slice(0, 10);
  const time = new Date(expiry).getTime();
  return Number.isFinite(time) && time < Date.now();
}

export function effectiveStatus(license: LicenseRecord | null): LicenseEffectiveStatus {
  if (!license) return "unlicensed";
  if (license.status === "revoked") return "revoked";
  if (license.status === "suspended") return "suspended";
  if (isExpiryPassed(license)) return "expired";
  return "active";
}

export function isLicenseBlocked(license: LicenseRecord | null): boolean {
  const status = effectiveStatus(license);
  return status === "suspended" || status === "revoked" || status === "expired";
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

function parseDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return null;
  return value.slice(0, 10) === value ? value : new Date(value).toISOString().slice(0, 10);
}

class MasterRegistry {
  private memoryLicenses = new Map<string, LicenseRecord>();
  private memoryAudit: AuditRecord[] = [];
  private memoryNotes = new Map<string, string>();
  private memoryDomains = new Map<string, DomainRecord>();
  private memoryAnnouncements = new Map<string, AnnouncementRecord>();
  private registryPool: ReturnType<typeof mariadb.createPool> | null = null;

  private get isMariaDb(): boolean {
    return process.env.STORAGE_MODE === "mariadb";
  }

  private pool(): ReturnType<typeof mariadb.createPool> {
    if (!this.registryPool) {
      this.registryPool = mariadb.createPool({
        host: process.env.MARIADB_HOST,
        port: Number(process.env.MARIADB_PORT || 3306),
        user: process.env.MARIADB_USER,
        password: process.env.MARIADB_PASSWORD,
        database: process.env.MARIADB_DATABASE,
        connectionLimit: 5,
      });
    }
    return this.registryPool;
  }

  async ensureTables(): Promise<void> {
    if (!this.isMariaDb) return;
    const pool = this.pool();
    await pool.query("CREATE TABLE IF NOT EXISTS licenses (id VARCHAR(96) PRIMARY KEY, license_key VARCHAR(64) NOT NULL UNIQUE, tenant_id VARCHAR(64) NULL, plan ENUM('basic','advanced') NOT NULL DEFAULT 'basic', status ENUM('active','suspended','revoked') NOT NULL DEFAULT 'active', start_date DATE NULL, expiry_date DATE NULL, lifetime BOOLEAN NOT NULL DEFAULT FALSE, max_devices INT NULL, notes TEXT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, INDEX idx_license_tenant (tenant_id)) ENGINE=InnoDB");
    await pool.query("CREATE TABLE IF NOT EXISTS master_support_notes (tenant_id VARCHAR(64) PRIMARY KEY, note TEXT NOT NULL, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB");
    await pool.query("CREATE TABLE IF NOT EXISTS master_announcements (id VARCHAR(96) PRIMARY KEY, tenant_id VARCHAR(64) NULL, title VARCHAR(220) NOT NULL, body TEXT NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_announcement_tenant (tenant_id)) ENGINE=InnoDB");
    await pool.query("CREATE TABLE IF NOT EXISTS master_audit_logs (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, actor_id VARCHAR(96) NOT NULL, action VARCHAR(96) NOT NULL, tenant_id VARCHAR(64) NULL, metadata_json JSON NULL, ip_address VARCHAR(64) NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_master_audit_tenant_time (tenant_id, created_at)) ENGINE=InnoDB");
  }

  private mapLicenseRow(row: any): LicenseRecord {
    const record: LicenseRecord = {
      id: row.id,
      key: row.license_key ?? row.key,
      tenantId: row.tenant_id ?? row.tenantId ?? null,
      plan: row.plan,
      status: row.status,
      effectiveStatus: "active",
      startDate: parseDate(row.start_date ?? row.startDate),
      expiryDate: parseDate(row.expiry_date ?? row.expiryDate),
      lifetime: Boolean(row.lifetime),
      maxDevices: row.max_devices ?? row.maxDevices ?? null,
      notes: row.notes ?? null,
      createdAt: toIso(row.created_at ?? row.createdAt),
      updatedAt: toIso(row.updated_at ?? row.updatedAt),
    };
    record.effectiveStatus = effectiveStatus(record);
    return record;
  }

  async listLicenses(filters: { tenantId?: string; status?: string; plan?: string; expiringSoon?: boolean }): Promise<LicenseRecord[]> {
    let all: LicenseRecord[];
    if (this.isMariaDb) {
      await this.ensureTables();
      const rows = await this.pool().query("SELECT * FROM licenses ORDER BY created_at DESC, id DESC LIMIT 500") as any[];
      all = rows.map((r: any) => this.mapLicenseRow(r));
    } else {
      all = [...this.memoryLicenses.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    if (filters.tenantId) all = all.filter((l) => l.tenantId === filters.tenantId);
    if (filters.plan) all = all.filter((l) => l.plan === filters.plan);
    if (filters.status) all = all.filter((l) => l.effectiveStatus === filters.status);
    if (filters.expiringSoon) {
      const soon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      all = all.filter((l) => l.effectiveStatus === "active" && !l.lifetime && l.expiryDate !== null && l.expiryDate <= soon);
    }
    return all;
  }

  async getLicense(id: string): Promise<LicenseRecord | undefined> {
    if (this.isMariaDb) {
      await this.ensureTables();
      const rows = await this.pool().query("SELECT * FROM licenses WHERE id = ? LIMIT 1", [id]) as any[];
      return rows[0] ? this.mapLicenseRow(rows[0]) : undefined;
    }
    return this.memoryLicenses.get(id);
  }

  async getTenantLicense(tenantId: string): Promise<LicenseRecord | undefined> {
    const all = await this.listLicenses({ tenantId });
    return all.filter((l) => l.status !== "revoked").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  }

  async createLicense(input: LicenseInput): Promise<LicenseRecord> {
    const key = (input.key ?? generateLicenseKey()).trim().toUpperCase();
    if (key.length < 8 || key.length > 64) throw new Error("INVALID_LICENSE_KEY");
    if (input.tenantId) {
      const existing = await this.getTenantLicense(input.tenantId);
      if (existing) throw new Error("LICENSE_ALREADY_ASSIGNED");
    }
    const now = new Date().toISOString();
    const record: LicenseRecord = {
      id: randomId("lic"),
      key,
      tenantId: input.tenantId ?? null,
      plan: input.plan,
      status: "active",
      effectiveStatus: "active",
      startDate: input.startDate ? parseDate(input.startDate) : now.slice(0, 10),
      expiryDate: input.lifetime ? null : parseDate(input.expiryDate),
      lifetime: Boolean(input.lifetime),
      maxDevices: input.maxDevices ?? null,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };
    record.effectiveStatus = effectiveStatus(record);
    if (this.isMariaDb) {
      await this.ensureTables();
      try {
        await this.pool().query("INSERT INTO licenses (id, license_key, tenant_id, plan, status, start_date, expiry_date, lifetime, max_devices, notes) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?)", [record.id, record.key, record.tenantId, record.plan, record.startDate, record.expiryDate, record.lifetime ? 1 : 0, record.maxDevices, record.notes]);
      } catch (error: any) {
        if (String(error?.code) === "ER_DUP_ENTRY") throw new Error("LICENSE_KEY_EXISTS");
        throw error;
      }
    } else {
      if ([...this.memoryLicenses.values()].some((l) => l.key === key)) throw new Error("LICENSE_KEY_EXISTS");
      this.memoryLicenses.set(record.id, record);
    }
    await this.logAudit("license.created", record.tenantId, { licenseId: record.id, plan: record.plan });
    return record;
  }

  async actLicense(id: string, action: "suspend" | "reactivate" | "revoke" | "extend" | "assign" | "update", payload: { expiryDate?: string | null; lifetime?: boolean; tenantId?: string; notes?: string | null; plan?: PlanId; maxDevices?: number | null } = {}): Promise<LicenseRecord> {
    const license = await this.getLicense(id);
    if (!license) throw new Error("LICENSE_NOT_FOUND");
    let nextStatus = license.status;
    let nextTenant = license.tenantId;
    let nextExpiry = license.expiryDate;
    let nextLifetime = license.lifetime;
    let nextNotes = license.notes;
    let nextPlan = license.plan;
    let nextMax = license.maxDevices;
    if (action === "update") {
      // Field-only update: no status, tenant or expiry change.
    } else if (action === "suspend") {
      if (license.status !== "active") throw new Error("INVALID_TRANSITION");
      nextStatus = "suspended";
    } else if (action === "reactivate") {
      if (license.status !== "suspended") throw new Error("INVALID_TRANSITION");
      nextStatus = "active";
    } else if (action === "revoke") {
      if (license.status === "revoked") throw new Error("INVALID_TRANSITION");
      nextStatus = "revoked";
    } else if (action === "extend") {
      if (license.status === "revoked") throw new Error("INVALID_TRANSITION");
      if (payload.lifetime) { nextLifetime = true; nextExpiry = null; }
      else if (payload.expiryDate) { nextLifetime = false; nextExpiry = parseDate(payload.expiryDate); }
      else throw new Error("INVALID_INPUT");
      if (license.status === "active" && nextExpiry && nextExpiry < new Date().toISOString().slice(0, 10) && !nextLifetime) throw new Error("INVALID_INPUT");
      // An expired-but-stored-active license becomes active again once its
      // expiry is moved into the future; effective status is recomputed.
    } else if (action === "assign") {
      if (!payload.tenantId) throw new Error("INVALID_INPUT");
      if (license.status === "revoked") throw new Error("INVALID_TRANSITION");
      const existing = await this.getTenantLicense(payload.tenantId);
      if (existing && existing.id !== id) throw new Error("LICENSE_ALREADY_ASSIGNED");
      nextTenant = payload.tenantId;
    }
    if (payload.notes !== undefined) nextNotes = payload.notes;
    if (payload.plan) nextPlan = payload.plan;
    if (payload.maxDevices !== undefined) nextMax = payload.maxDevices;
    const updated: LicenseRecord = { ...license, status: nextStatus, tenantId: nextTenant, expiryDate: nextExpiry, lifetime: nextLifetime, notes: nextNotes, plan: nextPlan, maxDevices: nextMax, updatedAt: new Date().toISOString() };
    updated.effectiveStatus = effectiveStatus(updated);
    if (this.isMariaDb) {
      await this.ensureTables();
      await this.pool().query("UPDATE licenses SET tenant_id = ?, plan = ?, status = ?, expiry_date = ?, lifetime = ?, max_devices = ?, notes = ? WHERE id = ?", [updated.tenantId, updated.plan, updated.status, updated.expiryDate, updated.lifetime ? 1 : 0, updated.maxDevices, updated.notes, id]);
    } else {
      this.memoryLicenses.set(id, updated);
    }
    await this.logAudit(`license.${action}`, updated.tenantId, { licenseId: id, fromTenantId: license.tenantId });
    return updated;
  }

  async logAudit(action: string, tenantId: string | null, metadata: Record<string, unknown> = {}): Promise<void> {
    if (this.isMariaDb) {
      try {
        await this.ensureTables();
        await this.pool().query("INSERT INTO master_audit_logs (actor_id, action, tenant_id, metadata_json) VALUES ('master', ?, ?, ?)", [action, tenantId, JSON.stringify(metadata)]);
      } catch { /* audit must never break the license action itself */ }
    } else {
      this.memoryAudit.unshift({ id: randomId("audit"), actor: "master", action, tenantId, metadata, createdAt: new Date().toISOString() });
      if (this.memoryAudit.length > 500) this.memoryAudit.length = 500;
    }
  }

  async listAudit(tenantId?: string): Promise<AuditRecord[]> {
    if (this.isMariaDb) {
      await this.ensureTables();
      const rows = tenantId
        ? await this.pool().query("SELECT id, actor_id AS actor, action, tenant_id AS tenantId, metadata_json AS metadata, created_at AS createdAt FROM master_audit_logs WHERE tenant_id = ? ORDER BY created_at DESC, id DESC LIMIT 200", [tenantId]) as any[]
        : await this.pool().query("SELECT id, actor_id AS actor, action, tenant_id AS tenantId, metadata_json AS metadata, created_at AS createdAt FROM master_audit_logs ORDER BY created_at DESC, id DESC LIMIT 200") as any[];
      return rows.map((r: any) => ({ id: String(r.id), actor: r.actor, action: r.action, tenantId: r.tenantId ?? null, metadata: typeof r.metadata === "string" ? JSON.parse(r.metadata || "{}") : (r.metadata ?? {}), createdAt: toIso(r.createdAt) }));
    }
    return tenantId ? this.memoryAudit.filter((a) => a.tenantId === tenantId) : [...this.memoryAudit];
  }

  async getSupportNote(tenantId: string): Promise<string> {
    if (this.isMariaDb) {
      await this.ensureTables();
      const rows = await this.pool().query("SELECT note FROM master_support_notes WHERE tenant_id = ? LIMIT 1", [tenantId]) as any[];
      return rows[0]?.note ?? "";
    }
    return this.memoryNotes.get(tenantId) ?? "";
  }

  async setSupportNote(tenantId: string, note: string): Promise<string> {
    if (this.isMariaDb) {
      await this.ensureTables();
      await this.pool().query("INSERT INTO master_support_notes (tenant_id, note) VALUES (?, ?) ON DUPLICATE KEY UPDATE note = VALUES(note)", [tenantId, note]);
    } else {
      this.memoryNotes.set(tenantId, note);
    }
    await this.logAudit("support_note.updated", tenantId, {});
    return note;
  }

  async listDomains(tenantId: string): Promise<DomainRecord[]> {
    if (this.isMariaDb) {
      await this.ensureTables();
      const rows = await this.pool().query("SELECT id, tenant_id AS tenantId, hostname, verified_at AS verifiedAt FROM tenant_domains WHERE tenant_id = ? ORDER BY hostname", [tenantId]) as any[];
      return rows.map((r: any) => ({ id: String(r.id), tenantId: r.tenantId, hostname: r.hostname, verifiedAt: r.verifiedAt ? toIso(r.verifiedAt) : null }));
    }
    return [...this.memoryDomains.values()].filter((d) => d.tenantId === tenantId).sort((a, b) => a.hostname.localeCompare(b.hostname));
  }

  async addDomain(tenantId: string, hostname: string): Promise<DomainRecord> {
    const host = hostname.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9.-]{2,253}$/.test(host) || !host.includes(".")) throw new Error("INVALID_HOSTNAME");
    if (this.isMariaDb) {
      await this.ensureTables();
      try {
        const result = await this.pool().query("INSERT INTO tenant_domains (tenant_id, hostname) VALUES (?, ?)", [tenantId, host]) as { insertId?: number };
        const record: DomainRecord = { id: String(result.insertId ?? host), tenantId, hostname: host, verifiedAt: null };
        await this.logAudit("domain.added", tenantId, { hostname: host });
        return record;
      } catch (error: any) {
        if (String(error?.code) === "ER_DUP_ENTRY") throw new Error("DOMAIN_ALREADY_EXISTS");
        throw error;
      }
    }
    if ([...this.memoryDomains.values()].some((d) => d.hostname === host)) throw new Error("DOMAIN_ALREADY_EXISTS");
    const record: DomainRecord = { id: randomId("domain"), tenantId, hostname: host, verifiedAt: null };
    this.memoryDomains.set(record.id, record);
    await this.logAudit("domain.added", tenantId, { hostname: host });
    return record;
  }

  async listAnnouncementsForTenant(tenantId: string): Promise<AnnouncementRecord[]> {
    if (this.isMariaDb) {
      await this.ensureTables();
      const rows = await this.pool().query("SELECT id, tenant_id AS tenantId, title, body, active, created_at AS createdAt FROM master_announcements WHERE active = TRUE AND (tenant_id IS NULL OR tenant_id = ?) ORDER BY created_at DESC LIMIT 50", [tenantId]) as any[];
      return rows.map((r: any) => ({ id: r.id, tenantId: r.tenantId ?? null, title: r.title, body: r.body, active: Boolean(r.active), createdAt: toIso(r.createdAt) }));
    }
    return [...this.memoryAnnouncements.values()].filter((a) => a.active && (a.tenantId === null || a.tenantId === tenantId)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async listAnnouncementsAll(): Promise<AnnouncementRecord[]> {
    if (this.isMariaDb) {
      await this.ensureTables();
      const rows = await this.pool().query("SELECT id, tenant_id AS tenantId, title, body, active, created_at AS createdAt FROM master_announcements ORDER BY created_at DESC LIMIT 200") as any[];
      return rows.map((r: any) => ({ id: r.id, tenantId: r.tenantId ?? null, title: r.title, body: r.body, active: Boolean(r.active), createdAt: toIso(r.createdAt) }));
    }
    return [...this.memoryAnnouncements.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async createAnnouncement(tenantId: string | null, title: string, body: string): Promise<AnnouncementRecord> {
    const record: AnnouncementRecord = { id: randomId("ann"), tenantId, title, body, active: true, createdAt: new Date().toISOString() };
    if (this.isMariaDb) {
      await this.ensureTables();
      await this.pool().query("INSERT INTO master_announcements (id, tenant_id, title, body, active) VALUES (?, ?, ?, ?, TRUE)", [record.id, record.tenantId, record.title, record.body]);
    } else {
      this.memoryAnnouncements.set(record.id, record);
    }
    await this.logAudit("announcement.created", tenantId, { announcementId: record.id });
    return record;
  }

  async setAnnouncementActive(id: string, active: boolean): Promise<AnnouncementRecord | undefined> {
    if (this.isMariaDb) {
      await this.ensureTables();
      const result = await this.pool().query("UPDATE master_announcements SET active = ? WHERE id = ?", [active ? 1 : 0, id]) as { affectedRows?: number };
      if (!result.affectedRows) return undefined;
      const rows = await this.pool().query("SELECT id, tenant_id AS tenantId, title, body, active, created_at AS createdAt FROM master_announcements WHERE id = ? LIMIT 1", [id]) as any[];
      return rows[0] ? { id: rows[0].id, tenantId: rows[0].tenantId ?? null, title: rows[0].title, body: rows[0].body, active: Boolean(rows[0].active), createdAt: toIso(rows[0].createdAt) } : undefined;
    }
    const record = this.memoryAnnouncements.get(id);
    if (!record) return undefined;
    record.active = active;
    return record;
  }

  async removeDomain(tenantId: string, domainId: string): Promise<boolean> {
    if (this.isMariaDb) {
      await this.ensureTables();
      const result = await this.pool().query("DELETE FROM tenant_domains WHERE tenant_id = ? AND id = ?", [tenantId, domainId]) as { affectedRows?: number };
      if (result.affectedRows) await this.logAudit("domain.removed", tenantId, { domainId });
      return Boolean(result.affectedRows);
    }
    const domain = this.memoryDomains.get(domainId);
    if (!domain || domain.tenantId !== tenantId) return false;
    this.memoryDomains.delete(domainId);
    await this.logAudit("domain.removed", tenantId, { domainId });
    return true;
  }
}

export const masterRegistry = new MasterRegistry();
