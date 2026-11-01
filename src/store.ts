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
  isControlled: boolean;
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

export interface PartyRecord {
  id: string;
  type: "customer" | "supplier";
  name: string;
  phone: string | null;
  address: string | null;
  active: boolean;
}

export interface SaleItemRecord {
  medicineId: string;
  batchId: string;
  batchNo: string;
  quantity: number;
  unitPrice: number;
  returnedQuantity: number;
}

export interface SaleRecord {
  id: string;
  invoiceNo: string;
  branchId: string;
  customerId: string | null;
  subtotal: number;
  discount: number;
  total: number;
  paidAmount: number;
  balanceDue: number;
  paymentType: "cash" | "credit";
  status: "completed" | "partially_returned" | "returned";
  items: SaleItemRecord[];
  createdAt: string;
}

export interface PurchaseItemRecord {
  medicineId: string;
  batchId: string;
  batchNo: string;
  expiryDate: string;
  quantity: number;
  purchasePrice: number;
  salePrice: number;
}

export interface PurchaseRecord {
  id: string;
  branchId: string;
  supplierId: string;
  subtotal: number;
  paidAmount: number;
  balanceDue: number;
  status: "pending" | "approved";
  items: PurchaseItemRecord[];
  createdAt: string;
}

export interface SalesReport {
  totalSales: number;
  totalPurchases: number;
  profit: number;
  salesCount: number;
  purchaseCount: number;
  byBranch: Array<{ branchId: string; sales: number; orders: number }>;
  topProducts: Array<{ name: string; units: number; revenue: number }>;
  sales: SaleRecord[];
}

export interface PrescriptionItemInput { medicineId: string; quantity: number; dosage?: string | null; instructions?: string | null; }
export interface PrescriptionRecord {
  id: string; patientName: string; doctorName: string; branchId: string;
  status: "pending" | "dispensed" | "cancelled";
  items: Array<{ medicineId: string; quantity: number; dosage: string | null; instructions: string | null }>;
  createdAt: string;
}
export interface ControlledLogRecord {
  id: string; medicineId: string; batchId: string; branchId: string; quantity: number;
  prescriptionId: string | null; action: "sale" | "dispense"; createdBy: string; createdAt: string;
}
export interface AttendanceRecord { id: string; userId: string; branchId: string; date: string; checkIn: string | null; checkOut: string | null; hours: number; }
export interface PayrollRow { userId: string; daysPresent: number; totalHours: number; monthlySalary: number; pay: number; }
export interface AccountingSummary {
  revenue: number;
  purchases: number;
  profit: number;
  receivable: number;
  payable: number;
  cashReceived: number;
  ledger: Array<{ date: string; type: string; reference: string; debit: number; credit: number; note: string }>;
}

