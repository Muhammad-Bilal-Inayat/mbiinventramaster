import mariadb from "mariadb";
import { hashPassword, randomId } from "./security.js";
import { plans, type PermissionCode, type PlanId } from "./catalog.js";

export const DEFAULT_HOME_LAYOUT = ["kpis", "branch", "alerts", "top", "activity", "command"] as const;
export type HomeWidget = (typeof DEFAULT_HOME_LAYOUT)[number];

export interface AiCredits {
  total: number;
  used: number;
  remaining: number;
  enabled: boolean;
  custom: boolean;
}

export interface TenantRecord {
  id: string;
  name: string;
  plan: PlanId;
  status: "active" | "locked" | "maintenance";
  branches: Array<{ id: string; name: string; city: string }>;
}

export interface UserRecord {
  id: string;
  tenantId: string;
  name: string;
  login: string;
  passwordHash: string;
  role: string;
  branchIds: string[];
  permissions: PermissionCode[];
  active: boolean;
}

export interface DeviceRecord {
  id: string;
  tenantId: string;
  userId: string;
  name: string;
  hwidHash: string;
  status: "active" | "revoked" | "pending";
  lastSeen: string;
}

export interface DashboardRecord {
  revenue: number;
  profit: number;
  lowStock: number;
  expiringSoon: number;
  totalSkus: number;
  branchPerformance: Array<{ name: string; revenue: number }>;
  topProducts: Array<{ name: string; units: number; revenue: number }>;
  activity: Array<{ label: string; detail: string; time: string; tone: "success" | "info" | "warn" | "danger" }>;
}

export interface Store {
  findUser(login: string): Promise<UserRecord | undefined>;
  getTenant(tenantId: string): Promise<TenantRecord | undefined>;
  getUser(userId: string): Promise<UserRecord | undefined>;
  listDevices(tenantId: string): Promise<DeviceRecord[]>;
  registerDevice(input: Omit<DeviceRecord, "id" | "lastSeen" | "status">): Promise<DeviceRecord>;
  revokeDevice(tenantId: string, deviceId: string): Promise<boolean>;
  getDashboard(tenantId: string): Promise<DashboardRecord>;
  pingDatabase(): Promise<{ mode: "memory" | "mariadb"; ok: boolean }>;
  getHomeLayout(tenantId: string): Promise<string[]>;
  saveHomeLayout(tenantId: string, layout: string[]): Promise<string[]>;
  getAiCredits(tenantId: string, plan: PlanId): Promise<AiCredits>;
  setAiCredits(tenantId: string, input: { total: number; enabled: boolean }): Promise<AiCredits>;
  consumeAiCredit(tenantId: string, plan: PlanId): Promise<{ ok: boolean; reason?: string; credits: AiCredits }>;
}

const ownerPermissions: PermissionCode[] = [
  "dashboard.view", "sales.view", "sales.create", "sales.refund", "sales.discount", "inventory.view", "inventory.edit", "inventory.adjust",
  "purchases.view", "purchases.create", "purchases.approve", "parties.view", "parties.payment", "reports.view", "reports.export",
  "transfers.request", "transfers.approve", "prescriptions.view", "accounting.view", "admin.users", "admin.devices",
];
const managerPermissions = ownerPermissions.filter((permission) => !["admin.users", "accounting.view"].includes(permission));
const pharmacistPermissions: PermissionCode[] = ["dashboard.view", "sales.view", "sales.create", "inventory.view", "inventory.edit", "purchases.view", "purchases.create", "parties.view", "prescriptions.view"];

class MemoryStore implements Store {
  private tenants = new Map<string, TenantRecord>();
  private users = new Map<string, UserRecord>();
  private devices = new Map<string, DeviceRecord>();
  private dashboards = new Map<string, DashboardRecord>();

