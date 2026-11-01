import mariadb from "mariadb";
import { hashPassword, randomId } from "./security.js";
import type { PermissionCode, PlanId } from "./catalog.js";

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
      name: "PharmaFlow Demo Group",
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
}

export async function createStore(): Promise<Store> {
  const store = process.env.STORAGE_MODE === "mariadb" ? new MariaDbHealthStore() : new MemoryStore();
  if (store instanceof MemoryStore) await store.seed();
  return store;
}
