export type PlanId = "basic" | "advanced";

export type PermissionCode =
  | "dashboard.view"
  | "sales.view"
  | "sales.create"
  | "sales.refund"
  | "sales.discount"
  | "inventory.view"
  | "inventory.edit"
  | "inventory.adjust"
  | "purchases.view"
  | "purchases.create"
  | "purchases.approve"
  | "parties.view"
  | "parties.payment"
  | "reports.view"
  | "reports.export"
  | "transfers.request"
  | "transfers.approve"
  | "prescriptions.view"
  | "prescriptions.create"
  | "prescriptions.dispense"
  | "accounting.view"
  | "admin.users"
  | "admin.devices";

export interface PlanDefinition {
  id: PlanId;
  name: string;
  description: string;
  limits: { users: number; devices: number; branches: number };
  modules: string[];
  aiQuota: number;
}

// Device limit is fixed at 3 per tenant for every plan (Phase 0 rule R3,
// from the original tenant spec). It is not a plan upsell: Basic 2 and
// Advanced 15 in the old foundation were demo values and are corrected here.
export const plans: Record<PlanId, PlanDefinition> = {
  basic: {
    id: "basic",
    name: "Basic",
    description: "Daily pharmacy operations with offline PWA and safe sync.",
    limits: { users: 2, devices: 3, branches: 2 },
    aiQuota: 20,
    modules: ["Dashboard", "POS & Sales", "Purchases", "Inventory", "Khata", "Reports", "Offline PWA"],
  },
  advanced: {
    id: "advanced",
    name: "Advanced",
    description: "Full multi-branch SaaS command center for growing pharmacy groups.",
    limits: { users: 15, devices: 3, branches: 10 },
    aiQuota: 300,
    modules: [
      "All Basic modules",
      "Multi-branch HQ",
      "Multi-godown",
      "Accounting",
      "Prescriptions",
      "Controlled drugs",
      "Online store",
      "AI Copilot",
      "Attendance & payroll",
      "Master analytics",
    ],
  },
};

export const permissionLabels: Record<PermissionCode, string> = {
  "dashboard.view": "View dashboard",
  "sales.view": "View sales",
  "sales.create": "Create sale",
  "sales.refund": "Refund sale",
  "sales.discount": "Apply discount",
  "inventory.view": "View inventory",
  "inventory.edit": "Edit inventory",
  "inventory.adjust": "Adjust stock",
  "purchases.view": "View purchases",
  "purchases.create": "Create purchase",
  "purchases.approve": "Approve purchase",
  "parties.view": "View khata",
  "parties.payment": "Record payment",
  "reports.view": "View reports",
  "reports.export": "Export reports",
  "transfers.request": "Request transfer",
  "transfers.approve": "Approve transfer",
  "prescriptions.view": "View prescriptions",
  "prescriptions.create": "Create prescription",
  "prescriptions.dispense": "Dispense prescription",
  "accounting.view": "View accounting",
  "admin.users": "Manage users",
  "admin.devices": "Manage devices",
};

export const allPermissionCodes = Object.keys(permissionLabels) as PermissionCode[];