  async seed(): Promise<void> {
    if (this.tenants.size) return;
    const tenant: TenantRecord = {
      id: "tenant_demo",
      name: "MBI Inventra Demo",
      plan: "advanced",
      status: "active",
      branches: [
        { id: "branch_isb", name: "Islamabad Main", city: "Islamabad" },
        { id: "branch_lhr", name: "Lahore DHA", city: "Lahore" },
        { id: "branch_khi", name: "Karachi Clifton", city: "Karachi" },
      ],
    };
    this.tenants.set(tenant.id, tenant);
    const passwordHash = await hashPassword("demo12345");
    const seedUsers: Array<Omit<UserRecord, "passwordHash">> = [
      { id: "user_owner", tenantId: tenant.id, name: "Muhammad Bilal", login: "owner", role: "Owner", branchIds: tenant.branches.map((branch) => branch.id), permissions: ownerPermissions, active: true },
      { id: "user_manager", tenantId: tenant.id, name: "Ali Hassan", login: "manager", role: "Branch Manager", branchIds: ["branch_isb"], permissions: managerPermissions, active: true },
      { id: "user_pharmacist", tenantId: tenant.id, name: "Sana Ahmed", login: "pharmacist", role: "Pharmacist", branchIds: ["branch_isb"], permissions: pharmacistPermissions, active: true },
    ];
    for (const user of seedUsers) this.users.set(user.id, { ...user, passwordHash });
    const device = { id: "device_owner_1", tenantId: tenant.id, userId: "user_owner", name: "Owner workstation", hwidHash: "demo-hwid", status: "active" as const, lastSeen: new Date().toISOString() };
    this.devices.set(device.id, device);
    this.dashboards.set(tenant.id, {
      revenue: 284562,
      profit: 48730,
      lowStock: 23,
      expiringSoon: 17,
      totalSkus: 1482,
      branchPerformance: [{ name: "Islamabad", revenue: 52000 }, { name: "Lahore", revenue: 38000 }, { name: "Karachi", revenue: 36000 }, { name: "Peshawar", revenue: 28000 }],
      topProducts: [{ name: "Paracetamol 500mg", units: 12560, revenue: 18840 }, { name: "Amoxicillin 500mg", units: 8420, revenue: 16840 }, { name: "Amlodipine 5mg", units: 7980, revenue: 11970 }, { name: "Omeprazole 20mg", units: 6230, revenue: 9660 }],
      activity: [{ label: "Sale completed", detail: "Paracetamol 500mg × 2 — Central Branch", time: "10:24 AM", tone: "success" }, { label: "Purchase received", detail: "Amoxicillin 500mg × 100 — Lahore DHA", time: "09:17 AM", tone: "info" }, { label: "Low stock alert", detail: "Salbutamol Inhaler — 3 remaining", time: "08:45 AM", tone: "warn" }, { label: "Expiry alert", detail: "Atorvastatin 20mg — expires in 28 days", time: "Yesterday", tone: "danger" }],
    });
  }
  async findUser(login: string) { return [...this.users.values()].find((user) => user.login === login || user.id === login); }
  async getTenant(tenantId: string) { return this.tenants.get(tenantId); }
  async getUser(userId: string) { return this.users.get(userId); }
  async listDevices(tenantId: string) { return [...this.devices.values()].filter((device) => device.tenantId === tenantId); }
  async registerDevice(input: Omit<DeviceRecord, "id" | "lastSeen" | "status">) {
    const device: DeviceRecord = { ...input, id: randomId("device"), status: "active", lastSeen: new Date().toISOString() };
    this.devices.set(device.id, device); return device;
  }
  async revokeDevice(tenantId: string, deviceId: string) {
    const device = this.devices.get(deviceId); if (!device || device.tenantId !== tenantId) return false;
    device.status = "revoked"; return true;
  }
  async getDashboard(tenantId: string) { return this.dashboards.get(tenantId) ?? { revenue: 0, profit: 0, lowStock: 0, expiringSoon: 0, totalSkus: 0, branchPerformance: [], topProducts: [], activity: [] }; }
  async pingDatabase() { return { mode: "memory" as const, ok: true }; }
  private homeLayouts = new Map<string, string[]>();
  private aiCreditRows = new Map<string, { total: number; used: number; enabled: boolean; custom: boolean }>();
  async getHomeLayout(tenantId: string) { return [...(this.homeLayouts.get(tenantId) ?? [...DEFAULT_HOME_LAYOUT])]; }
  async saveHomeLayout(tenantId: string, layout: string[]) { this.homeLayouts.set(tenantId, [...layout]); return [...layout]; }
  async getAiCredits(tenantId: string, plan: PlanId): Promise<AiCredits> {
    const row = this.aiCreditRows.get(tenantId);
    if (!row) return { total: plans[plan].aiQuota, used: 0, remaining: plans[plan].aiQuota, enabled: true, custom: false };
    return { total: row.total, used: row.used, remaining: Math.max(0, row.total - row.used), enabled: row.enabled, custom: row.custom };
  }
  async setAiCredits(tenantId: string, input: { total: number; enabled: boolean }): Promise<AiCredits> {
    const existing = this.aiCreditRows.get(tenantId);
    const row = { total: input.total, used: existing?.used ?? 0, enabled: input.enabled, custom: true };
    this.aiCreditRows.set(tenantId, row);
    return { total: row.total, used: row.used, remaining: Math.max(0, row.total - row.used), enabled: row.enabled, custom: true };
  }
  async consumeAiCredit(tenantId: string, plan: PlanId) {
    const credits = await this.getAiCredits(tenantId, plan);
    if (!credits.enabled) return { ok: false, reason: "AI_DISABLED", credits };
    if (credits.used >= credits.total) return { ok: false, reason: "AI_CREDITS_EXHAUSTED", credits };
    const row = this.aiCreditRows.get(tenantId) ?? { total: credits.total, used: 0, enabled: true, custom: credits.custom };
    row.used += 1; this.aiCreditRows.set(tenantId, row);
    const next = { total: row.total, used: row.used, remaining: Math.max(0, row.total - row.used), enabled: row.enabled, custom: row.custom };
    return { ok: true, credits: next };
  }
}