export interface TransferRecord {
  id: string;
  medicineId: string;
  batchId: string;
  batchNo: string;
  fromBranchId: string;
  toBranchId: string;
  quantity: number;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

export interface PublicStoreProduct { medicineId: string; name: string; strength: string | null; dosageForm: string | null; unitPrice: number; available: number; }
export interface OnlineOrderItemRecord { medicineId: string; medicineName: string; quantity: number; unitPrice: number; }
export interface OnlineOrderRecord { id: string; orderNo: string; branchId: string; customerName: string; customerPhone: string; address: string | null; status: "pending" | "confirmed" | "rejected" | "delivered"; total: number; items: OnlineOrderItemRecord[]; createdAt: string; }
export interface OnlineOrderInput { branchId: string; customerName: string; customerPhone: string; address?: string | null; items: Array<{ medicineId: string; quantity: number }>; }

export interface KhataEntryRecord {
  id: string;
  partyId: string;
  entryType: string;
  debit: number;
  credit: number;
  referenceId: string | null;
  note: string | null;
  createdAt: string;
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
  listTenants(): Promise<Array<{ id: string; name: string; plan: string; status: string; databaseName: string; features: { onlineStore: boolean } }>>;
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
  createMedicine(tenantId: string, userId: string, input: { sku: string; barcode?: string | null; name: string; genericSalt?: string | null; strength?: string | null; dosageForm?: string | null; category?: string | null; isControlled?: boolean }): Promise<MedicineRecord>;
  setMedicineActive(tenantId: string, userId: string, medicineId: string, active: boolean): Promise<MedicineRecord | undefined>;
  listBatches(tenantId: string, medicineId: string): Promise<BatchRecord[]>;
  createBatch(tenantId: string, userId: string, input: { medicineId: string; batchNo: string; expiryDate: string; purchasePrice: number; salePrice: number }): Promise<BatchRecord>;
  adjustStock(tenantId: string, userId: string, input: { branchId: string; batchId: string; quantity: number; movementType: string; referenceId?: string | null; idempotencyKey: string; reorderLevel?: number }): Promise<StockMovementRecord>;
  getStockAlerts(tenantId: string): Promise<StockAlerts>;
  getFefoBatch(tenantId: string, medicineId: string, branchId: string): Promise<BatchRecord | undefined>;
  createParty(tenantId: string, input: { type: "customer" | "supplier"; name: string; phone?: string | null; address?: string | null }): Promise<PartyRecord>;
  listParties(tenantId: string, type?: string): Promise<PartyRecord[]>;
  getPartyBalance(tenantId: string, partyId: string): Promise<{ party: PartyRecord; balance: number; entries: KhataEntryRecord[] }>;
  payParty(tenantId: string, userId: string, input: { partyId: string; amount: number; note?: string | null }): Promise<KhataEntryRecord>;
  createSale(tenantId: string, userId: string, input: { branchId: string; customerId?: string | null; prescriptionId?: string | null; items: Array<{ medicineId: string; quantity: number }>; discount: number; paymentType: "cash" | "credit"; paidAmount: number }): Promise<SaleRecord>;
  getSale(tenantId: string, saleId: string): Promise<SaleRecord | undefined>;
  listSales(tenantId: string): Promise<SaleRecord[]>;
  returnSale(tenantId: string, userId: string, saleId: string, items: Array<{ medicineId: string; batchId: string; quantity: number }>): Promise<SaleRecord>;
  createPurchase(tenantId: string, userId: string, input: { branchId: string; supplierId: string; items: Array<{ medicineId: string; batchNo: string; expiryDate: string; purchasePrice: number; salePrice: number; quantity: number }>; paidAmount: number; approved: boolean }): Promise<PurchaseRecord>;
  listPurchases(tenantId: string): Promise<PurchaseRecord[]>;
  approvePurchase(tenantId: string, userId: string, purchaseId: string): Promise<PurchaseRecord>;
  getSalesReport(tenantId: string, filters: { from?: string; to?: string; branchId?: string }): Promise<SalesReport>;
  createTransfer(tenantId: string, userId: string, input: { medicineId: string; batchId: string; fromBranchId: string; toBranchId: string; quantity: number }): Promise<TransferRecord>;
  listTransfers(tenantId: string): Promise<TransferRecord[]>;
  approveTransfer(tenantId: string, userId: string, transferId: string): Promise<TransferRecord>;
  rejectTransfer(tenantId: string, userId: string, transferId: string): Promise<TransferRecord>;
  getAccounting(tenantId: string, filters: { from?: string; to?: string; branchId?: string }): Promise<AccountingSummary>;
  setMedicineControlled(tenantId: string, userId: string, medicineId: string, controlled: boolean): Promise<MedicineRecord | undefined>;
  createPrescription(tenantId: string, userId: string, input: { patientName: string; doctorName: string; branchId: string; items: PrescriptionItemInput[] }): Promise<PrescriptionRecord>;
  listPrescriptions(tenantId: string): Promise<PrescriptionRecord[]>;
  dispensePrescription(tenantId: string, userId: string, prescriptionId: string): Promise<PrescriptionRecord>;
  cancelPrescription(tenantId: string, userId: string, prescriptionId: string): Promise<PrescriptionRecord>;
  listControlledLogs(tenantId: string): Promise<ControlledLogRecord[]>;
  checkIn(tenantId: string, userId: string, branchId: string): Promise<AttendanceRecord>;
  checkOut(tenantId: string, userId: string): Promise<AttendanceRecord>;
  listAttendance(tenantId: string, filters: { userId?: string; branchId?: string; date?: string }): Promise<AttendanceRecord[]>;
  setStaffSalary(tenantId: string, userId: string, monthlySalary: number): Promise<{ userId: string; monthlySalary: number }>;
  getPayroll(tenantId: string, month: string): Promise<PayrollRow[]>;
  getTenantFeatures(tenantId: string): Promise<{ onlineStore: boolean }>;
  setTenantFeature(tenantId: string, feature: string, enabled: boolean): Promise<{ onlineStore: boolean }>;
  getPublicStore(tenantId: string): Promise<{ id: string; name: string; plan: PlanId; status: string; branches: Array<{ id: string; name: string; city: string }>; onlineStoreEnabled: boolean }>;
  getPublicStoreProducts(tenantId: string, branchId: string): Promise<PublicStoreProduct[]>;
  createOnlineOrder(tenantId: string, input: OnlineOrderInput): Promise<OnlineOrderRecord>;
  listOnlineOrders(tenantId: string): Promise<OnlineOrderRecord[]>;
  getOnlineOrder(tenantId: string, orderId: string): Promise<OnlineOrderRecord | undefined>;
  confirmOnlineOrder(tenantId: string, userId: string, orderId: string): Promise<OnlineOrderRecord>;
  rejectOnlineOrder(tenantId: string, userId: string, orderId: string): Promise<OnlineOrderRecord>;
  deliverOnlineOrder(tenantId: string, userId: string, orderId: string): Promise<OnlineOrderRecord>;
}

const ownerPermissions: PermissionCode[] = [
  "dashboard.view", "sales.view", "sales.create", "sales.refund", "sales.discount", "inventory.view", "inventory.edit", "inventory.adjust",
  "purchases.view", "purchases.create", "purchases.approve", "parties.view", "parties.payment", "reports.view", "reports.export",
  "transfers.request", "transfers.approve", "prescriptions.view", "prescriptions.create", "prescriptions.dispense", "attendance.view", "attendance.mark", "payroll.view", "accounting.view", "orders.view", "orders.manage", "admin.users", "admin.devices",
];
const managerPermissions = ownerPermissions.filter((permission) => !["admin.users", "accounting.view"].includes(permission));
const pharmacistPermissions: PermissionCode[] = ["dashboard.view", "sales.view", "sales.create", "inventory.view", "inventory.edit", "purchases.view", "purchases.create", "parties.view", "prescriptions.view", "prescriptions.create", "prescriptions.dispense", "attendance.view", "attendance.mark", "orders.view", "orders.manage"];

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
  async listTenants() { return [...this.tenants.values()].map((t) => ({ id: t.id, name: t.name, plan: t.plan, status: t.status, databaseName: t.id, features: { onlineStore: this.tenantFeatures.get(t.id)?.onlineStore ?? true } })); }
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
  async getDashboard(tenantId: string) {
    const hasReal = [...this.sales.values()].some((x) => x.tenantId === tenantId) || [...this.purchases.values()].some((x) => x.tenantId === tenantId);
    if (!hasReal) return this.dashboards.get(tenantId) ?? { revenue: 0, profit: 0, lowStock: 0, expiringSoon: 0, totalSkus: 0, branchPerformance: [], topProducts: [], activity: [] };
    const alerts = await this.getStockAlerts(tenantId);
    const sales = [...this.sales.values()].filter((x) => x.tenantId === tenantId);
    const revenue = sales.reduce((sum, x) => sum + x.total, 0);
    const cost = sales.flatMap((x) => x.items).reduce((sum, i) => sum + i.quantity * (this.batches.get(i.batchId)?.purchasePrice ?? 0), 0);
    const branchMap = new Map<string, { name: string; revenue: number; orders: number }>();
    for (const sale of sales) {
      const branch = this.tenants.get(tenantId)?.branches.find((b: any) => b.id === sale.branchId);
      const entry = branchMap.get(sale.branchId) ?? { name: branch?.name ?? sale.branchId, revenue: 0, orders: 0 };
      entry.revenue += sale.total; entry.orders += 1; branchMap.set(sale.branchId, entry);
    }
    const productMap = new Map<string, { name: string; units: number; revenue: number }>();
    for (const sale of sales) for (const item of sale.items) {
      const med = this.medicines.get(item.medicineId);
      const entry = productMap.get(item.medicineId) ?? { name: med?.name ?? item.medicineId, units: 0, revenue: 0 };
      const netRatio = sale.subtotal > 0 ? (1 - sale.discount / sale.subtotal) : 1;
      entry.units += item.quantity; entry.revenue += item.quantity * item.unitPrice * netRatio; productMap.set(item.medicineId, entry);
    }
    const activity = [...sales.map((x) => ({ label: `Sale ${x.invoiceNo}`, detail: `Rs ${x.total} · ${x.branchId}`, time: x.createdAt, tone: "success" as const })), ...[...this.purchases.values()].filter((x) => x.tenantId === tenantId).map((x) => ({ label: `Purchase ${x.status}`, detail: `Rs ${x.subtotal} · ${x.branchId}`, time: x.createdAt, tone: "info" as const }))].sort((a, b) => b.time.localeCompare(a.time)).slice(0, 10);
    return { revenue, profit: revenue - cost, lowStock: alerts.lowStock.length, expiringSoon: alerts.expiringSoon.length, totalSkus: [...this.medicines.values()].filter((m) => m.tenantId === tenantId && m.active).length, branchPerformance: [...branchMap.values()], topProducts: [...productMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5), activity };
  }
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
  private parties = new Map<string, PartyRecord & { tenantId: string }>();
  private sales = new Map<string, SaleRecord & { tenantId: string }>();
  private purchases = new Map<string, PurchaseRecord & { tenantId: string }>();
  private khata: KhataEntryRecord[] = [];
  private saleSeq = 0;
  private purchaseSeq = 0;
  private transfers = new Map<string, TransferRecord & { tenantId: string }>();
  private prescriptions = new Map<string, PrescriptionRecord & { tenantId: string }>();
  private attendance = new Map<string, AttendanceRecord & { tenantId: string }>();
  private staffSalaries = new Map<string, number>();
  private controlledLogs: Array<ControlledLogRecord & { tenantId: string }> = [];
  private partyToRecord(party: PartyRecord & { tenantId: string }): PartyRecord {
    const { tenantId: _t, ...rest } = party; return rest;
  }
  private saleToRecord(sale: SaleRecord & { tenantId: string }): SaleRecord {
    const { tenantId: _t, ...rest } = sale; return { ...rest, items: rest.items.map((i) => ({ ...i })) };
  }
  private purchaseToRecord(pur: PurchaseRecord & { tenantId: string }): PurchaseRecord {
    const { tenantId: _t, ...rest } = pur; return { ...rest, items: rest.items.map((i) => ({ ...i })) };
  }
  private addKhata(tenantId: string, partyId: string, entryType: string, debit: number, credit: number, referenceId: string | null, note: string | null) {
    const entry: KhataEntryRecord = { id: randomId("khata"), partyId, entryType, debit, credit, referenceId, note, createdAt: new Date().toISOString() };
    this.khata.push(entry); return entry;
  }
  private partyBalance(tenantId: string, party: PartyRecord & { tenantId: string }) {
    let balance = 0;
    for (const e of this.khata) {
      if (e.partyId !== party.id) continue;
      balance += party.type === "supplier" ? (e.credit - e.debit) : (e.debit - e.credit);
    }
    return balance;
  }
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
  async createMedicine(tenantId: string, _userId: string, input: { sku: string; barcode?: string | null; name: string; genericSalt?: string | null; strength?: string | null; dosageForm?: string | null; category?: string | null; isControlled?: boolean }) {
    const skuExists = [...this.medicines.values()].some((m) => m.tenantId === tenantId && m.sku.toLowerCase() === input.sku.toLowerCase());
    if (skuExists) throw new Error("SKU_ALREADY_EXISTS");
    if (input.barcode) {
      const barcodeExists = [...this.medicines.values()].some((m) => m.tenantId === tenantId && m.barcode === input.barcode);
      if (barcodeExists) throw new Error("BARCODE_ALREADY_EXISTS");
    }
    const medicine: MedicineRecord & { tenantId: string } = { id: randomId("medicine"), tenantId, sku: input.sku, barcode: input.barcode ?? null, name: input.name, genericSalt: input.genericSalt ?? null, strength: input.strength ?? null, dosageForm: input.dosageForm ?? null, category: input.category ?? null, active: true, isControlled: (input as any).isControlled ?? false, totalStock: 0 };
    this.medicines.set(medicine.id, medicine);
    const { tenantId: _t2, ...medRest } = medicine; return { ...medRest, totalStock: 0 };
  }
  async setMedicineActive(tenantId: string, _userId: string, medicineId: string, active: boolean) {
    const medicine = this.medicines.get(medicineId);
    if (!medicine || medicine.tenantId !== tenantId) return undefined;
    medicine.active = active;
    const { tenantId: _t3, ...medRest } = medicine; return { ...medRest, totalStock: this.medicineTotalStock(tenantId, medicineId) };
  }
  async setMedicineControlled(tenantId: string, _userId: string, medicineId: string, controlled: boolean) {
    const medicine = this.medicines.get(medicineId);
    if (!medicine || medicine.tenantId !== tenantId) return undefined;
    medicine.isControlled = controlled;
    const { tenantId: _t4, ...medRest } = medicine; return { ...medRest, totalStock: this.medicineTotalStock(tenantId, medicineId) };
  }
  async createPrescription(tenantId: string, _userId: string, input: { patientName: string; doctorName: string; branchId: string; items: PrescriptionItemInput[] }) {
    if (!input.patientName?.trim() || !input.doctorName?.trim() || !input.items.length) throw new Error("INVALID_ITEMS");
    for (const item of input.items) {
      const medicine = this.medicines.get(item.medicineId);
      if (!medicine || medicine.tenantId !== tenantId || !medicine.active) throw new Error("MEDICINE_NOT_FOUND");
      if (!(item.quantity > 0)) throw new Error("INVALID_ITEMS");
    }
    const rx: PrescriptionRecord & { tenantId: string } = { id: randomId("prescription"), tenantId, patientName: input.patientName, doctorName: input.doctorName, branchId: input.branchId, status: "pending", items: input.items.map((i) => ({ medicineId: i.medicineId, quantity: i.quantity, dosage: i.dosage ?? null, instructions: i.instructions ?? null })), createdAt: new Date().toISOString() };
    this.prescriptions.set(rx.id, rx);
    const { tenantId: _t5, ...rest } = rx; return { ...rest, items: rest.items.map((i) => ({ ...i })) };
  }
  async listPrescriptions(tenantId: string) {
    return [...this.prescriptions.values()].filter((x) => x.tenantId === tenantId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((x) => { const { tenantId: _t, ...rest } = x; return { ...rest, items: rest.items.map((i) => ({ ...i })) }; });
  }
  async dispensePrescription(tenantId: string, userId: string, prescriptionId: string) {
    const rx = this.prescriptions.get(prescriptionId);
    if (!rx || rx.tenantId !== tenantId) throw new Error("PRESCRIPTION_NOT_FOUND");
    if (rx.status !== "pending") throw new Error("PRESCRIPTION_NOT_PENDING");
    const today = new Date().toISOString().slice(0, 10);
    for (const item of rx.items) {
      const candidates = [...this.batches.values()].filter((b) => b.tenantId === tenantId && b.medicineId === item.medicineId && b.expiryDate >= today).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
      let remaining = item.quantity;
      for (const batch of candidates) { const row = this.stock.get(`${rx.branchId}:${batch.id}`); remaining -= Math.min(remaining, row?.quantity ?? 0); if (remaining <= 0) break; }
      if (remaining > 0) throw new Error("INSUFFICIENT_STOCK");
    }
    for (const item of rx.items) {
      let remaining = item.quantity;
      const candidates = [...this.batches.values()].filter((b) => b.tenantId === tenantId && b.medicineId === item.medicineId && b.expiryDate >= today).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
      for (const batch of candidates) {
        if (remaining <= 0) break;
        const key = `${rx.branchId}:${batch.id}`; const row = this.stock.get(key); const avail = row?.quantity ?? 0; if (avail <= 0) continue;
        const take = Math.min(remaining, avail); row!.quantity -= take; this.stock.set(key, row!);
        this.movementSeq += 1;
        this.movements.push({ id: randomId("movement"), branchId: rx.branchId, batchId: batch.id, movementType: "dispense", quantity: -take, referenceId: rx.id, idempotencyKey: `dispense-${rx.id}-${batch.id}`, serverVersion: this.movementSeq });
        const medicine = this.medicines.get(item.medicineId);
        if (medicine?.isControlled) this.controlledLogs.push({ id: randomId("controlled"), tenantId, medicineId: item.medicineId, batchId: batch.id, branchId: rx.branchId, quantity: take, prescriptionId: rx.id, action: "dispense", createdBy: userId, createdAt: new Date().toISOString() });
        remaining -= take;
      }
    }
    rx.status = "dispensed";
    const { tenantId: _t6, ...rest } = rx; return { ...rest, items: rest.items.map((i) => ({ ...i })) };
  }
  async cancelPrescription(tenantId: string, _userId: string, prescriptionId: string) {
    const rx = this.prescriptions.get(prescriptionId);
    if (!rx || rx.tenantId !== tenantId) throw new Error("PRESCRIPTION_NOT_FOUND");
    if (rx.status !== "pending") throw new Error("PRESCRIPTION_NOT_PENDING");
    rx.status = "cancelled";
    const { tenantId: _t7, ...rest } = rx; return { ...rest, items: rest.items.map((i) => ({ ...i })) };
  }
  async listControlledLogs(tenantId: string) {
    return this.controlledLogs.filter((log) => log.tenantId === tenantId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((l) => { const { tenantId: _t, ...rest } = l; return rest; });
  }
  private attendanceToRecord(a: AttendanceRecord & { tenantId: string }): AttendanceRecord { const { tenantId: _t, ...rest } = a; return rest; }
  async checkIn(tenantId: string, userId: string, branchId: string) {
    const user = this.users.get(userId);
    if (!user || user.tenantId !== tenantId || !user.active) throw new Error("USER_NOT_FOUND");
    const date = new Date().toISOString().slice(0, 10);
    const key = `${userId}:${date}`;
    const existing = this.attendance.get(key);
    if (existing && existing.tenantId === tenantId) throw new Error("ALREADY_CHECKED_IN");
    const rec: AttendanceRecord & { tenantId: string } = { id: randomId("attendance"), tenantId, userId, branchId, date, checkIn: new Date().toISOString(), checkOut: null, hours: 0 };
    this.attendance.set(key, rec);
    return this.attendanceToRecord(rec);
  }
  async checkOut(tenantId: string, userId: string) {
    const date = new Date().toISOString().slice(0, 10);
    const rec = this.attendance.get(`${userId}:${date}`);
    if (!rec || rec.tenantId !== tenantId) throw new Error("ATTENDANCE_NOT_FOUND");
    if (rec.checkOut) throw new Error("ALREADY_CHECKED_OUT");
    rec.checkOut = new Date().toISOString();
    rec.hours = Math.round(((new Date(rec.checkOut).getTime() - new Date(rec.checkIn!).getTime()) / 3600000) * 100) / 100;
    return this.attendanceToRecord(rec);
  }
  async listAttendance(tenantId: string, filters: { userId?: string; branchId?: string; date?: string }) {
    return [...this.attendance.values()].filter((a) => a.tenantId === tenantId && (!filters.userId || a.userId === filters.userId) && (!filters.branchId || a.branchId === filters.branchId) && (!filters.date || a.date === filters.date)).sort((a, b) => b.date.localeCompare(a.date)).map((a) => this.attendanceToRecord(a));
  }
  async setStaffSalary(tenantId: string, userId: string, monthlySalary: number) {
    const user = this.users.get(userId);
    if (!user || user.tenantId !== tenantId) throw new Error("USER_NOT_FOUND");
    if (!(monthlySalary >= 0)) throw new Error("INVALID_AMOUNT");
    this.staffSalaries.set(userId, monthlySalary);
    return { userId, monthlySalary };
  }
  async getPayroll(tenantId: string, month: string) {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("INVALID_INPUT");
    const [y, m] = month.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const byUser = new Map<string, { days: number; hours: number }>();
    for (const a of this.attendance.values()) {
      if (a.tenantId !== tenantId || !a.date.startsWith(month) || !a.checkIn) continue;
      const e = byUser.get(a.userId) ?? { days: 0, hours: 0 }; e.days += 1; e.hours += a.hours; byUser.set(a.userId, e);
    }
    return [...byUser.entries()].map(([userId, e]) => {
      const monthlySalary = this.staffSalaries.get(userId) ?? 0;
      return { userId, daysPresent: e.days, totalHours: Math.round(e.hours * 100) / 100, monthlySalary, pay: Math.round(monthlySalary * e.days / daysInMonth * 100) / 100 };
    }).sort((a, b) => a.userId.localeCompare(b.userId));
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
  async createParty(tenantId: string, input: { type: "customer" | "supplier"; name: string; phone?: string | null; address?: string | null }) {
    const party: PartyRecord & { tenantId: string } = { id: randomId("party"), tenantId, type: input.type, name: input.name, phone: input.phone ?? null, address: input.address ?? null, active: true };
    this.parties.set(party.id, party); return this.partyToRecord(party);
  }
  async listParties(tenantId: string, type?: string) {
    return [...this.parties.values()].filter((x) => x.tenantId === tenantId && (!type || x.type === type)).sort((a, b) => a.name.localeCompare(b.name)).map((x) => this.partyToRecord(x));
  }
  async getPartyBalance(tenantId: string, partyId: string) {
    const party = this.parties.get(partyId);
    if (!party || party.tenantId !== tenantId) throw new Error("PARTY_NOT_FOUND");
    return { party: this.partyToRecord(party), balance: this.partyBalance(tenantId, party), entries: this.khata.filter((e) => e.partyId === partyId).map((e) => ({ ...e })) };
  }
  async payParty(tenantId: string, _userId: string, input: { partyId: string; amount: number; note?: string | null }) {
    const party = this.parties.get(input.partyId);
    if (!party || party.tenantId !== tenantId) throw new Error("PARTY_NOT_FOUND");
    if (!(input.amount > 0)) throw new Error("INVALID_AMOUNT");
    // customer pays us -> credit; we pay supplier -> debit. Both reduce the balance.
    const entry = this.addKhata(tenantId, party.id, "payment", party.type === "supplier" ? input.amount : 0, party.type === "supplier" ? 0 : input.amount, null, input.note ?? null);
    // Sync: a customer payment is allocated FIFO to that customer's oldest open
    // credit sales, so sale list balanceDue and khata balance stay the same truth.
    // A supplier payment is allocated FIFO to that supplier's oldest open purchases.
    let remaining = input.amount;
    if (party.type === "customer") {
      for (const sale of [...this.sales.values()].filter((x) => x.tenantId === tenantId && x.customerId === party.id && x.balanceDue > 0).sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, sale.balanceDue); sale.balanceDue -= take; remaining -= take;
      }
    } else {
      for (const pur of [...this.purchases.values()].filter((x) => x.tenantId === tenantId && x.supplierId === party.id && x.balanceDue > 0).sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
        if (remaining <= 0) break;
        const take = Math.min(remaining, pur.balanceDue); pur.balanceDue -= take; remaining -= take;
      }
    }
    return entry;
  }
  async createSale(tenantId: string, _userId: string, input: { branchId: string; customerId?: string | null; prescriptionId?: string | null; items: Array<{ medicineId: string; quantity: number }>; discount: number; paymentType: "cash" | "credit"; paidAmount: number }) {
    const today = new Date().toISOString().slice(0, 10);
    if (!input.items.length) throw new Error("INVALID_ITEMS");
    if (input.paymentType === "credit" && !input.customerId) throw new Error("CUSTOMER_REQUIRED");
    if (input.customerId) {
      const party = this.parties.get(input.customerId);
      if (!party || party.tenantId !== tenantId || party.type !== "customer") throw new Error("PARTY_NOT_FOUND");
    }
    // Slice 3 gate: a controlled medicine may only be sold against a pending
    // prescription for the same branch, covering at least the sold quantity.
    const controlledItems = input.items.filter((item) => this.medicines.get(item.medicineId)?.isControlled);
    let gateRx: (PrescriptionRecord & { tenantId: string }) | undefined;
    if (controlledItems.length) {
      if (!input.prescriptionId) throw new Error("CONTROLLED_PRESCRIPTION_REQUIRED");
      gateRx = this.prescriptions.get(input.prescriptionId);
      if (!gateRx || gateRx.tenantId !== tenantId) throw new Error("PRESCRIPTION_NOT_FOUND");
      if (gateRx.branchId !== input.branchId) throw new Error("PRESCRIPTION_BRANCH_MISMATCH");
      if (gateRx.status !== "pending") throw new Error("PRESCRIPTION_NOT_PENDING");
      for (const item of controlledItems) {
        const rxItem = gateRx.items.find((i) => i.medicineId === item.medicineId);
        if (!rxItem || rxItem.quantity < item.quantity) throw new Error("PRESCRIPTION_QTY_EXCEEDED");
      }
    }
    // FEFO allocation, fully pre-checked before any stock moves.
    const allocations: Array<{ medicineId: string; batchId: string; batchNo: string; quantity: number; unitPrice: number }> = [];
    for (const item of input.items) {
      const medicine = this.medicines.get(item.medicineId);
      if (!medicine || medicine.tenantId !== tenantId || !medicine.active) throw new Error("MEDICINE_NOT_FOUND");
      if (!(item.quantity > 0)) throw new Error("INVALID_ITEMS");
      let remaining = item.quantity;
      const candidates = [...this.batches.values()].filter((b) => b.tenantId === tenantId && b.medicineId === item.medicineId && b.expiryDate >= today).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
      for (const batch of candidates) {
        if (remaining <= 0) break;
        const row = this.stock.get(`${input.branchId}:${batch.id}`);
        const avail = row?.quantity ?? 0;
        if (avail <= 0) continue;
        const take = Math.min(remaining, avail);
        allocations.push({ medicineId: item.medicineId, batchId: batch.id, batchNo: batch.batchNo, quantity: take, unitPrice: batch.salePrice });
        remaining -= take;
      }
      if (remaining > 0) throw new Error("INSUFFICIENT_STOCK");
    }
    const subtotal = allocations.reduce((sum, a) => sum + a.quantity * a.unitPrice, 0);
    if (input.discount < 0 || input.discount > subtotal) throw new Error("INVALID_DISCOUNT");
    const total = subtotal - input.discount;
    if (input.paidAmount < 0 || input.paidAmount > total) throw new Error("PAYMENT_MISMATCH");
    if (input.paymentType === "cash" && input.paidAmount !== total) throw new Error("PAYMENT_MISMATCH");
    const balanceDue = total - input.paidAmount;
    this.saleSeq += 1;
    const saleId = randomId("sale");
    const invoiceNo = "INV-" + String(this.saleSeq).padStart(6, "0");
    for (const a of allocations) {
      const key = `${input.branchId}:${a.batchId}`;
      const row = this.stock.get(key)!; row.quantity -= a.quantity; this.stock.set(key, row);
      this.movementSeq += 1;
      this.movements.push({ id: randomId("movement"), branchId: input.branchId, batchId: a.batchId, movementType: "sale", quantity: -a.quantity, referenceId: saleId, idempotencyKey: `sale-${saleId}-${a.batchId}`, serverVersion: this.movementSeq });
    }
    const sale: SaleRecord & { tenantId: string } = { id: saleId, tenantId, invoiceNo, branchId: input.branchId, customerId: input.customerId ?? null, subtotal, discount: input.discount, total, paidAmount: input.paidAmount, balanceDue, paymentType: input.paymentType, status: "completed", items: allocations.map((a) => ({ ...a, returnedQuantity: 0 })), createdAt: new Date().toISOString() };
    this.sales.set(saleId, sale);
    if (gateRx) {
      gateRx.status = "dispensed";
      for (const a of allocations) {
        if (!this.medicines.get(a.medicineId)?.isControlled) continue;
        this.controlledLogs.push({ id: randomId("controlled"), tenantId, medicineId: a.medicineId, batchId: a.batchId, branchId: input.branchId, quantity: a.quantity, prescriptionId: gateRx.id, action: "sale", createdBy: _userId, createdAt: new Date().toISOString() });
      }
    }
    if (balanceDue > 0 && input.customerId) this.addKhata(tenantId, input.customerId, "sale_credit", balanceDue, 0, saleId, `Sale ${invoiceNo} credit`);
    return this.saleToRecord(sale);
  }
  async getSale(tenantId: string, saleId: string) {
    const sale = this.sales.get(saleId);
    if (!sale || sale.tenantId !== tenantId) return undefined;
    return this.saleToRecord(sale);
  }
  // Phase 4 slice 5 — Online store (Advanced only). Public storefront
  // products exclude controlled medicines: an anonymous customer cannot
  // present a prescription, so controlled stock is never sold online.
  // Order placement checks stock but does NOT deduct it; confirm deducts
  // FEFO in one pre-checked pass; reject moves nothing; delivered is a
  // status change only. Confirmed/delivered online totals are a separate
  // channel from POS sales totals — they are shown on the Orders page and
  // never mixed into dashboard/POS revenue, so no menu can double-count.
  private onlineOrders = new Map<string, OnlineOrderRecord & { tenantId: string }>();
  private onlineOrderSeq = new Map<string, number>();
  private tenantFeatures = new Map<string, { onlineStore: boolean }>();
  async getTenantFeatures(tenantId: string) {
    return { ...(this.tenantFeatures.get(tenantId) ?? { onlineStore: true }) };
  }
  async setTenantFeature(tenantId: string, feature: string, enabled: boolean) {
    if (feature !== "online_store") throw new Error("FEATURE_NOT_SUPPORTED");
    const tenant = this.tenants.get(tenantId);
    if (!tenant) throw new Error("TENANT_NOT_FOUND");
    this.tenantFeatures.set(tenantId, { onlineStore: enabled });
    return { onlineStore: enabled };
  }
  private onlineProductPrice(tenantId: string, medicineId: string, branchId: string): { unitPrice: number; available: number } | undefined {
    const today = new Date().toISOString().slice(0, 10);
    const candidates = [...this.batches.values()].filter((b) => b.tenantId === tenantId && b.medicineId === medicineId && b.expiryDate >= today).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
    let available = 0; let unitPrice: number | undefined;
    for (const batch of candidates) {
      const qty = this.stock.get(`${branchId}:${batch.id}`)?.quantity ?? 0;
      if (qty <= 0) continue;
      if (unitPrice === undefined) unitPrice = batch.salePrice;
      available += qty;
    }
    if (unitPrice === undefined) return undefined;
    return { unitPrice, available };
  }
  async getPublicStore(tenantId: string) {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) throw new Error("TENANT_NOT_FOUND");
    return { id: tenant.id, name: tenant.name, plan: tenant.plan, status: tenant.status, branches: tenant.branches.map((b) => ({ ...b })), onlineStoreEnabled: (await this.getTenantFeatures(tenantId)).onlineStore };
  }
  async getPublicStoreProducts(tenantId: string, branchId: string) {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) throw new Error("TENANT_NOT_FOUND");
    if (!tenant.branches.some((b) => b.id === branchId)) throw new Error("BRANCH_NOT_FOUND");
    const out: PublicStoreProduct[] = [];
    for (const med of [...this.medicines.values()].filter((m) => m.tenantId === tenantId && m.active && !m.isControlled).sort((a, b) => a.name.localeCompare(b.name))) {
      const priced = this.onlineProductPrice(tenantId, med.id, branchId);
      if (!priced || priced.available <= 0) continue;
      out.push({ medicineId: med.id, name: med.name, strength: med.strength, dosageForm: med.dosageForm, unitPrice: priced.unitPrice, available: priced.available });
    }
    return out;
  }
  async createOnlineOrder(tenantId: string, input: OnlineOrderInput) {
    const tenant = this.tenants.get(tenantId);
    if (!tenant) throw new Error("TENANT_NOT_FOUND");
    if (!tenant.branches.some((b) => b.id === input.branchId)) throw new Error("BRANCH_NOT_FOUND");
    if (!input.items.length) throw new Error("INVALID_ITEMS");
    const merged = new Map<string, number>();
    for (const item of input.items) {
      if (!(item.quantity > 0)) throw new Error("INVALID_ITEMS");
      merged.set(item.medicineId, (merged.get(item.medicineId) ?? 0) + item.quantity);
    }
    const items: OnlineOrderItemRecord[] = [];
    for (const [medicineId, quantity] of merged) {
      const med = this.medicines.get(medicineId);
      if (!med || med.tenantId !== tenantId || !med.active || med.isControlled) throw new Error("MEDICINE_NOT_FOUND");
      const priced = this.onlineProductPrice(tenantId, medicineId, input.branchId);
      if (!priced || priced.available < quantity) throw new Error("INSUFFICIENT_STOCK");
      items.push({ medicineId, medicineName: med.name, quantity, unitPrice: priced.unitPrice });
    }
    const total = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
    const seq = (this.onlineOrderSeq.get(tenantId) ?? 0) + 1;
    this.onlineOrderSeq.set(tenantId, seq);
    const order: OnlineOrderRecord & { tenantId: string } = { id: randomId("order"), tenantId, orderNo: "ORD-" + String(seq).padStart(6, "0"), branchId: input.branchId, customerName: input.customerName, customerPhone: input.customerPhone, address: input.address ?? null, status: "pending", total, items, createdAt: new Date().toISOString() };
    this.onlineOrders.set(order.id, order);
    return this.onlineOrderToRecord(order);
  }
  async listOnlineOrders(tenantId: string) {
    return [...this.onlineOrders.values()].filter((x) => x.tenantId === tenantId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((x) => this.onlineOrderToRecord(x));
  }
  async getOnlineOrder(tenantId: string, orderId: string) {
    const order = this.onlineOrders.get(orderId);
    if (!order || order.tenantId !== tenantId) return undefined;
    return this.onlineOrderToRecord(order);
  }
  async confirmOnlineOrder(tenantId: string, userId: string, orderId: string) {
    const order = this.onlineOrders.get(orderId);
    if (!order || order.tenantId !== tenantId) throw new Error("ORDER_NOT_FOUND");
    if (order.status !== "pending") throw new Error("ORDER_NOT_PENDING");
    const today = new Date().toISOString().slice(0, 10);
    const allocations: Array<{ medicineId: string; batchId: string; quantity: number }> = [];
    for (const item of order.items) {
      let remaining = item.quantity;
      const candidates = [...this.batches.values()].filter((b) => b.tenantId === tenantId && b.medicineId === item.medicineId && b.expiryDate >= today).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
      for (const batch of candidates) {
        if (remaining <= 0) break;
        const row = this.stock.get(`${order.branchId}:${batch.id}`);
        const avail = row?.quantity ?? 0;
        if (avail <= 0) continue;
        const take = Math.min(remaining, avail);
        allocations.push({ medicineId: item.medicineId, batchId: batch.id, quantity: take });
        remaining -= take;
      }
      if (remaining > 0) throw new Error("INSUFFICIENT_STOCK");
    }
    for (const a of allocations) {
      const key = `${order.branchId}:${a.batchId}`;
      const row = this.stock.get(key)!; row.quantity -= a.quantity; this.stock.set(key, row);
      this.movementSeq += 1;
      this.movements.push({ id: randomId("movement"), branchId: order.branchId, batchId: a.batchId, movementType: "online_order", quantity: -a.quantity, referenceId: order.id, idempotencyKey: `online-order-${order.id}-${a.batchId}`, serverVersion: this.movementSeq });
    }
    order.status = "confirmed";
    return this.onlineOrderToRecord(order);
  }
  async rejectOnlineOrder(tenantId: string, _userId: string, orderId: string) {
    const order = this.onlineOrders.get(orderId);
    if (!order || order.tenantId !== tenantId) throw new Error("ORDER_NOT_FOUND");
    if (order.status !== "pending") throw new Error("ORDER_NOT_PENDING");
    order.status = "rejected";
    return this.onlineOrderToRecord(order);
  }
  async deliverOnlineOrder(tenantId: string, _userId: string, orderId: string) {
    const order = this.onlineOrders.get(orderId);
    if (!order || order.tenantId !== tenantId) throw new Error("ORDER_NOT_FOUND");
    if (order.status !== "confirmed") throw new Error("ORDER_NOT_CONFIRMED");
    order.status = "delivered";
    return this.onlineOrderToRecord(order);
  }
  private onlineOrderToRecord(order: OnlineOrderRecord & { tenantId: string }): OnlineOrderRecord {
    const { tenantId: _t, ...rest } = order; return { ...rest, items: rest.items.map((i) => ({ ...i })) };
  }
  async listSales(tenantId: string) {
    return [...this.sales.values()].filter((x) => x.tenantId === tenantId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((x) => this.saleToRecord(x));
  }
  async returnSale(tenantId: string, _userId: string, saleId: string, items: Array<{ medicineId: string; batchId: string; quantity: number }>) {
    const sale = this.sales.get(saleId);
    if (!sale || sale.tenantId !== tenantId) throw new Error("SALE_NOT_FOUND");
    if (sale.status === "returned") throw new Error("ALREADY_RETURNED");
    let refund = 0;
    for (const item of items) {
      const line = sale.items.find((i) => i.medicineId === item.medicineId && i.batchId === item.batchId);
      if (!line) throw new Error("RETURN_ITEM_NOT_FOUND");
      if (!(item.quantity > 0) || item.quantity > line.quantity - line.returnedQuantity) throw new Error("RETURN_EXCEEDS_SOLD");
      const discountRatio = sale.subtotal > 0 ? sale.discount / sale.subtotal : 0;
      refund += item.quantity * line.unitPrice * (1 - discountRatio);
    }
    refund = Math.round(refund * 100) / 100;
    for (const item of items) {
      const line = sale.items.find((i) => i.medicineId === item.medicineId && i.batchId === item.batchId)!;
      line.returnedQuantity += item.quantity;
      const key = `${sale.branchId}:${item.batchId}`;
      const row = this.stock.get(key) ?? { quantity: 0, reorderLevel: 0 }; row.quantity += item.quantity; this.stock.set(key, row);
      this.movementSeq += 1;
      this.movements.push({ id: randomId("movement"), branchId: sale.branchId, batchId: item.batchId, movementType: "return", quantity: item.quantity, referenceId: saleId, idempotencyKey: `return-${saleId}-${item.batchId}-${line.returnedQuantity}`, serverVersion: this.movementSeq });
    }
    if (sale.customerId && refund > 0) {
      const party = this.parties.get(sale.customerId);
      if (party) {
        const balance = this.partyBalance(tenantId, party);
        const credit = Math.min(refund, Math.max(0, balance));
        if (credit > 0) { this.addKhata(tenantId, party.id, "sale_return", 0, credit, saleId, `Return on ${sale.invoiceNo}`); sale.balanceDue = Math.max(0, sale.balanceDue - credit); }
      }
    }
    sale.status = sale.items.every((i) => i.returnedQuantity >= i.quantity) ? "returned" : "partially_returned";
    return this.saleToRecord(sale);
  }
  async createPurchase(tenantId: string, _userId: string, input: { branchId: string; supplierId: string; items: Array<{ medicineId: string; batchNo: string; expiryDate: string; purchasePrice: number; salePrice: number; quantity: number }>; paidAmount: number; approved: boolean }) {
    const supplier = this.parties.get(input.supplierId);
    if (!supplier || supplier.tenantId !== tenantId || supplier.type !== "supplier") throw new Error("PARTY_NOT_FOUND");
    if (!input.items.length) throw new Error("INVALID_ITEMS");
    for (const item of input.items) {
      const medicine = this.medicines.get(item.medicineId);
      if (!medicine || medicine.tenantId !== tenantId) throw new Error("MEDICINE_NOT_FOUND");
      if (!(item.quantity > 0) || item.purchasePrice < 0 || item.salePrice < 0) throw new Error("INVALID_ITEMS");
    }
    const subtotal = input.items.reduce((sum, i) => sum + i.quantity * i.purchasePrice, 0);
    if (input.paidAmount < 0 || input.paidAmount > subtotal) throw new Error("PAYMENT_MISMATCH");
    const balanceDue = subtotal - input.paidAmount;
    this.purchaseSeq += 1;
    const purchaseId = randomId("purchase");
    const purchaseItems: PurchaseItemRecord[] = input.items.map((i) => ({ medicineId: i.medicineId, batchId: "", batchNo: i.batchNo, expiryDate: i.expiryDate, quantity: i.quantity, purchasePrice: i.purchasePrice, salePrice: i.salePrice }));
    const purchase: PurchaseRecord & { tenantId: string } = { id: purchaseId, tenantId, branchId: input.branchId, supplierId: input.supplierId, subtotal, paidAmount: input.paidAmount, balanceDue, status: input.approved ? "approved" : "pending", items: purchaseItems, createdAt: new Date().toISOString() };
    this.purchases.set(purchaseId, purchase);
    if (input.approved) this.applyPurchaseStock(tenantId, purchase);
    return this.purchaseToRecord(purchase);
  }
  private applyPurchaseStock(tenantId: string, purchase: PurchaseRecord & { tenantId: string }) {
    for (const item of purchase.items) {
      let batch = [...this.batches.values()].find((b) => b.tenantId === tenantId && b.medicineId === item.medicineId && b.batchNo.toLowerCase() === item.batchNo.toLowerCase());
      if (!batch) {
        batch = { id: randomId("batch"), tenantId, medicineId: item.medicineId, batchNo: item.batchNo, expiryDate: item.expiryDate, purchasePrice: item.purchasePrice, salePrice: item.salePrice, stockByBranch: [] };
        this.batches.set(batch.id, batch);
      }
      item.batchId = batch.id;
      const key = `${purchase.branchId}:${batch.id}`;
      const row = this.stock.get(key) ?? { quantity: 0, reorderLevel: 0 }; row.quantity += item.quantity; this.stock.set(key, row);
      this.movementSeq += 1;
      this.movements.push({ id: randomId("movement"), branchId: purchase.branchId, batchId: batch.id, movementType: "purchase", quantity: item.quantity, referenceId: purchase.id, idempotencyKey: `purchase-${purchase.id}-${batch.id}`, serverVersion: this.movementSeq });
    }
    if (purchase.balanceDue > 0) this.addKhata(tenantId, purchase.supplierId, "purchase_payable", 0, purchase.balanceDue, purchase.id, "Purchase payable");
  }
  async listPurchases(tenantId: string) {
    return [...this.purchases.values()].filter((x) => x.tenantId === tenantId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((x) => this.purchaseToRecord(x));
  }
  async approvePurchase(tenantId: string, _userId: string, purchaseId: string) {
    const purchase = this.purchases.get(purchaseId);
    if (!purchase || purchase.tenantId !== tenantId) throw new Error("PURCHASE_NOT_FOUND");
    if (purchase.status === "approved") throw new Error("ALREADY_APPROVED");
    purchase.status = "approved";
    this.applyPurchaseStock(tenantId, purchase);
    return this.purchaseToRecord(purchase);
  }
  async getSalesReport(tenantId: string, filters: { from?: string; to?: string; branchId?: string }): Promise<SalesReport> {
    const inRange = (createdAt: string) => {
      const d = createdAt.slice(0, 10);
      if (filters.from && d < filters.from) return false;
      if (filters.to && d > filters.to) return false;
      return true;
    };
    const sales = [...this.sales.values()].filter((x) => x.tenantId === tenantId && inRange(x.createdAt) && (!filters.branchId || x.branchId === filters.branchId));
    const purchases = [...this.purchases.values()].filter((x) => x.tenantId === tenantId && inRange(x.createdAt) && (!filters.branchId || x.branchId === filters.branchId));
    const totalSales = sales.reduce((sum, x) => sum + x.total, 0);
    const totalPurchases = purchases.filter((x) => x.status === "approved").reduce((sum, x) => sum + x.subtotal, 0);
    const cost = sales.flatMap((x) => x.items).reduce((sum, i) => sum + i.quantity * (this.batches.get(i.batchId)?.purchasePrice ?? 0), 0);
    const branchMap = new Map<string, { branchId: string; sales: number; orders: number }>();
    for (const sale of sales) {
      const entry = branchMap.get(sale.branchId) ?? { branchId: sale.branchId, sales: 0, orders: 0 };
      entry.sales += sale.total; entry.orders += 1; branchMap.set(sale.branchId, entry);
    }
    const productMap = new Map<string, { name: string; units: number; revenue: number }>();
    for (const sale of sales) for (const item of sale.items) {
      const med = this.medicines.get(item.medicineId);
      const entry = productMap.get(item.medicineId) ?? { name: med?.name ?? item.medicineId, units: 0, revenue: 0 };
      const netRatio = sale.subtotal > 0 ? (1 - sale.discount / sale.subtotal) : 1;
      entry.units += item.quantity; entry.revenue += item.quantity * item.unitPrice * netRatio; productMap.set(item.medicineId, entry);
    }
    return { totalSales, totalPurchases, profit: totalSales - cost, salesCount: sales.length, purchaseCount: purchases.length, byBranch: [...branchMap.values()], topProducts: [...productMap.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10), sales: sales.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((x) => this.saleToRecord(x)) };
  }
  async createTransfer(tenantId: string, _userId: string, input: { medicineId: string; batchId: string; fromBranchId: string; toBranchId: string; quantity: number }) {
    if (input.fromBranchId === input.toBranchId) throw new Error("SAME_BRANCH_TRANSFER");
    if (!(input.quantity > 0)) throw new Error("INVALID_ITEMS");
    const batch = this.batches.get(input.batchId);
    if (!batch || batch.tenantId !== tenantId || batch.medicineId !== input.medicineId) throw new Error("BATCH_NOT_FOUND");
    const transfer: TransferRecord & { tenantId: string } = { id: randomId("transfer"), tenantId, medicineId: input.medicineId, batchId: input.batchId, batchNo: batch.batchNo, fromBranchId: input.fromBranchId, toBranchId: input.toBranchId, quantity: input.quantity, status: "pending", createdAt: new Date().toISOString() };
    this.transfers.set(transfer.id, transfer);
    const { tenantId: _t, ...rest } = transfer; return rest;
  }
  async listTransfers(tenantId: string) {
    return [...this.transfers.values()].filter((x) => x.tenantId === tenantId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((x) => { const { tenantId: _t, ...rest } = x; return rest; });
  }
  async approveTransfer(tenantId: string, _userId: string, transferId: string) {
    const transfer = this.transfers.get(transferId);
    if (!transfer || transfer.tenantId !== tenantId) throw new Error("TRANSFER_NOT_FOUND");
    if (transfer.status !== "pending") throw new Error("TRANSFER_NOT_PENDING");
    const fromKey = `${transfer.fromBranchId}:${transfer.batchId}`;
    const fromRow = this.stock.get(fromKey);
    if (!fromRow || fromRow.quantity < transfer.quantity) throw new Error("INSUFFICIENT_STOCK");
    fromRow.quantity -= transfer.quantity; this.stock.set(fromKey, fromRow);
    const toKey = `${transfer.toBranchId}:${transfer.batchId}`;
    const toRow = this.stock.get(toKey) ?? { quantity: 0, reorderLevel: fromRow.reorderLevel }; toRow.quantity += transfer.quantity; this.stock.set(toKey, toRow);
    this.movementSeq += 1;
    this.movements.push({ id: randomId("movement"), branchId: transfer.fromBranchId, batchId: transfer.batchId, movementType: "transfer", quantity: -transfer.quantity, referenceId: transfer.id, idempotencyKey: `transfer-out-${transfer.id}`, serverVersion: this.movementSeq });
    this.movementSeq += 1;
    this.movements.push({ id: randomId("movement"), branchId: transfer.toBranchId, batchId: transfer.batchId, movementType: "transfer", quantity: transfer.quantity, referenceId: transfer.id, idempotencyKey: `transfer-in-${transfer.id}`, serverVersion: this.movementSeq });
    transfer.status = "approved";
    const { tenantId: _t, ...rest } = transfer; return rest;
  }
  async rejectTransfer(tenantId: string, _userId: string, transferId: string) {
    const transfer = this.transfers.get(transferId);
    if (!transfer || transfer.tenantId !== tenantId) throw new Error("TRANSFER_NOT_FOUND");
    if (transfer.status !== "pending") throw new Error("TRANSFER_NOT_PENDING");
    transfer.status = "rejected";
    const { tenantId: _t, ...rest } = transfer; return rest;
  }
  async getAccounting(tenantId: string, filters: { from?: string; to?: string; branchId?: string }): Promise<AccountingSummary> {
    const inRange = (createdAt: string) => {
      const d = createdAt.slice(0, 10);
      if (filters.from && d < filters.from) return false;
      if (filters.to && d > filters.to) return false;
      return true;
    };
    const sales = [...this.sales.values()].filter((x) => x.tenantId === tenantId && inRange(x.createdAt) && (!filters.branchId || x.branchId === filters.branchId));
    const purchases = [...this.purchases.values()].filter((x) => x.tenantId === tenantId && x.status === "approved" && inRange(x.createdAt) && (!filters.branchId || x.branchId === filters.branchId));
    const revenue = sales.reduce((sum, x) => sum + x.total, 0);
    const purchaseTotal = purchases.reduce((sum, x) => sum + x.subtotal, 0);
    const cost = sales.flatMap((x) => x.items).reduce((sum, i) => sum + i.quantity * (this.batches.get(i.batchId)?.purchasePrice ?? 0), 0);
    let receivable = 0; let payable = 0;
    for (const party of this.parties.values()) {
      if (party.tenantId !== tenantId) continue;
      const balance = this.partyBalance(tenantId, party);
      if (party.type === "customer" && balance > 0) receivable += balance;
      if (party.type === "supplier" && balance > 0) payable += balance;
    }
    const cashReceived = sales.reduce((sum, x) => sum + x.paidAmount, 0);
    const ledger: AccountingSummary["ledger"] = [];
    for (const sale of sales) {
      ledger.push({ date: sale.createdAt, type: "sale", reference: sale.invoiceNo, debit: sale.paidAmount, credit: 0, note: `Sale ${sale.invoiceNo} cash received` });
      if (sale.balanceDue > 0) ledger.push({ date: sale.createdAt, type: "sale_credit", reference: sale.invoiceNo, debit: sale.balanceDue, credit: 0, note: `Sale ${sale.invoiceNo} receivable` });
      ledger.push({ date: sale.createdAt, type: "sale_revenue", reference: sale.invoiceNo, debit: 0, credit: sale.total, note: `Sale ${sale.invoiceNo} revenue` });
    }
    for (const pur of purchases) {
      ledger.push({ date: pur.createdAt, type: "purchase", reference: pur.id, debit: pur.subtotal, credit: 0, note: "Purchase stock" });
      if (pur.paidAmount > 0) ledger.push({ date: pur.createdAt, type: "purchase_payment", reference: pur.id, debit: 0, credit: pur.paidAmount, note: "Purchase cash paid" });
      if (pur.balanceDue > 0) ledger.push({ date: pur.createdAt, type: "purchase_payable", reference: pur.id, debit: 0, credit: pur.balanceDue, note: "Purchase payable" });
    }
    for (const entry of this.khata) {
      const party = this.parties.get(entry.partyId);
      if (!party || party.tenantId !== tenantId) continue;
      if (entry.entryType !== "payment") continue;
      const amount = entry.debit + entry.credit;
      if (party.type === "customer") { ledger.push({ date: entry.createdAt, type: "khata_payment", reference: entry.partyId, debit: amount, credit: 0, note: "Customer khata payment received (cash)" }); ledger.push({ date: entry.createdAt, type: "khata_payment", reference: entry.partyId, debit: 0, credit: amount, note: "Customer khata payment received (receivable)" }); }
      else { ledger.push({ date: entry.createdAt, type: "khata_payment", reference: entry.partyId, debit: amount, credit: 0, note: "Supplier khata payment made (payable)" }); ledger.push({ date: entry.createdAt, type: "khata_payment", reference: entry.partyId, debit: 0, credit: amount, note: "Supplier khata payment made (cash)" }); }
    }
    ledger.sort((a, b) => a.date.localeCompare(b.date));
    return { revenue, purchases: purchaseTotal, profit: revenue - cost, receivable, payable, cashReceived, ledger: ledger.slice(0, 200) };
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
  async listTenants() {
    await this.ensureTenantFeatureColumn();
    const rows = await this.pool.query("SELECT id, name, plan, status, database_name AS databaseName, feature_flags_json AS featureFlags FROM tenants ORDER BY created_at DESC LIMIT 200") as any[];
    return rows.map((r: any) => ({ id: r.id, name: r.name, plan: r.plan, status: r.status, databaseName: r.databaseName, features: this.parseTenantFeatures(r.featureFlags) }));
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
  async getDashboard(tenantId: string) {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensureInventoryTables(tenantPool); await this.ensurePhase3Tables(tenantPool);
    const tenant = await this.getTenant(tenantId);
    const branchName = (id: string) => tenant?.branches.find((b: any) => b.id === id)?.name ?? id;
    const revenueRows = await tenantPool.query("SELECT COALESCE(SUM(total), 0) AS revenue FROM sales") as any[];
    const revenue = Number(revenueRows[0]?.revenue ?? 0);
    const costRows = await tenantPool.query("SELECT COALESCE(SUM(si.quantity * b.purchase_price), 0) AS cost FROM sale_items si JOIN medicine_batches b ON b.id = si.batch_id") as any[];
    const lowRows = await tenantPool.query("SELECT COUNT(*) AS n FROM branch_stock WHERE quantity > 0 AND quantity <= reorder_level") as any[];
    const expRows = await tenantPool.query("SELECT COUNT(*) AS n FROM medicine_batches b WHERE EXISTS (SELECT 1 FROM branch_stock bs WHERE bs.batch_id = b.id AND bs.quantity > 0) AND b.expiry_date >= CURDATE() AND b.expiry_date <= DATE_ADD(CURDATE(), INTERVAL 90 DAY)") as any[];
    const skuRows = await tenantPool.query("SELECT COUNT(*) AS n FROM medicines WHERE active = TRUE") as any[];
    const branchRows = await tenantPool.query("SELECT branch_id AS branchId, COALESCE(SUM(total), 0) AS revenue, COUNT(*) AS orders FROM sales GROUP BY branch_id") as any[];
    const topRows = await tenantPool.query("SELECT m.name AS name, SUM(si.quantity) AS sold, SUM(si.quantity * si.unit_price * (1 - CASE WHEN s.subtotal > 0 THEN s.discount / s.subtotal ELSE 0 END)) AS revenue FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN medicines m ON m.id = si.medicine_id GROUP BY m.id ORDER BY revenue DESC LIMIT 5") as any[];
    const saleAct = await tenantPool.query("SELECT invoice_no AS invoiceNo, total, branch_id AS branchId, created_at AS createdAt FROM sales ORDER BY created_at DESC LIMIT 5") as any[];
    const purAct = await tenantPool.query("SELECT id, subtotal, branch_id AS branchId, status, created_at AS createdAt FROM purchases ORDER BY created_at DESC LIMIT 5") as any[];
    const activity = [...saleAct.map((r: any) => ({ label: `Sale ${r.invoiceNo}`, detail: `Rs ${Number(r.total)} · ${branchName(r.branchId)}`, time: String(r.createdAt), tone: "success" as const })), ...purAct.map((r: any) => ({ label: `Purchase ${r.status}`, detail: `Rs ${Number(r.subtotal)} · ${branchName(r.branchId)}`, time: String(r.createdAt), tone: "info" as const }))].sort((a, b) => b.time.localeCompare(a.time)).slice(0, 10);
    return { revenue, profit: revenue - Number(costRows[0]?.cost ?? 0), lowStock: Number(lowRows[0]?.n ?? 0), expiringSoon: Number(expRows[0]?.n ?? 0), totalSkus: Number(skuRows[0]?.n ?? 0), branchPerformance: branchRows.map((r: any) => ({ name: branchName(r.branchId), revenue: Number(r.revenue), orders: Number(r.orders) })), topProducts: topRows.map((r: any) => ({ name: r.name, units: Number(r.sold), revenue: Number(r.revenue) })), activity };
  }
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
    await this.ensureInventoryTables(tenantPool); await this.ensurePhase4Slice3Tables(tenantPool);
    const q = `%${search.trim()}%`;
    const rows = await tenantPool.query("SELECT m.id, m.sku, m.barcode, m.name, m.generic_salt AS genericSalt, m.strength, m.dosage_form AS dosageForm, m.category, m.active, COALESCE(m.is_controlled, FALSE) AS isControlled, COALESCE(SUM(bs.quantity), 0) AS totalStock FROM medicines m LEFT JOIN medicine_batches b ON b.medicine_id = m.id LEFT JOIN branch_stock bs ON bs.batch_id = b.id WHERE (? = '%%' OR m.name LIKE ? OR m.sku LIKE ? OR m.barcode LIKE ?) GROUP BY m.id ORDER BY m.name", [q, q, q, q]) as any[];
    return rows.map((r: any) => ({ id: r.id, sku: r.sku, barcode: r.barcode, name: r.name, genericSalt: r.genericSalt, strength: r.strength, dosageForm: r.dosageForm, category: r.category, active: Boolean(r.active), isControlled: Boolean(r.isControlled), totalStock: Number(r.totalStock) }));
  }
  async createMedicine(tenantId: string, userId: string, input: { sku: string; barcode?: string | null; name: string; genericSalt?: string | null; strength?: string | null; dosageForm?: string | null; category?: string | null; isControlled?: boolean }) {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensureInventoryTables(tenantPool);
    const id = randomId("medicine");
    try {
      await this.ensurePhase4Slice3Tables(tenantPool);
      await tenantPool.query("INSERT INTO medicines (id, sku, barcode, name, generic_salt, strength, dosage_form, category, active, is_controlled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?)", [id, input.sku, input.barcode ?? null, input.name, input.genericSalt ?? null, input.strength ?? null, input.dosageForm ?? null, input.category ?? null, (input as any).isControlled ? 1 : 0]);
    } catch (error: any) {
      if (String(error?.code) === "ER_DUP_ENTRY") {
        const msg = String(error?.message ?? "");
        if (msg.includes("barcode")) throw new Error("BARCODE_ALREADY_EXISTS");
        throw new Error("SKU_ALREADY_EXISTS");
      }
      throw error;
    }
    await tenantPool.query("INSERT INTO audit_logs (actor_id, action, entity, entity_id, after_json) VALUES (?, 'medicine.create', 'medicine', ?, ?)", [userId, id, JSON.stringify(input)]);
    return { id, sku: input.sku, barcode: input.barcode ?? null, name: input.name, genericSalt: input.genericSalt ?? null, strength: input.strength ?? null, dosageForm: input.dosageForm ?? null, category: input.category ?? null, active: true, isControlled: (input as any).isControlled ?? false, totalStock: 0 };
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
  async setMedicineControlled(tenantId: string, _userId: string, medicineId: string, controlled: boolean) {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensurePhase4Slice3Tables(tenantPool);
    const result = await tenantPool.query("UPDATE medicines SET is_controlled = ? WHERE id = ?", [controlled ? 1 : 0, medicineId]) as { affectedRows?: number };
    if (!result.affectedRows) return undefined;
    const rows = await tenantPool.query("SELECT m.id, m.sku, m.barcode, m.name, m.generic_salt AS genericSalt, m.strength, m.dosage_form AS dosageForm, m.category, m.active, COALESCE(m.is_controlled, FALSE) AS isControlled, COALESCE(SUM(bs.quantity), 0) AS totalStock FROM medicines m LEFT JOIN medicine_batches b ON b.medicine_id = m.id LEFT JOIN branch_stock bs ON bs.batch_id = b.id WHERE m.id = ? GROUP BY m.id", [medicineId]) as any[];
    const r = rows[0]; if (!r) return undefined;
    return { id: r.id, sku: r.sku, barcode: r.barcode, name: r.name, genericSalt: r.genericSalt, strength: r.strength, dosageForm: r.dosageForm, category: r.category, active: Boolean(r.active), isControlled: Boolean(r.isControlled), totalStock: Number(r.totalStock) };
  }
  private async loadPrescription(tenantPool: any, prescriptionId: string): Promise<PrescriptionRecord | undefined> {
    const rows = await tenantPool.query("SELECT id, patient_name AS patientName, doctor_name AS doctorName, branch_id AS branchId, status, created_at AS createdAt FROM prescriptions WHERE id = ? LIMIT 1", [prescriptionId]) as any[];
    const r = rows[0]; if (!r) return undefined;
    const items = await tenantPool.query("SELECT medicine_id AS medicineId, quantity, dosage, instructions FROM prescription_items WHERE prescription_id = ?", [prescriptionId]) as any[];
    return { id: r.id, patientName: r.patientName, doctorName: r.doctorName, branchId: r.branchId, status: r.status, items: items.map((i: any) => ({ medicineId: i.medicineId, quantity: Number(i.quantity), dosage: i.dosage, instructions: i.instructions })), createdAt: String(r.createdAt) };
  }
  async createPrescription(tenantId: string, userId: string, input: { patientName: string; doctorName: string; branchId: string; items: PrescriptionItemInput[] }) {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensurePhase4Slice3Tables(tenantPool);
    if (!input.patientName?.trim() || !input.doctorName?.trim() || !input.items.length) throw new Error("INVALID_ITEMS");
    for (const item of input.items) {
      const med = await tenantPool.query("SELECT active FROM medicines WHERE id = ? LIMIT 1", [item.medicineId]) as any[];
      if (!med.length || !med[0].active) throw new Error("MEDICINE_NOT_FOUND");
      if (!(item.quantity > 0)) throw new Error("INVALID_ITEMS");
    }
    const id = randomId("prescription");
    await tenantPool.query("INSERT INTO prescriptions (id, patient_name, doctor_name, branch_id, status, created_by) VALUES (?, ?, ?, ?, 'pending', ?)", [id, input.patientName, input.doctorName, input.branchId, userId]);
    for (const item of input.items) await tenantPool.query("INSERT INTO prescription_items (prescription_id, medicine_id, quantity, dosage, instructions) VALUES (?, ?, ?, ?, ?)", [id, item.medicineId, item.quantity, item.dosage ?? null, item.instructions ?? null]);
    return (await this.loadPrescription(tenantPool, id))!;
  }
  async listPrescriptions(tenantId: string) {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensurePhase4Slice3Tables(tenantPool);
    const rows = await tenantPool.query("SELECT id FROM prescriptions ORDER BY created_at DESC LIMIT 200") as any[];
    const out: PrescriptionRecord[] = [];
    for (const r of rows) { const rx = await this.loadPrescription(tenantPool, r.id); if (rx) out.push(rx); }
    return out;
  }
  async dispensePrescription(tenantId: string, userId: string, prescriptionId: string) {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensureInventoryTables(tenantPool); await this.ensurePhase4Slice3Tables(tenantPool);
    const connection = await tenantPool.getConnection();
    try {
      await connection.beginTransaction();
      const rxRows = await connection.query("SELECT id, branch_id AS branchId, status FROM prescriptions WHERE id = ? FOR UPDATE", [prescriptionId]) as any[];
      if (!rxRows.length) throw new Error("PRESCRIPTION_NOT_FOUND");
      if (rxRows[0].status !== "pending") throw new Error("PRESCRIPTION_NOT_PENDING");
      const branchId = rxRows[0].branchId;
      const items = await connection.query("SELECT medicine_id AS medicineId, quantity FROM prescription_items WHERE prescription_id = ?", [prescriptionId]) as any[];
      for (const item of items) {
        const candidates = await connection.query("SELECT b.id, bs.quantity FROM medicine_batches b JOIN branch_stock bs ON bs.batch_id = b.id WHERE b.medicine_id = ? AND bs.branch_id = ? AND bs.quantity > 0 AND b.expiry_date >= CURDATE() ORDER BY b.expiry_date FOR UPDATE", [item.medicineId, branchId]) as any[];
        let remaining = Number(item.quantity);
        for (const c of candidates) { remaining -= Math.min(remaining, Number(c.quantity)); if (remaining <= 0) break; }
        if (remaining > 0) throw new Error("INSUFFICIENT_STOCK");
        let left = Number(item.quantity);
        const controlled = await connection.query("SELECT is_controlled AS isControlled FROM medicines WHERE id = ? LIMIT 1", [item.medicineId]) as any[];
        for (const c of candidates) {
          if (left <= 0) break;
          const take = Math.min(left, Number(c.quantity));
          await connection.query("UPDATE branch_stock SET quantity = quantity - ? WHERE branch_id = ? AND batch_id = ?", [take, branchId, c.id]);
          await connection.query("INSERT INTO stock_movements (movement_uuid, branch_id, batch_id, movement_type, quantity, reference_id, idempotency_key, server_version, created_by) VALUES (?, ?, ?, 'dispense', ?, ?, ?, 0, ?)", [randomId("movement"), branchId, c.id, -take, prescriptionId, `dispense-${prescriptionId}-${c.id}`, userId]);
          if (controlled[0]?.isControlled) await connection.query("INSERT INTO controlled_logs (id, medicine_id, batch_id, branch_id, quantity, prescription_id, action, created_by) VALUES (?, ?, ?, ?, ?, ?, 'dispense', ?)", [randomId("controlled"), item.medicineId, c.id, branchId, take, prescriptionId, userId]);
          left -= take;
        }
      }
      await connection.query("UPDATE prescriptions SET status = 'dispensed' WHERE id = ?", [prescriptionId]);
      await connection.query("INSERT INTO audit_logs (actor_id, action, entity, entity_id, after_json) VALUES (?, 'prescription.dispense', 'prescription', ?, ?)", [userId, prescriptionId, JSON.stringify({ status: "dispensed" })]);
      await connection.commit();
      return (await this.loadPrescription(tenantPool, prescriptionId))!;
    } catch (error) {
      await connection.rollback().catch(() => undefined); throw error;
    } finally { connection.release(); }
  }
  async cancelPrescription(tenantId: string, userId: string, prescriptionId: string) {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensurePhase4Slice3Tables(tenantPool);
    const rx = await this.loadPrescription(tenantPool, prescriptionId);
    if (!rx) throw new Error("PRESCRIPTION_NOT_FOUND");
    if (rx.status !== "pending") throw new Error("PRESCRIPTION_NOT_PENDING");
    await tenantPool.query("UPDATE prescriptions SET status = 'cancelled' WHERE id = ?", [prescriptionId]);
    await tenantPool.query("INSERT INTO audit_logs (actor_id, action, entity, entity_id, after_json) VALUES (?, 'prescription.cancel', 'prescription', ?, ?)", [userId, prescriptionId, JSON.stringify({ status: "cancelled" })]);
    return (await this.loadPrescription(tenantPool, prescriptionId))!;
  }
  async listControlledLogs(tenantId: string) {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensurePhase4Slice3Tables(tenantPool);
    const rows = await tenantPool.query("SELECT id, medicine_id AS medicineId, batch_id AS batchId, branch_id AS branchId, quantity, prescription_id AS prescriptionId, action, created_by AS createdBy, created_at AS createdAt FROM controlled_logs ORDER BY created_at DESC LIMIT 200") as any[];
    return rows.map((r: any) => ({ id: r.id, medicineId: r.medicineId, batchId: r.batchId, branchId: r.branchId, quantity: Number(r.quantity), prescriptionId: r.prescriptionId, action: r.action, createdBy: r.createdBy, createdAt: String(r.createdAt) }));
  }
  private async ensurePhase4Slice4Tables(tenantPool: ReturnType<typeof mariadb.createPool>) {
    await tenantPool.query("CREATE TABLE IF NOT EXISTS attendance (id VARCHAR(96) PRIMARY KEY, user_id VARCHAR(96) NOT NULL, branch_id VARCHAR(96) NOT NULL, attendance_date DATE NOT NULL, check_in TIMESTAMP NULL, check_out TIMESTAMP NULL, hours DECIMAL(6,2) NOT NULL DEFAULT 0, UNIQUE KEY uq_attendance_user_date (user_id, attendance_date), INDEX idx_attendance_date (attendance_date)) ENGINE=InnoDB");
    await tenantPool.query("CREATE TABLE IF NOT EXISTS staff_profiles (user_id VARCHAR(96) PRIMARY KEY, monthly_salary DECIMAL(14,2) NOT NULL DEFAULT 0) ENGINE=InnoDB");
  }
  private async loadAttendance(tenantPool: any, id: string): Promise<AttendanceRecord | undefined> {
    const rows = await tenantPool.query("SELECT id, user_id AS userId, branch_id AS branchId, attendance_date AS date, check_in AS checkIn, check_out AS checkOut, hours FROM attendance WHERE id = ? LIMIT 1", [id]) as any[];
    const r = rows[0]; if (!r) return undefined;
    return { id: r.id, userId: r.userId, branchId: r.branchId, date: String(r.date).slice(0, 10), checkIn: r.checkIn ? String(r.checkIn) : null, checkOut: r.checkOut ? String(r.checkOut) : null, hours: Number(r.hours) };
  }
  async checkIn(tenantId: string, userId: string, branchId: string) {
    const user = await this.getUser(userId);
    if (!user || user.tenantId !== tenantId || !user.active) throw new Error("USER_NOT_FOUND");
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensurePhase4Slice4Tables(tenantPool);
    const id = randomId("attendance");
    try {
      await tenantPool.query("INSERT INTO attendance (id, user_id, branch_id, attendance_date, check_in) VALUES (?, ?, ?, CURDATE(), NOW())", [id, userId, branchId]);
    } catch (e: any) {
      if (String(e?.code) === "ER_DUP_ENTRY") throw new Error("ALREADY_CHECKED_IN");
      throw e;
    }
    return (await this.loadAttendance(tenantPool, id))!;
  }
  async checkOut(tenantId: string, userId: string) {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensurePhase4Slice4Tables(tenantPool);
    const rows = await tenantPool.query("SELECT id, check_in AS checkIn, check_out AS checkOut FROM attendance WHERE user_id = ? AND attendance_date = CURDATE() LIMIT 1", [userId]) as any[];
    if (!rows.length) throw new Error("ATTENDANCE_NOT_FOUND");
    if (rows[0].checkOut) throw new Error("ALREADY_CHECKED_OUT");
    await tenantPool.query("UPDATE attendance SET check_out = NOW(), hours = ROUND(TIMESTAMPDIFF(MINUTE, check_in, NOW()) / 60, 2) WHERE id = ?", [rows[0].id]);
    return (await this.loadAttendance(tenantPool, rows[0].id))!;
  }
  async listAttendance(tenantId: string, filters: { userId?: string; branchId?: string; date?: string }) {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensurePhase4Slice4Tables(tenantPool);
    const where: string[] = []; const params: unknown[] = [];
    if (filters.userId) { where.push("user_id = ?"); params.push(filters.userId); }
    if (filters.branchId) { where.push("branch_id = ?"); params.push(filters.branchId); }
    if (filters.date) { where.push("attendance_date = ?"); params.push(filters.date); }
    const clause = where.length ? " WHERE " + where.join(" AND ") : "";
    const rows = await tenantPool.query(`SELECT id FROM attendance${clause} ORDER BY attendance_date DESC LIMIT 200`, params) as any[];
    const out: AttendanceRecord[] = [];
    for (const r of rows) { const a = await this.loadAttendance(tenantPool, r.id); if (a) out.push(a); }
    return out;
  }
  async setStaffSalary(tenantId: string, userId: string, monthlySalary: number) {
    const user = await this.getUser(userId);
    if (!user || user.tenantId !== tenantId) throw new Error("USER_NOT_FOUND");
    if (!(monthlySalary >= 0)) throw new Error("INVALID_AMOUNT");
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensurePhase4Slice4Tables(tenantPool);
    await tenantPool.query("INSERT INTO staff_profiles (user_id, monthly_salary) VALUES (?, ?) ON DUPLICATE KEY UPDATE monthly_salary = VALUES(monthly_salary)", [userId, monthlySalary]);
    return { userId, monthlySalary };
  }
  async getPayroll(tenantId: string, month: string) {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("INVALID_INPUT");
    const [y, m] = month.split("-").map(Number);
    const daysInMonth = new Date(y, m, 0).getDate();
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensurePhase4Slice4Tables(tenantPool);
    const rows = await tenantPool.query("SELECT a.user_id AS userId, COUNT(*) AS daysPresent, COALESCE(SUM(a.hours), 0) AS totalHours, COALESCE(sp.monthly_salary, 0) AS monthlySalary FROM attendance a LEFT JOIN staff_profiles sp ON sp.user_id = a.user_id WHERE a.check_in IS NOT NULL AND DATE_FORMAT(a.attendance_date, '%Y-%m') = ? GROUP BY a.user_id ORDER BY a.user_id", [month]) as any[];
    return rows.map((r: any) => ({ userId: r.userId, daysPresent: Number(r.daysPresent), totalHours: Number(r.totalHours), monthlySalary: Number(r.monthlySalary), pay: Math.round(Number(r.monthlySalary) * Number(r.daysPresent) / daysInMonth * 100) / 100 }));
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
  private async ensurePhase3Tables(tenantPool: ReturnType<typeof mariadb.createPool>) {
    await tenantPool.query("CREATE TABLE IF NOT EXISTS parties (id VARCHAR(96) PRIMARY KEY, type VARCHAR(20) NOT NULL, name VARCHAR(220) NOT NULL, phone VARCHAR(40) NULL, address VARCHAR(400) NULL, active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_party_type (type)) ENGINE=InnoDB");
    await tenantPool.query("CREATE TABLE IF NOT EXISTS sales (id VARCHAR(96) PRIMARY KEY, invoice_no VARCHAR(64) NOT NULL UNIQUE, branch_id VARCHAR(96) NOT NULL, customer_id VARCHAR(96) NULL, user_id VARCHAR(96) NOT NULL, subtotal DECIMAL(14,2) NOT NULL, discount DECIMAL(14,2) NOT NULL DEFAULT 0, total DECIMAL(14,2) NOT NULL, paid_amount DECIMAL(14,2) NOT NULL DEFAULT 0, balance_due DECIMAL(14,2) NOT NULL DEFAULT 0, payment_type VARCHAR(20) NOT NULL, status VARCHAR(30) NOT NULL DEFAULT 'completed', created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_sale_branch_time (branch_id, created_at)) ENGINE=InnoDB");
    await tenantPool.query("CREATE TABLE IF NOT EXISTS sale_items (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, sale_id VARCHAR(96) NOT NULL, medicine_id VARCHAR(96) NOT NULL, batch_id VARCHAR(96) NOT NULL, batch_no VARCHAR(96) NOT NULL, quantity INT NOT NULL, unit_price DECIMAL(14,2) NOT NULL, returned_quantity INT NOT NULL DEFAULT 0, INDEX idx_sale_item_sale (sale_id)) ENGINE=InnoDB");
    await tenantPool.query("CREATE TABLE IF NOT EXISTS purchases (id VARCHAR(96) PRIMARY KEY, branch_id VARCHAR(96) NOT NULL, supplier_id VARCHAR(96) NOT NULL, user_id VARCHAR(96) NOT NULL, subtotal DECIMAL(14,2) NOT NULL, paid_amount DECIMAL(14,2) NOT NULL DEFAULT 0, balance_due DECIMAL(14,2) NOT NULL DEFAULT 0, status VARCHAR(30) NOT NULL DEFAULT 'pending', created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_purchase_branch_time (branch_id, created_at)) ENGINE=InnoDB");
    await tenantPool.query("CREATE TABLE IF NOT EXISTS purchase_items (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, purchase_id VARCHAR(96) NOT NULL, medicine_id VARCHAR(96) NOT NULL, batch_id VARCHAR(96) NOT NULL, batch_no VARCHAR(96) NOT NULL, expiry_date DATE NOT NULL, quantity INT NOT NULL, purchase_price DECIMAL(14,2) NOT NULL, sale_price DECIMAL(14,2) NOT NULL, INDEX idx_purchase_item_purchase (purchase_id)) ENGINE=InnoDB");
    await tenantPool.query("CREATE TABLE IF NOT EXISTS khata_entries (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, party_id VARCHAR(96) NOT NULL, entry_type VARCHAR(40) NOT NULL, debit DECIMAL(14,2) NOT NULL DEFAULT 0, credit DECIMAL(14,2) NOT NULL DEFAULT 0, reference_id VARCHAR(96) NULL, note VARCHAR(400) NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_khata_party (party_id)) ENGINE=InnoDB");
  }
  private async loadSale(tenantPool: any, saleId: string): Promise<SaleRecord | undefined> {
    const rows = await tenantPool.query("SELECT id, invoice_no AS invoiceNo, branch_id AS branchId, customer_id AS customerId, subtotal, discount, total, paid_amount AS paidAmount, balance_due AS balanceDue, payment_type AS paymentType, status, created_at AS createdAt FROM sales WHERE id = ? LIMIT 1", [saleId]) as any[];
    const row = rows[0]; if (!row) return undefined;
    const items = await tenantPool.query("SELECT medicine_id AS medicineId, batch_id AS batchId, batch_no AS batchNo, quantity, unit_price AS unitPrice, returned_quantity AS returnedQuantity FROM sale_items WHERE sale_id = ? ORDER BY id", [saleId]) as any[];
    return { id: row.id, invoiceNo: row.invoiceNo, branchId: row.branchId, customerId: row.customerId, subtotal: Number(row.subtotal), discount: Number(row.discount), total: Number(row.total), paidAmount: Number(row.paidAmount), balanceDue: Number(row.balanceDue), paymentType: row.paymentType, status: row.status, items: items.map((i: any) => ({ medicineId: i.medicineId, batchId: i.batchId, batchNo: i.batchNo, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice), returnedQuantity: Number(i.returnedQuantity) })), createdAt: String(row.createdAt) };
  }
  private async loadPurchase(tenantPool: any, purchaseId: string): Promise<PurchaseRecord | undefined> {
    const rows = await tenantPool.query("SELECT id, branch_id AS branchId, supplier_id AS supplierId, subtotal, paid_amount AS paidAmount, balance_due AS balanceDue, status, created_at AS createdAt FROM purchases WHERE id = ? LIMIT 1", [purchaseId]) as any[];
    const row = rows[0]; if (!row) return undefined;
    const items = await tenantPool.query("SELECT medicine_id AS medicineId, batch_id AS batchId, batch_no AS batchNo, expiry_date AS expiryDate, quantity, purchase_price AS purchasePrice, sale_price AS salePrice FROM purchase_items WHERE purchase_id = ? ORDER BY id", [purchaseId]) as any[];
    return { id: row.id, branchId: row.branchId, supplierId: row.supplierId, subtotal: Number(row.subtotal), paidAmount: Number(row.paidAmount), balanceDue: Number(row.balanceDue), status: row.status, items: items.map((i: any) => ({ medicineId: i.medicineId, batchId: i.batchId, batchNo: i.batchNo, expiryDate: String(i.expiryDate).slice(0, 10), quantity: Number(i.quantity), purchasePrice: Number(i.purchasePrice), salePrice: Number(i.salePrice) })), createdAt: String(row.createdAt) };
  }
  private async partyBalanceFromPool(tenantPool: any, partyId: string, partyType: string) {
    const rows = await tenantPool.query("SELECT debit, credit FROM khata_entries WHERE party_id = ?", [partyId]) as any[];
    return rows.reduce((sum: number, r: any) => sum + (partyType === "supplier" ? (Number(r.credit) - Number(r.debit)) : (Number(r.debit) - Number(r.credit))), 0);
  }
  async createParty(tenantId: string, input: { type: "customer" | "supplier"; name: string; phone?: string | null; address?: string | null }) {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensurePhase3Tables(tenantPool);
    const id = randomId("party");
    await tenantPool.query("INSERT INTO parties (id, type, name, phone, address, active) VALUES (?, ?, ?, ?, ?, TRUE)", [id, input.type, input.name, input.phone ?? null, input.address ?? null]);
    return { id, type: input.type, name: input.name, phone: input.phone ?? null, address: input.address ?? null, active: true };
  }
  async listParties(tenantId: string, type?: string) {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensurePhase3Tables(tenantPool);
    const rows = type ? await tenantPool.query("SELECT id, type, name, phone, address, active FROM parties WHERE type = ? ORDER BY name", [type]) as any[] : await tenantPool.query("SELECT id, type, name, phone, address, active FROM parties ORDER BY name") as any[];
    return rows.map((r: any) => ({ id: r.id, type: r.type, name: r.name, phone: r.phone, address: r.address, active: Boolean(r.active) }));
  }
  async getPartyBalance(tenantId: string, partyId: string) {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensurePhase3Tables(tenantPool);
    const rows = await tenantPool.query("SELECT id, type, name, phone, address, active FROM parties WHERE id = ? LIMIT 1", [partyId]) as any[];
    const row = rows[0]; if (!row) throw new Error("PARTY_NOT_FOUND");
    const party: PartyRecord = { id: row.id, type: row.type, name: row.name, phone: row.phone, address: row.address, active: Boolean(row.active) };
    const entries = await tenantPool.query("SELECT id, party_id AS partyId, entry_type AS entryType, debit, credit, reference_id AS referenceId, note, created_at AS createdAt FROM khata_entries WHERE party_id = ? ORDER BY id", [partyId]) as any[];
    return { party, balance: await this.partyBalanceFromPool(tenantPool, partyId, party.type), entries: entries.map((e: any) => ({ id: String(e.id), partyId: e.partyId, entryType: e.entryType, debit: Number(e.debit), credit: Number(e.credit), referenceId: e.referenceId, note: e.note, createdAt: String(e.createdAt) })) };
  }
  async payParty(tenantId: string, _userId: string, input: { partyId: string; amount: number; note?: string | null }) {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensurePhase3Tables(tenantPool);
    const rows = await tenantPool.query("SELECT type FROM parties WHERE id = ? LIMIT 1", [input.partyId]) as any[];
    if (!rows.length) throw new Error("PARTY_NOT_FOUND");
    if (!(input.amount > 0)) throw new Error("INVALID_AMOUNT");
    const isSupplier = rows[0].type === "supplier";
    const connection = await tenantPool.getConnection();
    try {
      await connection.beginTransaction();
      const result = await connection.query("INSERT INTO khata_entries (party_id, entry_type, debit, credit, reference_id, note) VALUES (?, 'payment', ?, ?, NULL, ?)", [input.partyId, isSupplier ? input.amount : 0, isSupplier ? 0 : input.amount, input.note ?? null]) as { insertId?: number };
      // FIFO allocation, same rule as memory: sale/purchase balances stay in sync with khata.
      let remaining = input.amount;
      if (!isSupplier) {
        const openSales = await connection.query("SELECT id, balance_due AS balanceDue FROM sales WHERE customer_id = ? AND balance_due > 0 ORDER BY created_at ASC FOR UPDATE", [input.partyId]) as any[];
        for (const sale of openSales) {
          if (remaining <= 0) break;
          const take = Math.min(remaining, Number(sale.balanceDue));
          await connection.query("UPDATE sales SET balance_due = balance_due - ? WHERE id = ?", [take, sale.id]);
          remaining -= take;
        }
      } else {
        const openPurchases = await connection.query("SELECT id, balance_due AS balanceDue FROM purchases WHERE supplier_id = ? AND balance_due > 0 ORDER BY created_at ASC FOR UPDATE", [input.partyId]) as any[];
        for (const pur of openPurchases) {
          if (remaining <= 0) break;
          const take = Math.min(remaining, Number(pur.balanceDue));
          await connection.query("UPDATE purchases SET balance_due = balance_due - ? WHERE id = ?", [take, pur.id]);
          remaining -= take;
        }
      }
      await connection.commit();
      return { id: String(result.insertId ?? ""), partyId: input.partyId, entryType: "payment", debit: isSupplier ? input.amount : 0, credit: isSupplier ? 0 : input.amount, referenceId: null, note: input.note ?? null, createdAt: new Date().toISOString() };
    } catch (error) {
      await connection.rollback().catch(() => undefined); throw error;
    } finally { connection.release(); }
  }
  async createSale(tenantId: string, userId: string, input: { branchId: string; customerId?: string | null; prescriptionId?: string | null; items: Array<{ medicineId: string; quantity: number }>; discount: number; paymentType: "cash" | "credit"; paidAmount: number }) {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensureInventoryTables(tenantPool); await this.ensurePhase3Tables(tenantPool); await this.ensurePhase4Slice3Tables(tenantPool);
    if (!input.items.length) throw new Error("INVALID_ITEMS");
    if (input.paymentType === "credit" && !input.customerId) throw new Error("CUSTOMER_REQUIRED");
    const connection = await tenantPool.getConnection();
    try {
      await connection.beginTransaction();
      if (input.customerId) {
        const cust = await connection.query("SELECT type FROM parties WHERE id = ? LIMIT 1", [input.customerId]) as any[];
        if (!cust.length || cust[0].type !== "customer") throw new Error("PARTY_NOT_FOUND");
      }
      // Slice 3 gate: controlled medicines need a pending prescription for this branch.
      const controlledIds: string[] = [];
      for (const item of input.items) {
        const ctrl = await connection.query("SELECT is_controlled AS isControlled FROM medicines WHERE id = ? LIMIT 1", [item.medicineId]) as any[];
        if (ctrl[0]?.isControlled) controlledIds.push(item.medicineId);
      }
      let gateRx: any;
      if (controlledIds.length) {
        if (!input.prescriptionId) throw new Error("CONTROLLED_PRESCRIPTION_REQUIRED");
        const rxRows = await connection.query("SELECT id, branch_id AS branchId, status FROM prescriptions WHERE id = ? FOR UPDATE", [input.prescriptionId]) as any[];
        if (!rxRows.length) throw new Error("PRESCRIPTION_NOT_FOUND");
        gateRx = rxRows[0];
        if (gateRx.branchId !== input.branchId) throw new Error("PRESCRIPTION_BRANCH_MISMATCH");
        if (gateRx.status !== "pending") throw new Error("PRESCRIPTION_NOT_PENDING");
        const rxItems = await connection.query("SELECT medicine_id AS medicineId, quantity FROM prescription_items WHERE prescription_id = ?", [input.prescriptionId]) as any[];
        for (const item of input.items.filter((i) => controlledIds.includes(i.medicineId))) {
          const rxItem = rxItems.find((r: any) => r.medicineId === item.medicineId);
          if (!rxItem || Number(rxItem.quantity) < item.quantity) throw new Error("PRESCRIPTION_QTY_EXCEEDED");
        }
      }
      const allocations: Array<{ medicineId: string; batchId: string; batchNo: string; quantity: number; unitPrice: number }> = [];
      for (const item of input.items) {
        const med = await connection.query("SELECT active FROM medicines WHERE id = ? LIMIT 1", [item.medicineId]) as any[];
        if (!med.length || !med[0].active) throw new Error("MEDICINE_NOT_FOUND");
        if (!(item.quantity > 0)) throw new Error("INVALID_ITEMS");
        let remaining = item.quantity;
        const candidates = await connection.query("SELECT b.id, b.batch_no AS batchNo, b.sale_price AS salePrice, bs.quantity FROM medicine_batches b JOIN branch_stock bs ON bs.batch_id = b.id WHERE b.medicine_id = ? AND bs.branch_id = ? AND bs.quantity > 0 AND b.expiry_date >= CURDATE() ORDER BY b.expiry_date FOR UPDATE", [item.medicineId, input.branchId]) as any[];
        for (const c of candidates) {
          if (remaining <= 0) break;
          const take = Math.min(remaining, Number(c.quantity));
          allocations.push({ medicineId: item.medicineId, batchId: c.id, batchNo: c.batchNo, quantity: take, unitPrice: Number(c.salePrice) });
          remaining -= take;
        }
        if (remaining > 0) throw new Error("INSUFFICIENT_STOCK");
      }
      const subtotal = allocations.reduce((sum, a) => sum + a.quantity * a.unitPrice, 0);
      if (input.discount < 0 || input.discount > subtotal) throw new Error("INVALID_DISCOUNT");
      const total = subtotal - input.discount;
      if (input.paidAmount < 0 || input.paidAmount > total) throw new Error("PAYMENT_MISMATCH");
      if (input.paymentType === "cash" && input.paidAmount !== total) throw new Error("PAYMENT_MISMATCH");
      const balanceDue = total - input.paidAmount;
      const saleId = randomId("sale");
      const countRows = await connection.query("SELECT COUNT(*) AS n FROM sales") as any[];
      let invoiceNo = "INV-" + String(Number(countRows[0].n) + 1).padStart(6, "0");
      try {
        await connection.query("INSERT INTO sales (id, invoice_no, branch_id, customer_id, user_id, subtotal, discount, total, paid_amount, balance_due, payment_type, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')", [saleId, invoiceNo, input.branchId, input.customerId ?? null, userId, subtotal, input.discount, total, input.paidAmount, balanceDue, input.paymentType]);
      } catch (e: any) {
        if (String(e?.code) === "ER_DUP_ENTRY") {
          invoiceNo = "INV-" + String(Number(countRows[0].n) + 1).padStart(6, "0") + "-" + Math.floor(Math.random() * 9000 + 1000);
          await connection.query("INSERT INTO sales (id, invoice_no, branch_id, customer_id, user_id, subtotal, discount, total, paid_amount, balance_due, payment_type, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed')", [saleId, invoiceNo, input.branchId, input.customerId ?? null, userId, subtotal, input.discount, total, input.paidAmount, balanceDue, input.paymentType]);
        } else throw e;
      }
      for (const a of allocations) {
        await connection.query("INSERT INTO sale_items (sale_id, medicine_id, batch_id, batch_no, quantity, unit_price, returned_quantity) VALUES (?, ?, ?, ?, ?, ?, 0)", [saleId, a.medicineId, a.batchId, a.batchNo, a.quantity, a.unitPrice]);
        await connection.query("UPDATE branch_stock SET quantity = quantity - ? WHERE branch_id = ? AND batch_id = ?", [a.quantity, input.branchId, a.batchId]);
        await connection.query("INSERT INTO stock_movements (movement_uuid, branch_id, batch_id, movement_type, quantity, reference_id, idempotency_key, server_version, created_by) VALUES (?, ?, ?, 'sale', ?, ?, ?, 0, ?)", [randomId("movement"), input.branchId, a.batchId, -a.quantity, saleId, `sale-${saleId}-${a.batchId}`, userId]);
      }
      if (balanceDue > 0 && input.customerId) await connection.query("INSERT INTO khata_entries (party_id, entry_type, debit, credit, reference_id, note) VALUES (?, 'sale_credit', ?, 0, ?, ?)", [input.customerId, balanceDue, saleId, `Sale ${invoiceNo} credit`]);
      if (gateRx) {
        await connection.query("UPDATE prescriptions SET status = 'dispensed' WHERE id = ?", [gateRx.id]);
        for (const a of allocations) {
          if (!controlledIds.includes(a.medicineId)) continue;
          await connection.query("INSERT INTO controlled_logs (id, medicine_id, batch_id, branch_id, quantity, prescription_id, action, created_by) VALUES (?, ?, ?, ?, ?, ?, 'sale', ?)", [randomId("controlled"), a.medicineId, a.batchId, input.branchId, a.quantity, gateRx.id, userId]);
        }
      }
      await connection.query("INSERT INTO audit_logs (actor_id, action, entity, entity_id, after_json) VALUES (?, 'sale.create', 'sale', ?, ?)", [userId, saleId, JSON.stringify({ invoiceNo, total })]);
      await connection.commit();
      return { id: saleId, invoiceNo, branchId: input.branchId, customerId: input.customerId ?? null, subtotal, discount: input.discount, total, paidAmount: input.paidAmount, balanceDue, paymentType: input.paymentType, status: "completed" as const, items: allocations.map((a) => ({ ...a, returnedQuantity: 0 })), createdAt: new Date().toISOString() };
    } catch (error) {
      await connection.rollback().catch(() => undefined); throw error;
    } finally { connection.release(); }
  }
  async getSale(tenantId: string, saleId: string) {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensurePhase3Tables(tenantPool);
    return this.loadSale(tenantPool, saleId);
  }
  async listSales(tenantId: string) {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensurePhase3Tables(tenantPool);
    const rows = await tenantPool.query("SELECT id FROM sales ORDER BY created_at DESC LIMIT 200") as any[];
    const out: SaleRecord[] = [];
    for (const r of rows) { const sale = await this.loadSale(tenantPool, r.id); if (sale) out.push(sale); }
    return out;
  }
  async returnSale(tenantId: string, userId: string, saleId: string, items: Array<{ medicineId: string; batchId: string; quantity: number }>) {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensureInventoryTables(tenantPool); await this.ensurePhase3Tables(tenantPool);
    const connection = await tenantPool.getConnection();
    try {
      await connection.beginTransaction();
      const sale = await this.loadSale(connection, saleId);
      if (!sale) throw new Error("SALE_NOT_FOUND");
      if (sale.status === "returned") throw new Error("ALREADY_RETURNED");
      let refund = 0;
      for (const item of items) {
        const line = sale.items.find((i) => i.medicineId === item.medicineId && i.batchId === item.batchId);
        if (!line) throw new Error("RETURN_ITEM_NOT_FOUND");
        if (!(item.quantity > 0) || item.quantity > line.quantity - line.returnedQuantity) throw new Error("RETURN_EXCEEDS_SOLD");
        const discountRatio = sale.subtotal > 0 ? sale.discount / sale.subtotal : 0;
        refund += item.quantity * line.unitPrice * (1 - discountRatio);
      }
      refund = Math.round(refund * 100) / 100;
      for (const item of items) {
        const line = sale.items.find((i) => i.medicineId === item.medicineId && i.batchId === item.batchId)!;
        await connection.query("UPDATE sale_items SET returned_quantity = returned_quantity + ? WHERE sale_id = ? AND medicine_id = ? AND batch_id = ?", [item.quantity, saleId, item.medicineId, item.batchId]);
        await connection.query("INSERT INTO branch_stock (branch_id, batch_id, quantity, reserved_quantity, reorder_level) VALUES (?, ?, ?, 0, 0) ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)", [sale.branchId, item.batchId, item.quantity]);
        await connection.query("INSERT INTO stock_movements (movement_uuid, branch_id, batch_id, movement_type, quantity, reference_id, idempotency_key, server_version, created_by) VALUES (?, ?, ?, 'return', ?, ?, ?, 0, ?)", [randomId("movement"), sale.branchId, item.batchId, item.quantity, saleId, `return-${saleId}-${item.batchId}-${line.returnedQuantity + item.quantity}`, userId]);
        line.returnedQuantity += item.quantity;
      }
      let creditApplied = 0;
      if (sale.customerId && refund > 0) {
        const partyRows = await connection.query("SELECT type FROM parties WHERE id = ? LIMIT 1", [sale.customerId]) as any[];
        if (partyRows.length) {
          const balance = await this.partyBalanceFromPool(connection, sale.customerId, partyRows[0].type);
          creditApplied = Math.min(refund, Math.max(0, balance));
          if (creditApplied > 0) await connection.query("INSERT INTO khata_entries (party_id, entry_type, debit, credit, reference_id, note) VALUES (?, 'sale_return', 0, ?, ?, ?)", [sale.customerId, creditApplied, saleId, `Return on ${sale.invoiceNo}`]);
        }
      }
      const newBalance = Math.max(0, sale.balanceDue - creditApplied);
      const newStatus = sale.items.every((i) => i.returnedQuantity >= i.quantity) ? "returned" : "partially_returned";
      await connection.query("UPDATE sales SET balance_due = ?, status = ? WHERE id = ?", [newBalance, newStatus, saleId]);
      await connection.query("INSERT INTO audit_logs (actor_id, action, entity, entity_id, after_json) VALUES (?, 'sale.return', 'sale', ?, ?)", [userId, saleId, JSON.stringify({ refund, creditApplied })]);
      await connection.commit();
      const updated = await this.loadSale(tenantPool, saleId);
      return updated!;
    } catch (error) {
      await connection.rollback().catch(() => undefined); throw error;
    } finally { connection.release(); }
  }
  private async applyPurchaseInTransaction(connection: any, tenantPool: any, userId: string, purchase: PurchaseRecord) {
    for (const item of purchase.items) {
      const existing = await connection.query("SELECT id, sale_price AS salePrice FROM medicine_batches WHERE medicine_id = ? AND batch_no = ? LIMIT 1", [item.medicineId, item.batchNo]) as any[];
      let batchId = existing[0]?.id;
      if (!batchId) {
        batchId = randomId("batch");
        await connection.query("INSERT INTO medicine_batches (id, medicine_id, batch_no, expiry_date, purchase_price, sale_price) VALUES (?, ?, ?, ?, ?, ?)", [batchId, item.medicineId, item.batchNo, item.expiryDate, item.purchasePrice, item.salePrice]);
      }
      item.batchId = batchId;
      await connection.query("INSERT INTO branch_stock (branch_id, batch_id, quantity, reserved_quantity, reorder_level) VALUES (?, ?, ?, 0, 0) ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)", [purchase.branchId, batchId, item.quantity]);
      await connection.query("INSERT INTO stock_movements (movement_uuid, branch_id, batch_id, movement_type, quantity, reference_id, idempotency_key, server_version, created_by) VALUES (?, ?, ?, 'purchase', ?, ?, ?, 0, ?)", [randomId("movement"), purchase.branchId, batchId, item.quantity, purchase.id, `purchase-${purchase.id}-${batchId}`, userId]);
      await connection.query("UPDATE purchase_items SET batch_id = ? WHERE purchase_id = ? AND medicine_id = ? AND batch_no = ?", [batchId, purchase.id, item.medicineId, item.batchNo]);
    }
    if (purchase.balanceDue > 0) await connection.query("INSERT INTO khata_entries (party_id, entry_type, debit, credit, reference_id, note) VALUES (?, 'purchase_payable', 0, ?, ?, 'Purchase payable')", [purchase.supplierId, purchase.balanceDue, purchase.id]);
  }
  async createPurchase(tenantId: string, userId: string, input: { branchId: string; supplierId: string; items: Array<{ medicineId: string; batchNo: string; expiryDate: string; purchasePrice: number; salePrice: number; quantity: number }>; paidAmount: number; approved: boolean }) {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensureInventoryTables(tenantPool); await this.ensurePhase3Tables(tenantPool);
    if (!input.items.length) throw new Error("INVALID_ITEMS");
    const supplier = await tenantPool.query("SELECT type FROM parties WHERE id = ? LIMIT 1", [input.supplierId]) as any[];
    if (!supplier.length || supplier[0].type !== "supplier") throw new Error("PARTY_NOT_FOUND");
    for (const item of input.items) {
      const med = await tenantPool.query("SELECT id FROM medicines WHERE id = ? LIMIT 1", [item.medicineId]) as any[];
      if (!med.length) throw new Error("MEDICINE_NOT_FOUND");
      if (!(item.quantity > 0) || item.purchasePrice < 0 || item.salePrice < 0) throw new Error("INVALID_ITEMS");
    }
    const subtotal = input.items.reduce((sum, i) => sum + i.quantity * i.purchasePrice, 0);
    if (input.paidAmount < 0 || input.paidAmount > subtotal) throw new Error("PAYMENT_MISMATCH");
    const balanceDue = subtotal - input.paidAmount;
    const purchaseId = randomId("purchase");
    const purchase: PurchaseRecord = { id: purchaseId, branchId: input.branchId, supplierId: input.supplierId, subtotal, paidAmount: input.paidAmount, balanceDue, status: input.approved ? "approved" : "pending", items: input.items.map((i) => ({ medicineId: i.medicineId, batchId: "", batchNo: i.batchNo, expiryDate: i.expiryDate, quantity: i.quantity, purchasePrice: i.purchasePrice, salePrice: i.salePrice })), createdAt: new Date().toISOString() };
    const connection = await tenantPool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query("INSERT INTO purchases (id, branch_id, supplier_id, user_id, subtotal, paid_amount, balance_due, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [purchaseId, input.branchId, input.supplierId, userId, subtotal, input.paidAmount, balanceDue, purchase.status]);
      for (const item of purchase.items) await connection.query("INSERT INTO purchase_items (purchase_id, medicine_id, batch_id, batch_no, expiry_date, quantity, purchase_price, sale_price) VALUES (?, ?, '', ?, ?, ?, ?, ?)", [purchaseId, item.medicineId, item.batchNo, item.expiryDate, item.quantity, item.purchasePrice, item.salePrice]);
      if (input.approved) await this.applyPurchaseInTransaction(connection, tenantPool, userId, purchase);
      await connection.query("INSERT INTO audit_logs (actor_id, action, entity, entity_id, after_json) VALUES (?, 'purchase.create', 'purchase', ?, ?)", [userId, purchaseId, JSON.stringify({ subtotal, status: purchase.status })]);
      await connection.commit();
      return purchase;
    } catch (error) {
      await connection.rollback().catch(() => undefined); throw error;
    } finally { connection.release(); }
  }
  async listPurchases(tenantId: string) {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensurePhase3Tables(tenantPool);
    const rows = await tenantPool.query("SELECT id FROM purchases ORDER BY created_at DESC LIMIT 200") as any[];
    const out: PurchaseRecord[] = [];
    for (const r of rows) { const pur = await this.loadPurchase(tenantPool, r.id); if (pur) out.push(pur); }
    return out;
  }
  async approvePurchase(tenantId: string, userId: string, purchaseId: string) {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensureInventoryTables(tenantPool); await this.ensurePhase3Tables(tenantPool);
    const connection = await tenantPool.getConnection();
    try {
      await connection.beginTransaction();
      const purchase = await this.loadPurchase(connection, purchaseId);
      if (!purchase) throw new Error("PURCHASE_NOT_FOUND");
      if (purchase.status === "approved") throw new Error("ALREADY_APPROVED");
      await this.applyPurchaseInTransaction(connection, tenantPool, userId, purchase);
      await connection.query("UPDATE purchases SET status = 'approved' WHERE id = ?", [purchaseId]);
      await connection.query("INSERT INTO audit_logs (actor_id, action, entity, entity_id, after_json) VALUES (?, 'purchase.approve', 'purchase', ?, ?)", [userId, purchaseId, JSON.stringify({ status: "approved" })]);
      await connection.commit();
      const updated = await this.loadPurchase(tenantPool, purchaseId);
      return updated!;
    } catch (error) {
      await connection.rollback().catch(() => undefined); throw error;
    } finally { connection.release(); }
  }
  private async ensurePhase4Slice3Tables(tenantPool: ReturnType<typeof mariadb.createPool>) {
    const col = await tenantPool.query("SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'medicines' AND COLUMN_NAME = 'is_controlled'") as any[];
    if (!Number(col[0]?.n ?? 0)) await tenantPool.query("ALTER TABLE medicines ADD COLUMN is_controlled BOOLEAN NOT NULL DEFAULT FALSE");
    await tenantPool.query("CREATE TABLE IF NOT EXISTS prescriptions (id VARCHAR(96) PRIMARY KEY, patient_name VARCHAR(220) NOT NULL, doctor_name VARCHAR(220) NOT NULL, branch_id VARCHAR(96) NOT NULL, status VARCHAR(30) NOT NULL DEFAULT 'pending', created_by VARCHAR(96) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_rx_status (status)) ENGINE=InnoDB");
    await tenantPool.query("CREATE TABLE IF NOT EXISTS prescription_items (prescription_id VARCHAR(96) NOT NULL, medicine_id VARCHAR(96) NOT NULL, quantity INT NOT NULL, dosage VARCHAR(120) NULL, instructions VARCHAR(300) NULL, PRIMARY KEY (prescription_id, medicine_id)) ENGINE=InnoDB");
    await tenantPool.query("CREATE TABLE IF NOT EXISTS controlled_logs (id VARCHAR(96) PRIMARY KEY, medicine_id VARCHAR(96) NOT NULL, batch_id VARCHAR(96) NOT NULL, branch_id VARCHAR(96) NOT NULL, quantity INT NOT NULL, prescription_id VARCHAR(96) NULL, action VARCHAR(30) NOT NULL, created_by VARCHAR(96) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_controlled_medicine (medicine_id)) ENGINE=InnoDB");
  }
  private async ensurePhase4Tables(tenantPool: ReturnType<typeof mariadb.createPool>) {
    await tenantPool.query("CREATE TABLE IF NOT EXISTS transfers (id VARCHAR(96) PRIMARY KEY, medicine_id VARCHAR(96) NOT NULL, batch_id VARCHAR(96) NOT NULL, batch_no VARCHAR(96) NOT NULL, from_branch_id VARCHAR(96) NOT NULL, to_branch_id VARCHAR(96) NOT NULL, quantity INT NOT NULL, status VARCHAR(30) NOT NULL DEFAULT 'pending', created_by VARCHAR(96) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_transfer_status (status)) ENGINE=InnoDB");
  }
  // Phase 4 slice 5 — MariaDB online store + master feature flags.
  // Master control rule (user order): /server only ever controls tenants
  // (list, create, per-tenant feature toggles). It never reads tenant
  // business data — orders, sales and inventory stay inside the tenant's
  // own database and are visible only to that tenant's owner and staff.
  // Feature flags are one flag per function per tenant, stored as JSON on
  // the master tenants row; today only "online_store" exists, more flags
  // reuse this same mechanism when the user sets controls later. Default
  // is ON, so existing tenants lose nothing when this ships.
  private async ensurePhase4Slice5Tables(tenantPool: ReturnType<typeof mariadb.createPool>) {
    await tenantPool.query("CREATE TABLE IF NOT EXISTS online_orders (id VARCHAR(96) PRIMARY KEY, order_no VARCHAR(64) NOT NULL UNIQUE, branch_id VARCHAR(96) NOT NULL, customer_name VARCHAR(220) NOT NULL, customer_phone VARCHAR(60) NOT NULL, address VARCHAR(400) NULL, status VARCHAR(30) NOT NULL DEFAULT 'pending', total DECIMAL(14,2) NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_online_order_status (status)) ENGINE=InnoDB");
    await tenantPool.query("CREATE TABLE IF NOT EXISTS online_order_items (order_id VARCHAR(96) NOT NULL, medicine_id VARCHAR(96) NOT NULL, medicine_name VARCHAR(220) NOT NULL, quantity INT NOT NULL, unit_price DECIMAL(14,2) NOT NULL, PRIMARY KEY (order_id, medicine_id)) ENGINE=InnoDB");
  }
  private async ensureTenantFeatureColumn() {
    const col = await this.pool.query("SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tenants' AND COLUMN_NAME = 'feature_flags_json'") as any[];
    if (!Number(col[0]?.n ?? 0)) await this.pool.query("ALTER TABLE tenants ADD COLUMN feature_flags_json JSON NULL");
  }
  private parseTenantFeatures(raw: unknown): { onlineStore: boolean } {
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (parsed && typeof parsed === "object" && "onlineStore" in parsed) return { onlineStore: (parsed as any).onlineStore !== false };
    } catch { /* fall through to default ON */ }
    return { onlineStore: true };
  }
  async getTenantFeatures(tenantId: string) {
    await this.ensureTenantFeatureColumn();
    const rows = await this.pool.query("SELECT feature_flags_json AS featureFlags FROM tenants WHERE id = ? LIMIT 1", [tenantId]) as any[];
    if (!rows.length) throw new Error("TENANT_NOT_FOUND");
    return this.parseTenantFeatures(rows[0].featureFlags);
  }
  async setTenantFeature(tenantId: string, feature: string, enabled: boolean) {
    if (feature !== "online_store") throw new Error("FEATURE_NOT_SUPPORTED");
    await this.ensureTenantFeatureColumn();
    const rows = await this.pool.query("SELECT id FROM tenants WHERE id = ? LIMIT 1", [tenantId]) as any[];
    if (!rows.length) throw new Error("TENANT_NOT_FOUND");
    await this.pool.query("UPDATE tenants SET feature_flags_json = ? WHERE id = ?", [JSON.stringify({ onlineStore: enabled }), tenantId]);
    await this.pool.query("INSERT INTO master_audit_logs (actor_id, action, tenant_id, metadata_json) VALUES (?, 'tenant.feature', ?, ?)", ["master", tenantId, JSON.stringify({ feature, enabled })]);
    return { onlineStore: enabled };
  }
  async getPublicStore(tenantId: string) {
    const tenant = await this.getTenant(tenantId);
    if (!tenant) throw new Error("TENANT_NOT_FOUND");
    return { id: tenant.id, name: tenant.name, plan: tenant.plan, status: tenant.status, branches: tenant.branches, onlineStoreEnabled: (await this.getTenantFeatures(tenantId)).onlineStore };
  }
  async getPublicStoreProducts(tenantId: string, branchId: string) {
    const tenant = await this.getTenant(tenantId);
    if (!tenant) throw new Error("TENANT_NOT_FOUND");
    if (!tenant.branches.some((b: any) => b.id === branchId)) throw new Error("BRANCH_NOT_FOUND");
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensureInventoryTables(tenantPool); await this.ensurePhase4Slice3Tables(tenantPool);
    const rows = await tenantPool.query("SELECT m.id AS medicineId, m.name, m.strength, m.dosage_form AS dosageForm, b.sale_price AS salePrice, b.expiry_date AS expiryDate, bs.quantity FROM medicines m JOIN medicine_batches b ON b.medicine_id = m.id JOIN branch_stock bs ON bs.batch_id = b.id WHERE m.active = TRUE AND COALESCE(m.is_controlled, FALSE) = FALSE AND bs.branch_id = ? AND bs.quantity > 0 AND b.expiry_date >= CURDATE() ORDER BY m.name, b.expiry_date", [branchId]) as any[];
    const byMedicine = new Map<string, PublicStoreProduct>();
    for (const r of rows) {
      const existing = byMedicine.get(r.medicineId);
      if (existing) { existing.available += Number(r.quantity); continue; }
      byMedicine.set(r.medicineId, { medicineId: r.medicineId, name: r.name, strength: r.strength, dosageForm: r.dosageForm, unitPrice: Number(r.salePrice), available: Number(r.quantity) });
    }
    return [...byMedicine.values()];
  }
  private async loadOnlineOrder(poolOrConn: any, orderId: string): Promise<OnlineOrderRecord | undefined> {
    const rows = await poolOrConn.query("SELECT id, order_no AS orderNo, branch_id AS branchId, customer_name AS customerName, customer_phone AS customerPhone, address, status, total, created_at AS createdAt FROM online_orders WHERE id = ? LIMIT 1", [orderId]) as any[];
    const r = rows[0]; if (!r) return undefined;
    const itemRows = await poolOrConn.query("SELECT medicine_id AS medicineId, medicine_name AS medicineName, quantity, unit_price AS unitPrice FROM online_order_items WHERE order_id = ?", [orderId]) as any[];
    return { id: r.id, orderNo: r.orderNo, branchId: r.branchId, customerName: r.customerName, customerPhone: r.customerPhone, address: r.address, status: r.status, total: Number(r.total), items: itemRows.map((i: any) => ({ medicineId: i.medicineId, medicineName: i.medicineName, quantity: Number(i.quantity), unitPrice: Number(i.unitPrice) })), createdAt: String(r.createdAt) };
  }
  async createOnlineOrder(tenantId: string, input: OnlineOrderInput) {
    const tenant = await this.getTenant(tenantId);
    if (!tenant) throw new Error("TENANT_NOT_FOUND");
    if (!tenant.branches.some((b: any) => b.id === input.branchId)) throw new Error("BRANCH_NOT_FOUND");
    if (!input.items.length) throw new Error("INVALID_ITEMS");
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensureInventoryTables(tenantPool); await this.ensurePhase4Slice3Tables(tenantPool); await this.ensurePhase4Slice5Tables(tenantPool);
    const merged = new Map<string, number>();
    for (const item of input.items) {
      if (!(item.quantity > 0)) throw new Error("INVALID_ITEMS");
      merged.set(item.medicineId, (merged.get(item.medicineId) ?? 0) + item.quantity);
    }
    const items: OnlineOrderItemRecord[] = [];
    for (const [medicineId, quantity] of merged) {
      const medRows = await tenantPool.query("SELECT id, name, active, COALESCE(is_controlled, FALSE) AS isControlled FROM medicines WHERE id = ? LIMIT 1", [medicineId]) as any[];
      const med = medRows[0];
      if (!med || !med.active || med.isControlled) throw new Error("MEDICINE_NOT_FOUND");
      const batchRows = await tenantPool.query("SELECT b.sale_price AS salePrice, bs.quantity FROM medicine_batches b JOIN branch_stock bs ON bs.batch_id = b.id WHERE b.medicine_id = ? AND bs.branch_id = ? AND bs.quantity > 0 AND b.expiry_date >= CURDATE() ORDER BY b.expiry_date", [medicineId, input.branchId]) as any[];
      const available = batchRows.reduce((sum: number, r: any) => sum + Number(r.quantity), 0);
      if (!batchRows.length || available < quantity) throw new Error("INSUFFICIENT_STOCK");
      items.push({ medicineId, medicineName: med.name, quantity, unitPrice: Number(batchRows[0].salePrice) });
    }
    const total = items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0);
    const orderId = randomId("order");
    const countRows = await tenantPool.query("SELECT COUNT(*) AS n FROM online_orders") as any[];
    let orderNo = "ORD-" + String(Number(countRows[0]?.n ?? 0) + 1).padStart(6, "0");
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await tenantPool.query("INSERT INTO online_orders (id, order_no, branch_id, customer_name, customer_phone, address, status, total) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?)", [orderId, orderNo, input.branchId, input.customerName, input.customerPhone, input.address ?? null, total]);
        break;
      } catch (e: any) {
        if (String(e?.code) === "ER_DUP_ENTRY" && attempt < 2) { orderNo = "ORD-" + String(Number(countRows[0]?.n ?? 0) + 2 + attempt).padStart(6, "0"); continue; }
        throw e;
      }
    }
    for (const item of items) await tenantPool.query("INSERT INTO online_order_items (order_id, medicine_id, medicine_name, quantity, unit_price) VALUES (?, ?, ?, ?, ?)", [orderId, item.medicineId, item.medicineName, item.quantity, item.unitPrice]);
    return (await this.loadOnlineOrder(tenantPool, orderId))!;
  }
  async listOnlineOrders(tenantId: string) {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensurePhase4Slice5Tables(tenantPool);
    const rows = await tenantPool.query("SELECT id FROM online_orders ORDER BY created_at DESC LIMIT 200") as any[];
    const out: OnlineOrderRecord[] = [];
    for (const r of rows) { const o = await this.loadOnlineOrder(tenantPool, r.id); if (o) out.push(o); }
    return out;
  }
  async getOnlineOrder(tenantId: string, orderId: string) {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensurePhase4Slice5Tables(tenantPool);
    return this.loadOnlineOrder(tenantPool, orderId);
  }
  async confirmOnlineOrder(tenantId: string, userId: string, orderId: string) {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensureInventoryTables(tenantPool); await this.ensurePhase4Slice5Tables(tenantPool);
    const connection = await tenantPool.getConnection();
    try {
      await connection.beginTransaction();
      const order = await this.loadOnlineOrder(connection, orderId);
      if (!order) throw new Error("ORDER_NOT_FOUND");
      if (order.status !== "pending") throw new Error("ORDER_NOT_PENDING");
      for (const item of order.items) {
        let remaining = item.quantity;
        const batchRows = await connection.query("SELECT b.id AS batchId, bs.quantity FROM medicine_batches b JOIN branch_stock bs ON bs.batch_id = b.id WHERE b.medicine_id = ? AND bs.branch_id = ? AND bs.quantity > 0 AND b.expiry_date >= CURDATE() ORDER BY b.expiry_date FOR UPDATE", [item.medicineId, order.branchId]) as any[];
        for (const batch of batchRows) {
          if (remaining <= 0) break;
          const take = Math.min(remaining, Number(batch.quantity));
          await connection.query("UPDATE branch_stock SET quantity = quantity - ? WHERE branch_id = ? AND batch_id = ?", [take, order.branchId, batch.batchId]);
          await connection.query("INSERT INTO stock_movements (movement_uuid, branch_id, batch_id, movement_type, quantity, reference_id, idempotency_key, server_version, created_by) VALUES (?, ?, ?, 'online_order', ?, ?, ?, 0, ?)", [randomId("movement"), order.branchId, batch.batchId, -take, orderId, `online-order-${orderId}-${batch.batchId}`, userId]);
          remaining -= take;
        }
        if (remaining > 0) throw new Error("INSUFFICIENT_STOCK");
      }
      await connection.query("UPDATE online_orders SET status = 'confirmed' WHERE id = ?", [orderId]);
      await connection.query("INSERT INTO audit_logs (actor_id, action, entity, entity_id, after_json) VALUES (?, 'online_order.confirm', 'online_order', ?, ?)", [userId, orderId, JSON.stringify({ status: "confirmed" })]);
      await connection.commit();
      return (await this.loadOnlineOrder(tenantPool, orderId))!;
    } catch (error) {
      await connection.rollback().catch(() => undefined); throw error;
    } finally { connection.release(); }
  }
  async rejectOnlineOrder(tenantId: string, userId: string, orderId: string) {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensurePhase4Slice5Tables(tenantPool);
    const order = await this.loadOnlineOrder(tenantPool, orderId);
    if (!order) throw new Error("ORDER_NOT_FOUND");
    if (order.status !== "pending") throw new Error("ORDER_NOT_PENDING");
    await tenantPool.query("UPDATE online_orders SET status = 'rejected' WHERE id = ?", [orderId]);
    await tenantPool.query("INSERT INTO audit_logs (actor_id, action, entity, entity_id, after_json) VALUES (?, 'online_order.reject', 'online_order', ?, ?)", [userId, orderId, JSON.stringify({ status: "rejected" })]);
    return (await this.loadOnlineOrder(tenantPool, orderId))!;
  }
  async deliverOnlineOrder(tenantId: string, userId: string, orderId: string) {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensurePhase4Slice5Tables(tenantPool);
    const order = await this.loadOnlineOrder(tenantPool, orderId);
    if (!order) throw new Error("ORDER_NOT_FOUND");
    if (order.status !== "confirmed") throw new Error("ORDER_NOT_CONFIRMED");
    await tenantPool.query("UPDATE online_orders SET status = 'delivered' WHERE id = ?", [orderId]);
    await tenantPool.query("INSERT INTO audit_logs (actor_id, action, entity, entity_id, after_json) VALUES (?, 'online_order.deliver', 'online_order', ?, ?)", [userId, orderId, JSON.stringify({ status: "delivered" })]);
    return (await this.loadOnlineOrder(tenantPool, orderId))!;
  }
  async getSalesReport(tenantId: string, filters: { from?: string; to?: string; branchId?: string }): Promise<SalesReport> {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensureInventoryTables(tenantPool); await this.ensurePhase3Tables(tenantPool);
    const where: string[] = [];
    const params: unknown[] = [];
    if (filters.from) { where.push("DATE(created_at) >= ?"); params.push(filters.from); }
    if (filters.to) { where.push("DATE(created_at) <= ?"); params.push(filters.to); }
    if (filters.branchId) { where.push("branch_id = ?"); params.push(filters.branchId); }
    const clause = where.length ? " WHERE " + where.join(" AND ") : "";
    const salesRows = await tenantPool.query(`SELECT COALESCE(SUM(total), 0) AS totalSales, COUNT(*) AS salesCount FROM sales${clause}`, params) as any[];
    const purClause = where.length ? clause + " AND status = 'approved'" : " WHERE status = 'approved'";
    const purRows = await tenantPool.query(`SELECT COALESCE(SUM(subtotal), 0) AS totalPurchases, COUNT(*) AS purchaseCount FROM purchases${purClause}`, params) as any[];
    const costRows = await tenantPool.query("SELECT COALESCE(SUM(si.quantity * b.purchase_price), 0) AS cost FROM sale_items si JOIN medicine_batches b ON b.id = si.batch_id JOIN sales s ON s.id = si.sale_id" + (where.length ? " WHERE " + where.map((w) => w.replace("created_at", "s.created_at").replace("branch_id", "s.branch_id")).join(" AND ") : ""), params) as any[];
    const branchRows = await tenantPool.query(`SELECT branch_id AS branchId, COALESCE(SUM(total), 0) AS sales, COUNT(*) AS orders FROM sales${clause} GROUP BY branch_id`, params) as any[];
    const topRows = await tenantPool.query("SELECT m.name AS name, SUM(si.quantity) AS units, SUM(si.quantity * si.unit_price * (1 - CASE WHEN s.subtotal > 0 THEN s.discount / s.subtotal ELSE 0 END)) AS revenue FROM sale_items si JOIN sales s ON s.id = si.sale_id JOIN medicines m ON m.id = si.medicine_id" + (where.length ? " WHERE " + where.map((w) => w.replace("created_at", "s.created_at").replace("branch_id", "s.branch_id")).join(" AND ") : "") + " GROUP BY m.id ORDER BY revenue DESC LIMIT 10", params) as any[];
    const saleIds = await tenantPool.query(`SELECT id FROM sales${clause} ORDER BY created_at DESC LIMIT 200`, params) as any[];
    const sales: SaleRecord[] = [];
    for (const r of saleIds) { const sale = await this.loadSale(tenantPool, r.id); if (sale) sales.push(sale); }
    return { totalSales: Number(salesRows[0]?.totalSales ?? 0), totalPurchases: Number(purRows[0]?.totalPurchases ?? 0), profit: Number(salesRows[0]?.totalSales ?? 0) - Number(costRows[0]?.cost ?? 0), salesCount: Number(salesRows[0]?.salesCount ?? 0), purchaseCount: Number(purRows[0]?.purchaseCount ?? 0), byBranch: branchRows.map((r: any) => ({ branchId: r.branchId, sales: Number(r.sales), orders: Number(r.orders) })), topProducts: topRows.map((r: any) => ({ name: r.name, units: Number(r.units), revenue: Number(r.revenue) })), sales };
  }
  async createTransfer(tenantId: string, userId: string, input: { medicineId: string; batchId: string; fromBranchId: string; toBranchId: string; quantity: number }) {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensureInventoryTables(tenantPool); await this.ensurePhase4Tables(tenantPool);
    if (input.fromBranchId === input.toBranchId) throw new Error("SAME_BRANCH_TRANSFER");
    if (!(input.quantity > 0)) throw new Error("INVALID_ITEMS");
    const batches = await tenantPool.query("SELECT batch_no AS batchNo FROM medicine_batches WHERE id = ? AND medicine_id = ? LIMIT 1", [input.batchId, input.medicineId]) as any[];
    if (!batches.length) throw new Error("BATCH_NOT_FOUND");
    const id = randomId("transfer");
    await tenantPool.query("INSERT INTO transfers (id, medicine_id, batch_id, batch_no, from_branch_id, to_branch_id, quantity, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)", [id, input.medicineId, input.batchId, batches[0].batchNo, input.fromBranchId, input.toBranchId, input.quantity, userId]);
    return { id, medicineId: input.medicineId, batchId: input.batchId, batchNo: batches[0].batchNo, fromBranchId: input.fromBranchId, toBranchId: input.toBranchId, quantity: input.quantity, status: "pending" as const, createdAt: new Date().toISOString() };
  }
  async listTransfers(tenantId: string) {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensurePhase4Tables(tenantPool);
    const rows = await tenantPool.query("SELECT id, medicine_id AS medicineId, batch_id AS batchId, batch_no AS batchNo, from_branch_id AS fromBranchId, to_branch_id AS toBranchId, quantity, status, created_at AS createdAt FROM transfers ORDER BY created_at DESC LIMIT 200") as any[];
    return rows.map((r: any) => ({ id: r.id, medicineId: r.medicineId, batchId: r.batchId, batchNo: r.batchNo, fromBranchId: r.fromBranchId, toBranchId: r.toBranchId, quantity: Number(r.quantity), status: r.status, createdAt: String(r.createdAt) }));
  }
  private async loadTransfer(tenantPool: any, transferId: string) {
    const rows = await tenantPool.query("SELECT id, medicine_id AS medicineId, batch_id AS batchId, batch_no AS batchNo, from_branch_id AS fromBranchId, to_branch_id AS toBranchId, quantity, status, created_at AS createdAt FROM transfers WHERE id = ? LIMIT 1", [transferId]) as any[];
    const r = rows[0]; if (!r) return undefined;
    return { id: r.id, medicineId: r.medicineId, batchId: r.batchId, batchNo: r.batchNo, fromBranchId: r.fromBranchId, toBranchId: r.toBranchId, quantity: Number(r.quantity), status: r.status, createdAt: String(r.createdAt) };
  }
  async approveTransfer(tenantId: string, userId: string, transferId: string) {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensureInventoryTables(tenantPool); await this.ensurePhase4Tables(tenantPool);
    const connection = await tenantPool.getConnection();
    try {
      await connection.beginTransaction();
      const transfer = await this.loadTransfer(connection, transferId);
      if (!transfer) throw new Error("TRANSFER_NOT_FOUND");
      if (transfer.status !== "pending") throw new Error("TRANSFER_NOT_PENDING");
      const stockRows = await connection.query("SELECT quantity, reorder_level AS reorderLevel FROM branch_stock WHERE branch_id = ? AND batch_id = ? FOR UPDATE", [transfer.fromBranchId, transfer.batchId]) as any[];
      const avail = stockRows.length ? Number(stockRows[0].quantity) : 0;
      if (avail < transfer.quantity) throw new Error("INSUFFICIENT_STOCK");
      await connection.query("UPDATE branch_stock SET quantity = quantity - ? WHERE branch_id = ? AND batch_id = ?", [transfer.quantity, transfer.fromBranchId, transfer.batchId]);
      await connection.query("INSERT INTO branch_stock (branch_id, batch_id, quantity, reserved_quantity, reorder_level) VALUES (?, ?, ?, 0, ?) ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)", [transfer.toBranchId, transfer.batchId, transfer.quantity, stockRows.length ? Number(stockRows[0].reorderLevel) : 0]);
      await connection.query("INSERT INTO stock_movements (movement_uuid, branch_id, batch_id, movement_type, quantity, reference_id, idempotency_key, server_version, created_by) VALUES (?, ?, ?, 'transfer', ?, ?, ?, 0, ?)", [randomId("movement"), transfer.fromBranchId, transfer.batchId, -transfer.quantity, transferId, `transfer-out-${transferId}`, userId]);
      await connection.query("INSERT INTO stock_movements (movement_uuid, branch_id, batch_id, movement_type, quantity, reference_id, idempotency_key, server_version, created_by) VALUES (?, ?, ?, 'transfer', ?, ?, ?, 0, ?)", [randomId("movement"), transfer.toBranchId, transfer.batchId, transfer.quantity, transferId, `transfer-in-${transferId}`, userId]);
      await connection.query("UPDATE transfers SET status = 'approved' WHERE id = ?", [transferId]);
      await connection.query("INSERT INTO audit_logs (actor_id, action, entity, entity_id, after_json) VALUES (?, 'transfer.approve', 'transfer', ?, ?)", [userId, transferId, JSON.stringify({ status: "approved" })]);
      await connection.commit();
      const updated = await this.loadTransfer(tenantPool, transferId);
      return updated!;
    } catch (error) {
      await connection.rollback().catch(() => undefined); throw error;
    } finally { connection.release(); }
  }
  async rejectTransfer(tenantId: string, userId: string, transferId: string) {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensurePhase4Tables(tenantPool);
    const transfer = await this.loadTransfer(tenantPool, transferId);
    if (!transfer) throw new Error("TRANSFER_NOT_FOUND");
    if (transfer.status !== "pending") throw new Error("TRANSFER_NOT_PENDING");
    await tenantPool.query("UPDATE transfers SET status = 'rejected' WHERE id = ?", [transferId]);
    await tenantPool.query("INSERT INTO audit_logs (actor_id, action, entity, entity_id, after_json) VALUES (?, 'transfer.reject', 'transfer', ?, ?)", [userId, transferId, JSON.stringify({ status: "rejected" })]);
    const updated = await this.loadTransfer(tenantPool, transferId);
    return updated!;
  }
  async getAccounting(tenantId: string, filters: { from?: string; to?: string; branchId?: string }): Promise<AccountingSummary> {
    const tenantPool = await this.getTenantPool(tenantId);
    await this.ensureInventoryTables(tenantPool); await this.ensurePhase3Tables(tenantPool);
    const where: string[] = [];
    const params: unknown[] = [];
    if (filters.from) { where.push("DATE(created_at) >= ?"); params.push(filters.from); }
    if (filters.to) { where.push("DATE(created_at) <= ?"); params.push(filters.to); }
    if (filters.branchId) { where.push("branch_id = ?"); params.push(filters.branchId); }
    const clause = where.length ? " WHERE " + where.join(" AND ") : "";
    const salesRows = await tenantPool.query(`SELECT COALESCE(SUM(total), 0) AS revenue, COALESCE(SUM(paid_amount), 0) AS cashReceived FROM sales${clause}`, params) as any[];
    const purClause = where.length ? clause + " AND status = 'approved'" : " WHERE status = 'approved'";
    const purRows = await tenantPool.query(`SELECT COALESCE(SUM(subtotal), 0) AS purchases FROM purchases${purClause}`, params) as any[];
    const costRows = await tenantPool.query("SELECT COALESCE(SUM(si.quantity * b.purchase_price), 0) AS cost FROM sale_items si JOIN medicine_batches b ON b.id = si.batch_id JOIN sales s ON s.id = si.sale_id" + (where.length ? " WHERE " + where.map((w) => w.replace("created_at", "s.created_at").replace("branch_id", "s.branch_id")).join(" AND ") : ""), params) as any[];
    const parties = await tenantPool.query("SELECT id, type FROM parties") as any[];
    let receivable = 0; let payable = 0;
    for (const party of parties) {
      const balance = await this.partyBalanceFromPool(tenantPool, party.id, party.type);
      if (party.type === "customer" && balance > 0) receivable += balance;
      if (party.type === "supplier" && balance > 0) payable += balance;
    }
    const sales = await tenantPool.query(`SELECT invoice_no AS invoiceNo, total, paid_amount AS paidAmount, balance_due AS balanceDue, created_at AS createdAt FROM sales${clause} ORDER BY created_at ASC LIMIT 200`, params) as any[];
    const purchases = await tenantPool.query(`SELECT id, subtotal, paid_amount AS paidAmount, balance_due AS balanceDue, created_at AS createdAt FROM purchases${purClause} ORDER BY created_at ASC LIMIT 200`, params) as any[];
    const ledger: AccountingSummary["ledger"] = [];
    for (const sale of sales) {
      ledger.push({ date: String(sale.createdAt), type: "sale", reference: sale.invoiceNo, debit: Number(sale.paidAmount), credit: 0, note: `Sale ${sale.invoiceNo} cash received` });
      if (Number(sale.balanceDue) > 0) ledger.push({ date: String(sale.createdAt), type: "sale_credit", reference: sale.invoiceNo, debit: Number(sale.balanceDue), credit: 0, note: `Sale ${sale.invoiceNo} receivable` });
      ledger.push({ date: String(sale.createdAt), type: "sale_revenue", reference: sale.invoiceNo, debit: 0, credit: Number(sale.total), note: `Sale ${sale.invoiceNo} revenue` });
    }
    for (const pur of purchases) {
      ledger.push({ date: String(pur.createdAt), type: "purchase", reference: pur.id, debit: Number(pur.subtotal), credit: 0, note: "Purchase stock" });
      if (Number(pur.paidAmount) > 0) ledger.push({ date: String(pur.createdAt), type: "purchase_payment", reference: pur.id, debit: 0, credit: Number(pur.paidAmount), note: "Purchase cash paid" });
      if (Number(pur.balanceDue) > 0) ledger.push({ date: String(pur.createdAt), type: "purchase_payable", reference: pur.id, debit: 0, credit: Number(pur.balanceDue), note: "Purchase payable" });
    }
    const khataRows = await tenantPool.query("SELECT k.party_id AS partyId, k.debit, k.credit, k.created_at AS createdAt, p.type AS partyType FROM khata_entries k JOIN parties p ON p.id = k.party_id WHERE k.entry_type = 'payment' ORDER BY k.created_at ASC LIMIT 200") as any[];
    for (const entry of khataRows) {
      const amount = Number(entry.debit) + Number(entry.credit);
      if (entry.partyType === "customer") { ledger.push({ date: String(entry.createdAt), type: "khata_payment", reference: entry.partyId, debit: amount, credit: 0, note: "Customer khata payment received (cash)" }); ledger.push({ date: String(entry.createdAt), type: "khata_payment", reference: entry.partyId, debit: 0, credit: amount, note: "Customer khata payment received (receivable)" }); }
      else { ledger.push({ date: String(entry.createdAt), type: "khata_payment", reference: entry.partyId, debit: amount, credit: 0, note: "Supplier khata payment made (payable)" }); ledger.push({ date: String(entry.createdAt), type: "khata_payment", reference: entry.partyId, debit: 0, credit: amount, note: "Supplier khata payment made (cash)" }); }
    }
    ledger.sort((a, b) => a.date.localeCompare(b.date));
    return { revenue: Number(salesRows[0]?.revenue ?? 0), purchases: Number(purRows[0]?.purchases ?? 0), profit: Number(salesRows[0]?.revenue ?? 0) - Number(costRows[0]?.cost ?? 0), receivable, payable, cashReceived: Number(salesRows[0]?.cashReceived ?? 0), ledger: ledger.slice(0, 200) };
  }
}

// Phase 5 slice 1 — auto-setup: on MariaDB boot the app creates the
// registry tables itself (additive only, IF NOT EXISTS, never DROP), so
// no manual phpMyAdmin step is needed. The registry is whatever database
// MARIADB_DATABASE points to — never a hardcoded name, which is why the
// old 001/003 files with USE master_control failed on other DB names.
export async function ensureMasterTables(): Promise<void> {
  const pool = mariadb.createPool({ host: process.env.MARIADB_HOST, port: Number(process.env.MARIADB_PORT || 3306), user: process.env.MARIADB_USER, password: process.env.MARIADB_PASSWORD, database: process.env.MARIADB_DATABASE, connectionLimit: 5 });
  try {
    await pool.query("CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(64) PRIMARY KEY, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB");
    await pool.query("CREATE TABLE IF NOT EXISTS tenants (id VARCHAR(64) PRIMARY KEY, name VARCHAR(160) NOT NULL, database_name VARCHAR(96) NOT NULL UNIQUE, plan ENUM('basic','advanced') NOT NULL DEFAULT 'basic', status ENUM('active','locked','maintenance','archived') NOT NULL DEFAULT 'active', created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP) ENGINE=InnoDB");
    const col = await pool.query("SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tenants' AND COLUMN_NAME = 'branch_summary_json'") as any[];
    if (!Number(col[0]?.n ?? 0)) await pool.query("ALTER TABLE tenants ADD COLUMN branch_summary_json JSON NULL");
    const featCol = await pool.query("SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tenants' AND COLUMN_NAME = 'feature_flags_json'") as any[];
    if (!Number(featCol[0]?.n ?? 0)) await pool.query("ALTER TABLE tenants ADD COLUMN feature_flags_json JSON NULL");
    await pool.query("CREATE TABLE IF NOT EXISTS tenant_domains (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, tenant_id VARCHAR(64) NOT NULL, hostname VARCHAR(255) NOT NULL UNIQUE, verified_at TIMESTAMP NULL, FOREIGN KEY (tenant_id) REFERENCES tenants(id)) ENGINE=InnoDB");
    await pool.query("CREATE TABLE IF NOT EXISTS tenant_devices (id VARCHAR(96) PRIMARY KEY, tenant_id VARCHAR(64) NOT NULL, user_id VARCHAR(96) NOT NULL, device_name VARCHAR(120) NOT NULL, hwid_hash CHAR(64) NOT NULL, public_key TEXT NULL, status ENUM('active','pending','revoked','frozen') NOT NULL DEFAULT 'pending', last_seen_at TIMESTAMP NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (tenant_id) REFERENCES tenants(id), INDEX idx_device_tenant_status (tenant_id, status)) ENGINE=InnoDB");
    await pool.query("CREATE TABLE IF NOT EXISTS master_audit_logs (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, actor_id VARCHAR(96) NOT NULL, action VARCHAR(96) NOT NULL, tenant_id VARCHAR(64) NULL, metadata_json JSON NULL, ip_address VARCHAR(64) NULL, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_master_audit_tenant_time (tenant_id, created_at)) ENGINE=InnoDB");
    await pool.query("CREATE TABLE IF NOT EXISTS tenant_user_index (user_id VARCHAR(96) PRIMARY KEY, tenant_id VARCHAR(64) NOT NULL, name VARCHAR(160) NOT NULL, login VARCHAR(160) NOT NULL UNIQUE, password_hash VARCHAR(255) NOT NULL, role VARCHAR(80) NOT NULL, branch_ids_json JSON NOT NULL, permissions_json JSON NOT NULL, active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, INDEX idx_tenant_user_index_tenant (tenant_id)) ENGINE=InnoDB");
  } finally { await pool.end().catch(() => undefined); }
}

export async function createStore(): Promise<Store> {
  const store = process.env.STORAGE_MODE === "mariadb" ? new MariaDbHealthStore() : new MemoryStore();
  if (store instanceof MemoryStore) await store.seed();
  if (store instanceof MariaDbHealthStore) {
    try { await ensureMasterTables(); } catch (error) { console.warn("Master auto-setup failed (will retry on next provisioning attempt):", error instanceof Error ? error.message : error); }
  }
  return store;
}
