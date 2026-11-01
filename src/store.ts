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

export interface MedicineRecord {
  id: string;
  sku: string;
  barcode: string | null;
  name: string;
  genericSalt: string | null;
  strength: string | null;
  dosageForm: string | null;
  category: string | null;
  active: boolean;
  totalStock: number;
}

export interface BatchRecord {
  id: string;
  medicineId: string;
  batchNo: string;
  expiryDate: string;
  purchasePrice: number;
  salePrice: number;
  stockByBranch: Array<{ branchId: string; quantity: number; reorderLevel: number }>;
}

export interface StockAlerts {
  lowStock: Array<{ branchId: string; batchId: string; medicineId: string; medicineName: string; batchNo: string; quantity: number; reorderLevel: number }>;
  expiringSoon: Array<{ batchId: string; medicineId: string; medicineName: string; batchNo: string; expiryDate: string; quantity: number }>;
  expired: Array<{ batchId: string; medicineId: string; medicineName: string; batchNo: string; expiryDate: string; quantity: number }>;
}

export interface StockMovementRecord {
  id: string;
  branchId: string;
  batchId: string;
  movementType: string;
  quantity: number;
  referenceId: string | null;
  idempotencyKey: string;
  serverVersion: number;
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
  listMedicines(tenantId: string, search: string): Promise<MedicineRecord[]>;
  createMedicine(tenantId: string, userId: string, input: { sku: string; barcode?: string | null; name: string; genericSalt?: string | null; strength?: string | null; dosageForm?: string | null; category?: string | null }): Promise<MedicineRecord>;
  setMedicineActive(tenantId: string, userId: string, medicineId: string, active: boolean): Promise<MedicineRecord | undefined>;
  listBatches(tenantId: string, medicineId: string): Promise<BatchRecord[]>;
  createBatch(tenantId: string, userId: string, input: { medicineId: string; batchNo: string; expiryDate: string; purchasePrice: number; salePrice: number }): Promise<BatchRecord>;
  adjustStock(tenantId: string, userId: string, input: { branchId: string; batchId: string; quantity: number; movementType: string; referenceId?: string | null; idempotencyKey: string; reorderLevel?: number }): Promise<StockMovementRecord>;
  getStockAlerts(tenantId: string): Promise<StockAlerts>;
  getFefoBatch(tenantId: string, medicineId: string, branchId: string): Promise<BatchRecord | undefined>;
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
  private medicines = new Map<string, MedicineRecord & { tenantId: string }>();
  private batches = new Map<string, BatchRecord & { tenantId: string }>();
  private stock = new Map<string, { quantity: number; reorderLevel: number }>();
  private movements: StockMovementRecord[] = [];
  private movementSeq = 0;
  private medicineTotalStock(tenantId: string, medicineId: string) {
    let total = 0;
    for (const batch of this.batches.values()) {
      if (batch.tenantId !== tenantId || batch.medicineId !== medicineId) continue;
      for (const [key, row] of this.stock.entries()) {
        const [, batchId] = key.split(":");
        if (batchId === batch.id) total += row.quantity;
      }
    }
    return total;
  }
  private batchToRecord(tenantId: string, batch: BatchRecord & { tenantId: string }): BatchRecord {
    const stockByBranch: BatchRecord["stockByBranch"] = [];
    for (const [key, row] of this.stock.entries()) {
      const [branchId, batchId] = key.split(":");
      if (batchId === batch.id) stockByBranch.push({ branchId, quantity: row.quantity, reorderLevel: row.reorderLevel });
    }
    const { tenantId: _t, ...rest } = batch as BatchRecord & { tenantId: string };
    return { ...rest, stockByBranch };
  }
  async listMedicines(tenantId: string, search: string) {
    const q = search.trim().toLowerCase();
    return [...this.medicines.values()]
      .filter((m) => m.tenantId === tenantId && (!q || m.name.toLowerCase().includes(q) || m.sku.toLowerCase().includes(q) || (m.barcode ?? "").toLowerCase().includes(q)))
      .map((m) => { const { tenantId: _t, ...rest } = m; return { ...rest, totalStock: this.medicineTotalStock(tenantId, m.id) }; })
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  async createMedicine(tenantId: string, _userId: string, input: { sku: string; barcode?: string | null; name: string; genericSalt?: string | null; strength?: string | null; dosageForm?: string | null; category?: string | null }) {
    const skuExists = [...this.medicines.values()].some((m) => m.tenantId === tenantId && m.sku.toLowerCase() === input.sku.toLowerCase());
    if (skuExists) throw new Error("SKU_ALREADY_EXISTS");
    if (input.barcode) {
      const barcodeExists = [...this.medicines.values()].some((m) => m.tenantId === tenantId && m.barcode === input.barcode);
      if (barcodeExists) throw new Error("BARCODE_ALREADY_EXISTS");
    }
    const medicine: MedicineRecord & { tenantId: string } = { id: randomId("medicine"), tenantId, sku: input.sku, barcode: input.barcode ?? null, name: input.name, genericSalt: input.genericSalt ?? null, strength: input.strength ?? null, dosageForm: input.dosageForm ?? null, category: input.category ?? null, active: true, totalStock: 0 };
    this.medicines.set(medicine.id, medicine);
    const { tenantId: _t2, ...medRest } = medicine; return { ...medRest, totalStock: 0 };
  }
  async setMedicineActive(tenantId: string, _userId: string, medicineId: string, active: boolean) {
    const medicine = this.medicines.get(medicineId);
    if (!medicine || medicine.tenantId !== tenantId) return undefined;
    medicine.active = active;
    const { tenantId: _t3, ...medRest } = medicine; return { ...medRest, totalStock: this.medicineTotalStock(tenantId, medicineId) };
  }
  async listBatches(tenantId: string, medicineId: string) {
    return [...this.batches.values()].filter((b) => b.tenantId === tenantId && b.medicineId === medicineId).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate)).map((b) => this.batchToRecord(tenantId, b));
  }
  async createBatch(tenantId: string, _userId: string, input: { medicineId: string; batchNo: string; expiryDate: string; purchasePrice: number; salePrice: number }) {
    const medicine = this.medicines.get(input.medicineId);
    if (!medicine || medicine.tenantId !== tenantId) throw new Error("MEDICINE_NOT_FOUND");
    const dup = [...this.batches.values()].some((b) => b.tenantId === tenantId && b.medicineId === input.medicineId && b.batchNo.toLowerCase() === input.batchNo.toLowerCase());
    if (dup) throw new Error("BATCH_ALREADY_EXISTS");
    const batch: BatchRecord & { tenantId: string } = { id: randomId("batch"), tenantId, medicineId: input.medicineId, batchNo: input.batchNo, expiryDate: input.expiryDate, purchasePrice: input.purchasePrice, salePrice: input.salePrice, stockByBranch: [] };
    this.batches.set(batch.id, batch);
    return this.batchToRecord(tenantId, batch);
  }
  async adjustStock(tenantId: string, _userId: string, input: { branchId: string; batchId: string; quantity: number; movementType: string; referenceId?: string | null; idempotencyKey: string; reorderLevel?: number }) {
    const existing = this.movements.find((m) => m.idempotencyKey === input.idempotencyKey);
    if (existing) return existing;
    const batch = this.batches.get(input.batchId);
    if (!batch || batch.tenantId !== tenantId) throw new Error("BATCH_NOT_FOUND");
    const key = `${input.branchId}:${input.batchId}`;
    const row = this.stock.get(key) ?? { quantity: 0, reorderLevel: 0 };
    const nextQty = row.quantity + input.quantity;
    if (nextQty < 0) throw new Error("NEGATIVE_STOCK");
    if (input.reorderLevel !== undefined) row.reorderLevel = input.reorderLevel;
    row.quantity = nextQty; this.stock.set(key, row);
    this.movementSeq += 1;
    const movement: StockMovementRecord = { id: randomId("movement"), branchId: input.branchId, batchId: input.batchId, movementType: input.movementType, quantity: input.quantity, referenceId: input.referenceId ?? null, idempotencyKey: input.idempotencyKey, serverVersion: this.movementSeq };
    this.movements.push(movement);
    return movement;
  }
  async getStockAlerts(tenantId: string): Promise<StockAlerts> {
    const today = new Date().toISOString().slice(0, 10);
    const soon = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
    const lowStock: StockAlerts["lowStock"] = [];
    const expiringSoon: StockAlerts["expiringSoon"] = [];
    const expired: StockAlerts["expired"] = [];
    for (const batch of this.batches.values()) {
      if (batch.tenantId !== tenantId) continue;
      const medicine = this.medicines.get(batch.medicineId);
      for (const [key, row] of this.stock.entries()) {
        const [branchId, batchId] = key.split(":");
        if (batchId !== batch.id || row.quantity <= 0) continue;
        if (row.quantity <= row.reorderLevel) lowStock.push({ branchId, batchId: batch.id, medicineId: batch.medicineId, medicineName: medicine?.name ?? "", batchNo: batch.batchNo, quantity: row.quantity, reorderLevel: row.reorderLevel });
      }
      const total = this.medicineTotalStock(tenantId, batch.medicineId);
      void total;
      const batchQty = [...this.stock.entries()].filter(([k]) => k.split(":")[1] === batch.id).reduce((sum, [, r]) => sum + r.quantity, 0);
      if (batchQty > 0 && batch.expiryDate < today) expired.push({ batchId: batch.id, medicineId: batch.medicineId, medicineName: medicine?.name ?? "", batchNo: batch.batchNo, expiryDate: batch.expiryDate, quantity: batchQty });
      else if (batchQty > 0 && batch.expiryDate <= soon) expiringSoon.push({ batchId: batch.id, medicineId: batch.medicineId, medicineName: medicine?.name ?? "", batchNo: batch.batchNo, expiryDate: batch.expiryDate, quantity: batchQty });
    }
    return { lowStock, expiringSoon, expired };
  }
  async getFefoBatch(tenantId: string, medicineId: string, branchId: string) {
    const today = new Date().toISOString().slice(0, 10);
    const candidates = [...this.batches.values()].filter((b) => b.tenantId === tenantId && b.medicineId === medicineId && b.expiryDate >= today);
    candidates.sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
    for (const batch of candidates) {
      const row = this.stock.get(`${branchId}:${batch.id}`);
      if (row && row.quantity > 0) return this.batchToRecord(tenantId, batch);
    }
    return undefined;
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
  private async ensureInventoryTables(tenantPool: ReturnType<typeof mariadb.createPool>) {
    await tenantPool.query("CREATE TABLE IF NOT EXISTS medicines (id VARCHAR(96) PRIMARY KEY, sku VARCHAR(96) NOT NULL UNIQUE, barcode VARCHAR(128) NULL UNIQUE, name VARCHAR(220) NOT NULL, generic_salt VARCHAR(220) NULL, strength VARCHAR(120) NULL, dosage_form VARCHAR(80) NULL, category VARCHAR(120) NULL, active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_medicine_name (name)) ENGINE=InnoDB");
    await tenantPool.query("CREATE TABLE IF NOT EXISTS medicine_batches (id VARCHAR(96) PRIMARY KEY, medicine_id VARCHAR(96) NOT NULL, batch_no VARCHAR(96) NOT NULL, expiry_date DATE NOT NULL, purchase_price DECIMAL(14,2) NOT NULL DEFAULT 0, sale_price DECIMAL(14,2) NOT NULL DEFAULT 0, UNIQUE KEY uq_medicine_batch (medicine_id, batch_no), INDEX idx_batch_expiry (expiry_date)) ENGINE=InnoDB");
    await tenantPool.query("CREATE TABLE IF NOT EXISTS branch_stock (branch_id VARCHAR(96) NOT NULL, batch_id VARCHAR(96) NOT NULL, quantity INT NOT NULL DEFAULT 0, reserved_quantity INT NOT NULL DEFAULT 0, reorder_level INT NOT NULL DEFAULT 0, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (branch_id, batch_id)) ENGINE=InnoDB");
    await tenantPool.query("CREATE TABLE IF NOT EXISTS stock_movements (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, movement_uuid CHAR(36) NOT NULL UNIQUE, branch_id VARCHAR(96) NOT NULL, batch_id VARCHAR(96) NOT NULL, movement_type VARCHAR(40) NOT NULL, quantity INT NOT NULL, reference_id VARCHAR(96) NULL, idempotency_key VARCHAR(160) NOT NULL UNIQUE, server_version BIGINT UNSIGNED NOT NULL, created_by VARCHAR(96) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_movement_cursor (server_version), INDEX idx_movement_branch_time (branch_id, created_at)) ENGINE=InnoDB");
    await tenantPool.query("CREATE TABLE IF NOT EXISTS audit_logs (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, actor_id VARCHAR(96) NOT NULL, action VARCHAR(120) NOT NULL, entity VARCHAR(96) NOT NULL, entity_id VARCHAR(96) NULL, before_json JSON NULL, after_json JSON NULL, ip_address VARCHAR(64) NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_audit_time (created_at)) ENGINE=InnoDB");
  }
  async listMedicines(tenantId: string, search: string) {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensureInventoryTables(tenantPool);
    const q = `%${search.trim()}%`;
    const rows = await tenantPool.query("SELECT m.id, m.sku, m.barcode, m.name, m.generic_salt AS genericSalt, m.strength, m.dosage_form AS dosageForm, m.category, m.active, COALESCE(SUM(bs.quantity), 0) AS totalStock FROM medicines m LEFT JOIN medicine_batches b ON b.medicine_id = m.id LEFT JOIN branch_stock bs ON bs.batch_id = b.id WHERE (? = '%%' OR m.name LIKE ? OR m.sku LIKE ? OR m.barcode LIKE ?) GROUP BY m.id ORDER BY m.name", [q, q, q, q]) as any[];
    return rows.map((r: any) => ({ id: r.id, sku: r.sku, barcode: r.barcode, name: r.name, genericSalt: r.genericSalt, strength: r.strength, dosageForm: r.dosageForm, category: r.category, active: Boolean(r.active), totalStock: Number(r.totalStock) }));
  }
  async createMedicine(tenantId: string, userId: string, input: { sku: string; barcode?: string | null; name: string; genericSalt?: string | null; strength?: string | null; dosageForm?: string | null; category?: string | null }) {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensureInventoryTables(tenantPool);
    const id = randomId("medicine");
    try {
      await tenantPool.query("INSERT INTO medicines (id, sku, barcode, name, generic_salt, strength, dosage_form, category, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)", [id, input.sku, input.barcode ?? null, input.name, input.genericSalt ?? null, input.strength ?? null, input.dosageForm ?? null, input.category ?? null]);
    } catch (error: any) {
      if (String(error?.code) === "ER_DUP_ENTRY") {
        const msg = String(error?.message ?? "");
        if (msg.includes("barcode")) throw new Error("BARCODE_ALREADY_EXISTS");
        throw new Error("SKU_ALREADY_EXISTS");
      }
      throw error;
    }
    await tenantPool.query("INSERT INTO audit_logs (actor_id, action, entity, entity_id, after_json) VALUES (?, 'medicine.create', 'medicine', ?, ?)", [userId, id, JSON.stringify(input)]);
    return { id, sku: input.sku, barcode: input.barcode ?? null, name: input.name, genericSalt: input.genericSalt ?? null, strength: input.strength ?? null, dosageForm: input.dosageForm ?? null, category: input.category ?? null, active: true, totalStock: 0 };
  }
  async setMedicineActive(tenantId: string, userId: string, medicineId: string, active: boolean) {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensureInventoryTables(tenantPool);
    const result = await tenantPool.query("UPDATE medicines SET active = ? WHERE id = ?", [active ? 1 : 0, medicineId]) as { affectedRows?: number };
    if (!result.affectedRows) return undefined;
    await tenantPool.query("INSERT INTO audit_logs (actor_id, action, entity, entity_id, after_json) VALUES (?, ?, 'medicine', ?, ?)", [userId, active ? "medicine.activate" : "medicine.deactivate", medicineId, JSON.stringify({ active })]);
    const rows = await this.listMedicines(tenantId, "");
    return rows.find((m) => m.id === medicineId);
  }
  async listBatches(tenantId: string, medicineId: string) {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensureInventoryTables(tenantPool);
    const batches = await tenantPool.query("SELECT id, medicine_id AS medicineId, batch_no AS batchNo, expiry_date AS expiryDate, purchase_price AS purchasePrice, sale_price AS salePrice FROM medicine_batches WHERE medicine_id = ? ORDER BY expiry_date", [medicineId]) as any[];
    const out: BatchRecord[] = [];
    for (const b of batches) {
      const stock = await tenantPool.query("SELECT branch_id AS branchId, quantity, reorder_level AS reorderLevel FROM branch_stock WHERE batch_id = ?", [b.id]) as any[];
      out.push({ id: b.id, medicineId: b.medicineId, batchNo: b.batchNo, expiryDate: String(b.expiryDate).slice(0, 10), purchasePrice: Number(b.purchasePrice), salePrice: Number(b.salePrice), stockByBranch: stock.map((s: any) => ({ branchId: s.branchId, quantity: Number(s.quantity), reorderLevel: Number(s.reorderLevel) })) });
    }
    return out;
  }
  async createBatch(tenantId: string, userId: string, input: { medicineId: string; batchNo: string; expiryDate: string; purchasePrice: number; salePrice: number }) {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensureInventoryTables(tenantPool);
    const medicine = await tenantPool.query("SELECT id FROM medicines WHERE id = ? LIMIT 1", [input.medicineId]) as any[];
    if (!medicine.length) throw new Error("MEDICINE_NOT_FOUND");
    const id = randomId("batch");
    try {
      await tenantPool.query("INSERT INTO medicine_batches (id, medicine_id, batch_no, expiry_date, purchase_price, sale_price) VALUES (?, ?, ?, ?, ?, ?)", [id, input.medicineId, input.batchNo, input.expiryDate, input.purchasePrice, input.salePrice]);
    } catch (error: any) {
      if (String(error?.code) === "ER_DUP_ENTRY") throw new Error("BATCH_ALREADY_EXISTS");
      throw error;
    }
    await tenantPool.query("INSERT INTO audit_logs (actor_id, action, entity, entity_id, after_json) VALUES (?, 'batch.create', 'batch', ?, ?)", [userId, id, JSON.stringify(input)]);
    const batches = await this.listBatches(tenantId, input.medicineId);
    return batches.find((b) => b.id === id)!;
  }
  async adjustStock(tenantId: string, userId: string, input: { branchId: string; batchId: string; quantity: number; movementType: string; referenceId?: string | null; idempotencyKey: string; reorderLevel?: number }) {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensureInventoryTables(tenantPool);
    const existing = await tenantPool.query("SELECT movement_uuid AS id, branch_id AS branchId, batch_id AS batchId, movement_type AS movementType, quantity, reference_id AS referenceId, idempotency_key AS idempotencyKey, server_version AS serverVersion FROM stock_movements WHERE idempotency_key = ? LIMIT 1", [input.idempotencyKey]) as any[];
    if (existing.length) return existing[0] as StockMovementRecord;
    const connection = await tenantPool.getConnection();
    try {
      await connection.beginTransaction();
      const batchRows = await connection.query("SELECT id FROM medicine_batches WHERE id = ? LIMIT 1", [input.batchId]) as any[];
      if (!batchRows.length) throw new Error("BATCH_NOT_FOUND");
      const stockRows = await connection.query("SELECT quantity, reorder_level AS reorderLevel FROM branch_stock WHERE branch_id = ? AND batch_id = ? FOR UPDATE", [input.branchId, input.batchId]) as any[];
      const currentQty = stockRows.length ? Number(stockRows[0].quantity) : 0;
      const currentReorder = stockRows.length ? Number(stockRows[0].reorderLevel) : 0;
      const nextQty = currentQty + input.quantity;
      if (nextQty < 0) throw new Error("NEGATIVE_STOCK");
      const nextReorder = input.reorderLevel !== undefined ? input.reorderLevel : currentReorder;
      if (stockRows.length) await connection.query("UPDATE branch_stock SET quantity = ?, reorder_level = ? WHERE branch_id = ? AND batch_id = ?", [nextQty, nextReorder, input.branchId, input.batchId]);
      else await connection.query("INSERT INTO branch_stock (branch_id, batch_id, quantity, reserved_quantity, reorder_level) VALUES (?, ?, ?, 0, ?)", [input.branchId, input.batchId, nextQty, nextReorder]);
      const movementUuid = randomId("movement");
      const insertResult = await connection.query("INSERT INTO stock_movements (movement_uuid, branch_id, batch_id, movement_type, quantity, reference_id, idempotency_key, server_version, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)", [movementUuid, input.branchId, input.batchId, input.movementType, input.quantity, input.referenceId ?? null, input.idempotencyKey, userId]) as { insertId?: number };
      const serverVersion = Number(insertResult.insertId ?? 0);
      await connection.query("UPDATE stock_movements SET server_version = ? WHERE movement_uuid = ?", [serverVersion, movementUuid]);
      await connection.query("INSERT INTO audit_logs (actor_id, action, entity, entity_id, before_json, after_json) VALUES (?, 'stock.adjust', 'batch', ?, ?, ?)", [userId, input.batchId, JSON.stringify({ quantity: currentQty }), JSON.stringify({ quantity: nextQty, movementType: input.movementType })]);
      await connection.commit();
      return { id: movementUuid, branchId: input.branchId, batchId: input.batchId, movementType: input.movementType, quantity: input.quantity, referenceId: input.referenceId ?? null, idempotencyKey: input.idempotencyKey, serverVersion };
    } catch (error) {
      await connection.rollback().catch(() => undefined);
      throw error;
    } finally {
      connection.release();
    }
  }
  async getStockAlerts(tenantId: string): Promise<StockAlerts> {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensureInventoryTables(tenantPool);
    const lowRows = await tenantPool.query("SELECT bs.branch_id AS branchId, bs.batch_id AS batchId, b.medicine_id AS medicineId, m.name AS medicineName, b.batch_no AS batchNo, bs.quantity, bs.reorder_level AS reorderLevel FROM branch_stock bs JOIN medicine_batches b ON b.id = bs.batch_id JOIN medicines m ON m.id = b.medicine_id WHERE bs.quantity > 0 AND bs.quantity <= bs.reorder_level ORDER BY m.name", []) as any[];
    const expRows = await tenantPool.query("SELECT b.id AS batchId, b.medicine_id AS medicineId, m.name AS medicineName, b.batch_no AS batchNo, b.expiry_date AS expiryDate, COALESCE(SUM(bs.quantity), 0) AS quantity FROM medicine_batches b JOIN medicines m ON m.id = b.medicine_id LEFT JOIN branch_stock bs ON bs.batch_id = b.id GROUP BY b.id HAVING quantity > 0 ORDER BY b.expiry_date", []) as any[];
    const today = new Date().toISOString().slice(0, 10);
    const soon = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
    const expiringSoon: StockAlerts["expiringSoon"] = [];
    const expired: StockAlerts["expired"] = [];
    for (const r of expRows) {
      const item = { batchId: r.batchId, medicineId: r.medicineId, medicineName: r.medicineName, batchNo: r.batchNo, expiryDate: String(r.expiryDate).slice(0, 10), quantity: Number(r.quantity) };
      if (item.expiryDate < today) expired.push(item);
      else if (item.expiryDate <= soon) expiringSoon.push(item);
    }
    return { lowStock: lowRows.map((r: any) => ({ branchId: r.branchId, batchId: r.batchId, medicineId: r.medicineId, medicineName: r.medicineName, batchNo: r.batchNo, quantity: Number(r.quantity), reorderLevel: Number(r.reorderLevel) })), expiringSoon, expired };
  }
  async getFefoBatch(tenantId: string, medicineId: string, branchId: string) {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensureInventoryTables(tenantPool);
    const rows = await tenantPool.query("SELECT b.id, b.medicine_id AS medicineId, b.batch_no AS batchNo, b.expiry_date AS expiryDate, b.purchase_price AS purchasePrice, b.sale_price AS salePrice, bs.quantity FROM medicine_batches b JOIN branch_stock bs ON bs.batch_id = b.id WHERE b.medicine_id = ? AND bs.branch_id = ? AND bs.quantity > 0 AND b.expiry_date >= CURDATE() ORDER BY b.expiry_date LIMIT 1", [medicineId, branchId]) as any[];
    const row = rows[0];
    if (!row) return undefined;
    return { id: row.id, medicineId: row.medicineId, batchNo: row.batchNo, expiryDate: String(row.expiryDate).slice(0, 10), purchasePrice: Number(row.purchasePrice), salePrice: Number(row.salePrice), stockByBranch: [{ branchId, quantity: Number(row.quantity), reorderLevel: 0 }] };
  }
}

export async function createStore(): Promise<Store> {
  const store = process.env.STORAGE_MODE === "mariadb" ? new MariaDbHealthStore() : new MemoryStore();
  if (store instanceof MemoryStore) await store.seed();
  return store;
}