class MariaDbHealthStore implements Store {
  private pool = mariadb.createPool({ host: process.env.MARIADB_HOST, port: Number(process.env.MARIADB_PORT || 3306), user: process.env.MARIADB_USER, password: process.env.MARIADB_PASSWORD, database: process.env.MARIADB_DATABASE, connectionLimit: 5 });
  async findUser(login: string) {
    const rows = await this.pool.query("SELECT user_id AS id, tenant_id AS tenantId, name, login, password_hash AS passwordHash, role, branch_ids_json AS branchIds, permissions_json AS permissions, active FROM tenant_user_index WHERE login = ? LIMIT 1", [login]) as any[];
    const row = rows[0]; if (!row) return undefined;
    return { ...row, branchIds: typeof row.branchIds === "string" ? JSON.parse(row.branchIds) : row.branchIds, permissions: typeof row.permissions === "string" ? JSON.parse(row.permissions) : row.permissions } as UserRecord;
  }
  async getTenant(tenantId: string) {
    const rows = await this.pool.query("SELECT id, name, plan, status, branch_summary_json AS branchSummary FROM tenants WHERE id = ? LIMIT 1", [tenantId]) as any[];
    const row = rows[0]; if (!row) return undefined;
    return { id: row.id, name: row.name, plan: row.plan, status: row.status, branches: typeof row.branchSummary === "string" ? JSON.parse(row.branchSummary || "[]") : (row.branchSummary || []) } as TenantRecord;
  }
  async getUser(userId: string) {
    const rows = await this.pool.query("SELECT user_id AS id, tenant_id AS tenantId, name, login, password_hash AS passwordHash, role, branch_ids_json AS branchIds, permissions_json AS permissions, active FROM tenant_user_index WHERE user_id = ? LIMIT 1", [userId]) as any[];
    const row = rows[0]; if (!row) return undefined;
    return { ...row, branchIds: typeof row.branchIds === "string" ? JSON.parse(row.branchIds) : row.branchIds, permissions: typeof row.permissions === "string" ? JSON.parse(row.permissions) : row.permissions } as UserRecord;
  }
  async listDevices(tenantId: string) {
    const rows = await this.pool.query("SELECT id, tenant_id AS tenantId, user_id AS userId, device_name AS name, hwid_hash AS hwidHash, status, last_seen_at AS lastSeen FROM tenant_devices WHERE tenant_id = ? ORDER BY created_at DESC", [tenantId]) as any[];
    return rows as DeviceRecord[];
  }
  async registerDevice(input: Omit<DeviceRecord, "id" | "lastSeen" | "status">) {
    const id = randomId("device"); const lastSeen = new Date().toISOString();
    await this.pool.query("INSERT INTO tenant_devices (id, tenant_id, user_id, device_name, hwid_hash, status, last_seen_at) VALUES (?, ?, ?, ?, ?, 'active', ?)", [id, input.tenantId, input.userId, input.name, input.hwidHash, lastSeen]);
    return { ...input, id, status: "active" as const, lastSeen };
  }
  async revokeDevice(tenantId: string, deviceId: string) {
    const result = await this.pool.query("UPDATE tenant_devices SET status = 'revoked' WHERE tenant_id = ? AND id = ?", [tenantId, deviceId]) as { affectedRows?: number };
    return Boolean(result.affectedRows);
  }
  async getDashboard() { return { revenue: 0, profit: 0, lowStock: 0, expiringSoon: 0, totalSkus: 0, branchPerformance: [], topProducts: [], activity: [] }; }
  async pingDatabase() { let connection; try { connection = await this.pool.getConnection(); await connection.query("SELECT 1"); return { mode: "mariadb" as const, ok: true }; } catch { return { mode: "mariadb" as const, ok: false }; } finally { connection?.release(); } }
  private tenantPools = new Map<string, ReturnType<typeof mariadb.createPool>>();
  private async getTenantPool(tenantId: string) {
    const cached = this.tenantPools.get(tenantId);
    if (cached) return cached;
    const rows = await this.pool.query("SELECT database_name AS databaseName FROM tenants WHERE id = ? LIMIT 1", [tenantId]) as any[];
    const databaseName = rows[0]?.databaseName;
    if (!databaseName || !/^tenant_[0-9]{6}$/.test(databaseName)) throw new Error("TENANT_DATABASE_NOT_FOUND");
    const tenantPool = mariadb.createPool({ host: process.env.MARIADB_HOST, port: Number(process.env.MARIADB_PORT || 3306), user: process.env.MARIADB_USER, password: process.env.MARIADB_PASSWORD, database: databaseName, connectionLimit: 5 });
    this.tenantPools.set(tenantId, tenantPool);
    return tenantPool;
  }
  private async ensureTenantAiTables(tenantPool: ReturnType<typeof mariadb.createPool>) {
    await tenantPool.query("CREATE TABLE IF NOT EXISTS home_layout (id INT PRIMARY KEY, layout_json JSON NOT NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)");
    await tenantPool.query("CREATE TABLE IF NOT EXISTS ai_credits (id INT PRIMARY KEY, credits_total INT NOT NULL, credits_used INT NOT NULL DEFAULT 0, enabled TINYINT(1) NOT NULL DEFAULT 1, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)");
  }
  async getHomeLayout(tenantId: string) {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensureTenantAiTables(tenantPool);
    const rows = await tenantPool.query("SELECT layout_json AS layoutJson FROM home_layout WHERE id = 1 LIMIT 1") as any[];
    const raw = rows[0]?.layoutJson;
    if (!raw) return [...DEFAULT_HOME_LAYOUT];
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return Array.isArray(parsed) ? parsed : [...DEFAULT_HOME_LAYOUT];
  }
  async saveHomeLayout(tenantId: string, layout: string[]) {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensureTenantAiTables(tenantPool);
    await tenantPool.query("INSERT INTO home_layout (id, layout_json) VALUES (1, ?) ON DUPLICATE KEY UPDATE layout_json = VALUES(layout_json)", [JSON.stringify(layout)]);
    return [...layout];
  }
  async getAiCredits(tenantId: string, plan: PlanId): Promise<AiCredits> {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensureTenantAiTables(tenantPool);
    const rows = await tenantPool.query("SELECT credits_total AS total, credits_used AS used, enabled FROM ai_credits WHERE id = 1 LIMIT 1") as any[];
    const row = rows[0];
    if (!row) return { total: plans[plan].aiQuota, used: 0, remaining: plans[plan].aiQuota, enabled: true, custom: false };
    return { total: row.total, used: row.used, remaining: Math.max(0, row.total - row.used), enabled: Boolean(row.enabled), custom: true };
  }
  async setAiCredits(tenantId: string, input: { total: number; enabled: boolean }): Promise<AiCredits> {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensureTenantAiTables(tenantPool);
    const existing = await tenantPool.query("SELECT credits_used AS used FROM ai_credits WHERE id = 1 LIMIT 1") as any[];
    const used = existing[0]?.used ?? 0;
    await tenantPool.query("INSERT INTO ai_credits (id, credits_total, credits_used, enabled) VALUES (1, ?, ?, ?) ON DUPLICATE KEY UPDATE credits_total = VALUES(credits_total), enabled = VALUES(enabled)", [input.total, used, input.enabled ? 1 : 0]);
    return { total: input.total, used, remaining: Math.max(0, input.total - used), enabled: input.enabled, custom: true };
  }
  async consumeAiCredit(tenantId: string, plan: PlanId) {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensureTenantAiTables(tenantPool);
    const before = await this.getAiCredits(tenantId, plan);
    if (!before.enabled) return { ok: false, reason: "AI_DISABLED", credits: before };
    if (before.used >= before.total) return { ok: false, reason: "AI_CREDITS_EXHAUSTED", credits: before };
    if (before.custom) {
      const result = await tenantPool.query("UPDATE ai_credits SET credits_used = credits_used + 1 WHERE id = 1 AND enabled = 1 AND credits_used < credits_total") as { affectedRows?: number };
      if (!result.affectedRows) return { ok: false, reason: "AI_CREDITS_EXHAUSTED", credits: await this.getAiCredits(tenantId, plan) };
      return { ok: true, credits: await this.getAiCredits(tenantId, plan) };
    }
    await tenantPool.query("INSERT INTO ai_credits (id, credits_total, credits_used, enabled) VALUES (1, ?, 1, 1)", [before.total]);
    return { ok: true, credits: await this.getAiCredits(tenantId, plan) };
  }
}

export async function createStore(): Promise<Store> {
  const store = process.env.STORAGE_MODE === "mariadb" ? new MariaDbHealthStore() : new MemoryStore();
  if (store instanceof MemoryStore) await store.seed();
  return store;
}
