import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { allPermissionCodes, plans } from "./catalog.js";
import { signAccessToken, verifyAccessToken, verifyPassword, type AccessClaims, deviceFingerprint } from "./security.js";
import { provisionTenant } from "./provision.js";
import { masterRegistry, isLicenseBlocked } from "./master.js";
import { chatWithGroq } from "./ai.js";
import { DEFAULT_HOME_LAYOUT, type Store } from "./store.js";

function checkMasterKey(request: Request, response: Response): boolean {
  const masterKey = process.env.MASTER_ADMIN_KEY;
  if (!masterKey) { response.status(503).json({ error: "MASTER_PROVISIONING_DISABLED", message: "Set MASTER_ADMIN_KEY in the server env to enable Master Admin routes." }); return false; }
  const provided = request.header("x-master-key") || "";
  const keysMatch = provided.length === masterKey.length && (() => {
    let diff = 0;
    for (let i = 0; i < provided.length; i++) diff |= provided.charCodeAt(i) ^ masterKey.charCodeAt(i);
    return diff === 0;
  })();
  if (!keysMatch) { response.status(403).json({ error: "MASTER_KEY_INVALID" }); return false; }
  return true;
}

export interface RequestContext extends Request { auth?: AccessClaims; }

function bearer(request: Request): string | undefined {
  const value = request.header("authorization");
  return value?.startsWith("Bearer ") ? value.slice(7) : undefined;
}

export function requireAuth(request: RequestContext, response: Response, next: NextFunction) {
  const token = bearer(request);
  if (!token) return response.status(401).json({ error: "AUTH_REQUIRED", message: "Sign in required." });
  try { request.auth = verifyAccessToken(token); next(); } catch { return response.status(401).json({ error: "INVALID_SESSION", message: "Session expired. Sign in again." }); }
}

function requirePermission(permission: string) {
  return (request: RequestContext, response: Response, next: NextFunction) => {
    if (!request.auth?.permissions.includes(permission as never)) return response.status(403).json({ error: "PERMISSION_DENIED", message: "Your account does not have this function enabled." });
    next();
  };
}

function tenantGuard(store: Store) {
  return async (request: RequestContext, response: Response, next: NextFunction) => {
    if (!request.auth) return response.status(401).json({ error: "AUTH_REQUIRED" });
    const tenant = await store.getTenant(request.auth.tenantId);
    if (!tenant) return response.status(404).json({ error: "TENANT_NOT_FOUND" });
    // A token issued before a lock/maintenance/archived change must not
    // keep working. Only active tenants may use protected routes.
    if (tenant.status !== "active") return response.status(423).json({ error: "TENANT_UNAVAILABLE", message: "This tenant is not active." });
    // License enforcement (Phase 5, License Manager): a tenant WITH a
    // license is blocked while it is suspended, revoked or expired.
    // Blocking never deletes or modifies data. A tenant with no license
    // record keeps working, so existing tenants are never broken here.
    try {
      const license = await masterRegistry.getTenantLicense(tenant.id);
      if (isLicenseBlocked(license ?? null)) return response.status(423).json({ error: "LICENSE_BLOCKED", message: "This tenant's license is suspended, revoked or expired. No data was deleted. Ask Master Admin to reactivate or extend the license." });
    } catch { /* license lookup failure must not lock out a tenant */ }
    // A revoked device must not keep working on an old token either.
    // device_demo is the demo-session exception, already gated by ALLOW_DEMO_AUTH.
    if (request.auth.deviceId !== "device_demo") {
      const devices = await store.listDevices(request.auth.tenantId);
      const device = devices.find((d) => d.id === request.auth!.deviceId);
      if (device && device.status === "revoked") return response.status(403).json({ error: "DEVICE_REVOKED", message: "This device has been revoked. Sign in from an approved device." });
    }
    response.locals.tenant = tenant;
    next();
  };
}

export function buildRouter(store: Store): Router {
  const router = Router();

  router.get("/health", async (_request, response) => {
    const database = await store.pingDatabase();
    response.status(database.ok ? 200 : 503).json({ ok: database.ok, service: "mbi-inventra-api", database, time: new Date().toISOString() });
  });

  router.get("/api/catalog", (_request, response) => response.json({ plans, permissions: allPermissionCodes }));

  router.post("/api/auth/login", async (request, response) => {
    const body = z.object({ login: z.string().min(2), password: z.string().min(6), deviceName: z.string().min(2).max(80).default("Browser device") }).safeParse(request.body);
    if (!body.success) return response.status(400).json({ error: "INVALID_INPUT", issues: body.error.flatten() });
    const user = await store.findUser(body.data.login);
    if (!user || !user.active || !(await verifyPassword(user.passwordHash, body.data.password))) return response.status(401).json({ error: "INVALID_CREDENTIALS", message: "Login details are not valid." });
    const tenant = await store.getTenant(user.tenantId);
    if (!tenant || tenant.status !== "active") return response.status(423).json({ error: "TENANT_UNAVAILABLE" });
    try {
      const license = await masterRegistry.getTenantLicense(tenant.id);
      if (isLicenseBlocked(license ?? null)) return response.status(423).json({ error: "LICENSE_BLOCKED", message: "This tenant's license is suspended, revoked or expired. No data was deleted." });
    } catch { /* license lookup failure must not lock out a tenant */ }
    // Phase 0 fix: login must not mint a new device on every sign-in and
    // bypass the device limit. Reuse the same HWID device when it exists,
    // otherwise enforce the tenant device limit (3 per tenant, see catalog).
    const hwidHash = deviceFingerprint(request.header("x-device-fingerprint") || body.data.deviceName);
    const existingDevices = await store.listDevices(tenant.id);
    const activeDevices = existingDevices.filter((d) => d.status !== "revoked");
    const matchingDevice = activeDevices.find((d) => d.userId === user.id && d.hwidHash === hwidHash);
    const deviceLimit = plans[tenant.plan].limits.devices;
    if (!matchingDevice && activeDevices.length >= deviceLimit) {
      return response.status(409).json({ error: "DEVICE_LIMIT_REACHED", limit: deviceLimit, message: "This tenant already has the maximum number of active devices. Revoke an old device first." });
    }
    const device = matchingDevice || await store.registerDevice({ tenantId: tenant.id, userId: user.id, name: body.data.deviceName, hwidHash });
    const token = signAccessToken({ sub: user.id, tenantId: tenant.id, deviceId: device.id, plan: tenant.plan, branchIds: user.branchIds, permissions: user.permissions });
    response.json({ token, user: { id: user.id, name: user.name, role: user.role }, tenant: { id: tenant.id, name: tenant.name, plan: tenant.plan }, device: { id: device.id, name: device.name } });
  });

  router.get("/api/demo/session", async (request, response) => {
    if (process.env.ALLOW_DEMO_AUTH !== "true") return response.status(404).json({ error: "NOT_FOUND" });
    const user = await store.findUser("owner");
    if (!user) return response.status(500).json({ error: "DEMO_NOT_READY" });
    const tenant = await store.getTenant(user.tenantId); if (!tenant) return response.status(500).json({ error: "DEMO_NOT_READY" });
    const token = signAccessToken({ sub: user.id, tenantId: tenant.id, deviceId: "device_demo", plan: tenant.plan, branchIds: user.branchIds, permissions: user.permissions });
    response.json({ token });
  });

  // Phase 1: Master Admin tenant provisioning. This is NOT a tenant route
  // and it does NOT use a tenant JWT. It is gated only by MASTER_ADMIN_KEY,
  // which must be set in the server env. If the key is missing, provisioning
  // is disabled entirely (503), never open. It only runs when
  // STORAGE_MODE=mariadb, because the memory demo has no real databases.
  // No database password is ever accepted in this request body.
  // Phase 5 slice 1 — Master panel list. Same master-key gate as create,
  // MariaDB only. The panel itself lives at /server in the frontend and is
  // never linked from the login page or the tenant nav.
  router.get("/api/master/tenants", async (request, response) => {
    if (!checkMasterKey(request, response)) return;
    if (process.env.STORAGE_MODE !== "mariadb") return response.status(503).json({ error: "STORAGE_NOT_MARIADB", message: "Tenant listing requires STORAGE_MODE=mariadb." });
    try { return response.json({ tenants: await store.listTenants() }); } catch { return response.status(503).json({ error: "TENANT_DATABASE_NOT_FOUND" }); }
  });

  // License Manager (Phase 5, /server only). Master-key gated. A tenant
  // has at most one non-revoked license at a time; revoked licenses do
  // not block a new one. Enforcement lives in tenantGuard/login above:
  // suspended, revoked or expired (and not lifetime) blocks with 423
  // and never deletes data. Tenants with no license record are unaffected.
  function mapLicenseError(error: unknown, response: Response) {
    const code = error instanceof Error ? error.message : "LICENSE_FAILED";
    const map: Record<string, number> = { LICENSE_NOT_FOUND: 404, LICENSE_KEY_EXISTS: 409, LICENSE_ALREADY_ASSIGNED: 409, INVALID_TRANSITION: 409, INVALID_LICENSE_KEY: 400, INVALID_INPUT: 400, TENANT_NOT_FOUND: 404 };
    return response.status(map[code] ?? 500).json({ error: code, message: code === "LICENSE_ALREADY_ASSIGNED" ? "This tenant already has a license. Revoke it first, or extend/suspend/reactivate the existing one." : code === "LICENSE_KEY_EXISTS" ? "This license key already exists." : code === "INVALID_TRANSITION" ? "This license cannot move to that state." : "License operation failed." });
  }
  router.get("/api/master/licenses", async (request, response) => {
    if (!checkMasterKey(request, response)) return;
    const filters = { tenantId: typeof request.query.tenantId === "string" ? request.query.tenantId : undefined, status: typeof request.query.status === "string" ? request.query.status : undefined, plan: typeof request.query.plan === "string" ? request.query.plan : undefined, expiringSoon: request.query.expiringSoon === "true" };
    try { return response.json({ licenses: await masterRegistry.listLicenses(filters) }); } catch { return response.status(503).json({ error: "LICENSE_FAILED" }); }
  });
  router.get("/api/master/licenses/:id", async (request, response) => {
    if (!checkMasterKey(request, response)) return;
    const license = await masterRegistry.getLicense(String(request.params.id));
    if (!license) return response.status(404).json({ error: "LICENSE_NOT_FOUND" });
    return response.json({ license, history: await masterRegistry.listAudit(license.tenantId ?? undefined) });
  });
  router.post("/api/master/licenses", async (request, response) => {
    if (!checkMasterKey(request, response)) return;
    const body = z.object({ tenantId: z.string().min(1).max(96).nullable().optional(), plan: z.enum(["basic", "advanced"]), key: z.string().min(8).max(64).optional(), startDate: z.string().max(20).nullable().optional(), expiryDate: z.string().max(20).nullable().optional(), lifetime: z.boolean().optional(), maxDevices: z.number().int().min(1).max(100).nullable().optional(), notes: z.string().max(1000).nullable().optional() }).safeParse(request.body);
    if (!body.success) return response.status(400).json({ error: "INVALID_INPUT", issues: body.error.flatten() });
    if (body.data.tenantId) {
      const tenant = await store.getTenant(body.data.tenantId);
      if (!tenant) return response.status(404).json({ error: "TENANT_NOT_FOUND" });
    }
    try { return response.status(201).json({ license: await masterRegistry.createLicense(body.data) }); } catch (error) { return mapLicenseError(error, response); }
  });
  router.post("/api/master/licenses/:id/suspend", async (request, response) => {
    if (!checkMasterKey(request, response)) return;
    try { return response.json({ license: await masterRegistry.actLicense(String(request.params.id), "suspend") }); } catch (error) { return mapLicenseError(error, response); }
  });
  router.post("/api/master/licenses/:id/reactivate", async (request, response) => {
    if (!checkMasterKey(request, response)) return;
    try { return response.json({ license: await masterRegistry.actLicense(String(request.params.id), "reactivate") }); } catch (error) { return mapLicenseError(error, response); }
  });
  router.post("/api/master/licenses/:id/revoke", async (request, response) => {
    if (!checkMasterKey(request, response)) return;
    try { return response.json({ license: await masterRegistry.actLicense(String(request.params.id), "revoke") }); } catch (error) { return mapLicenseError(error, response); }
  });
  router.post("/api/master/licenses/:id/extend", async (request, response) => {
    if (!checkMasterKey(request, response)) return;
    const body = z.object({ expiryDate: z.string().max(20).nullable().optional(), lifetime: z.boolean().optional(), notes: z.string().max(1000).nullable().optional(), plan: z.enum(["basic", "advanced"]).optional(), maxDevices: z.number().int().min(1).max(100).nullable().optional() }).safeParse(request.body);
    if (!body.success) return response.status(400).json({ error: "INVALID_INPUT", issues: body.error.flatten() });
    try { return response.json({ license: await masterRegistry.actLicense(String(request.params.id), "extend", body.data) }); } catch (error) { return mapLicenseError(error, response); }
  });
  router.post("/api/master/licenses/:id/assign", async (request, response) => {
    if (!checkMasterKey(request, response)) return;
    const body = z.object({ tenantId: z.string().min(1).max(96) }).safeParse(request.body);
    if (!body.success) return response.status(400).json({ error: "INVALID_INPUT", issues: body.error.flatten() });
    const tenant = await store.getTenant(body.data.tenantId);
    if (!tenant) return response.status(404).json({ error: "TENANT_NOT_FOUND" });
    try { return response.json({ license: await masterRegistry.actLicense(String(request.params.id), "assign", body.data) }); } catch (error) { return mapLicenseError(error, response); }
  });
  router.get("/api/master/audit", async (request, response) => {
    if (!checkMasterKey(request, response)) return;
    const tenantId = typeof request.query.tenantId === "string" ? request.query.tenantId : undefined;
    return response.json({ audit: await masterRegistry.listAudit(tenantId) });
  });

  // Master control menus (Phase 5, /server only). These endpoints control
  // tenants only — status, plan, devices, domains, support notes — and
  // never return tenant business data (no sales, orders or inventory).
  router.get("/api/master/health", async (request, response) => {
    if (!checkMasterKey(request, response)) return;
    try {
      const database = await store.pingDatabase();
      const tenants = await store.listTenants();
      const licenses = await masterRegistry.listLicenses({});
      const byPlan: Record<string, number> = { basic: 0, advanced: 0 };
      const byStatus: Record<string, number> = {};
      for (const t of tenants) { byPlan[t.plan] = (byPlan[t.plan] ?? 0) + 1; byStatus[t.status] = (byStatus[t.status] ?? 0) + 1; }
      const byLicense: Record<string, number> = {};
      for (const l of licenses) byLicense[l.effectiveStatus] = (byLicense[l.effectiveStatus] ?? 0) + 1;
      const expiringSoon = (await masterRegistry.listLicenses({ expiringSoon: true })).length;
      let devices = 0;
      for (const t of tenants) { try { devices += (await store.listDevices(t.id)).length; } catch { /* one tenant's devices must not break health */ } }
      return response.json({ database, tenants: tenants.length, byPlan, byStatus, licenses: licenses.length, byLicense, expiringSoon, devices, generatedAt: new Date().toISOString() });
    } catch { return response.status(503).json({ error: "MASTER_HEALTH_FAILED" }); }
  });
  router.get("/api/master/tenants/:tenantId/devices", async (request, response) => {
    if (!checkMasterKey(request, response)) return;
    const tenant = await store.getTenant(String(request.params.tenantId));
    if (!tenant) return response.status(404).json({ error: "TENANT_NOT_FOUND" });
    return response.json({ tenantId: tenant.id, devices: await store.listDevices(tenant.id) });
  });
  router.post("/api/master/tenants/:tenantId/devices/:deviceId/revoke", async (request, response) => {
    if (!checkMasterKey(request, response)) return;
    const tenant = await store.getTenant(String(request.params.tenantId));
    if (!tenant) return response.status(404).json({ error: "TENANT_NOT_FOUND" });
    const changed = await store.revokeDevice(tenant.id, String(request.params.deviceId));
    if (!changed) return response.status(404).json({ error: "DEVICE_NOT_FOUND" });
    await masterRegistry.logAudit("device.revoked", tenant.id, { deviceId: String(request.params.deviceId) });
    return response.json({ ok: true, deviceId: String(request.params.deviceId) });
  });
  router.post("/api/master/tenants/:tenantId/status", async (request, response) => {
    if (!checkMasterKey(request, response)) return;
    const body = z.object({ status: z.enum(["active", "locked", "maintenance"]) }).safeParse(request.body);
    if (!body.success) return response.status(400).json({ error: "INVALID_INPUT" });
    const changed = await store.setTenantStatus(String(request.params.tenantId), body.data.status);
    if (!changed) return response.status(404).json({ error: "TENANT_NOT_FOUND" });
    await masterRegistry.logAudit("tenant.status", String(request.params.tenantId), { status: body.data.status });
    return response.json({ tenantId: String(request.params.tenantId), status: body.data.status });
  });
  router.post("/api/master/tenants/:tenantId/plan", async (request, response) => {
    if (!checkMasterKey(request, response)) return;
    const body = z.object({ plan: z.enum(["basic", "advanced"]) }).safeParse(request.body);
    if (!body.success) return response.status(400).json({ error: "INVALID_INPUT" });
    const changed = await store.setTenantPlan(String(request.params.tenantId), body.data.plan);
    if (!changed) return response.status(404).json({ error: "TENANT_NOT_FOUND" });
    const license = await masterRegistry.getTenantLicense(String(request.params.tenantId));
    if (license) await masterRegistry.actLicense(license.id, "update", { plan: body.data.plan });
    await masterRegistry.logAudit("tenant.plan", String(request.params.tenantId), { plan: body.data.plan });
    return response.json({ tenantId: String(request.params.tenantId), plan: body.data.plan });
  });
  router.get("/api/master/tenants/:tenantId/domains", async (request, response) => {
    if (!checkMasterKey(request, response)) return;
    const tenant = await store.getTenant(String(request.params.tenantId));
    if (!tenant) return response.status(404).json({ error: "TENANT_NOT_FOUND" });
    return response.json({ tenantId: tenant.id, domains: await masterRegistry.listDomains(tenant.id), dnsVerification: "not built" });
  });
  router.post("/api/master/tenants/:tenantId/domains", async (request, response) => {
    if (!checkMasterKey(request, response)) return;
    const tenant = await store.getTenant(String(request.params.tenantId));
    if (!tenant) return response.status(404).json({ error: "TENANT_NOT_FOUND" });
    const body = z.object({ hostname: z.string().min(3).max(255) }).safeParse(request.body);
    if (!body.success) return response.status(400).json({ error: "INVALID_INPUT" });
    try { return response.status(201).json({ domain: await masterRegistry.addDomain(tenant.id, body.data.hostname) }); } catch (error) {
      const code = error instanceof Error ? error.message : "DOMAIN_FAILED";
      return response.status(code === "DOMAIN_ALREADY_EXISTS" ? 409 : code === "INVALID_HOSTNAME" ? 400 : 500).json({ error: code });
    }
  });
  router.delete("/api/master/tenants/:tenantId/domains/:domainId", async (request, response) => {
    if (!checkMasterKey(request, response)) return;
    const tenant = await store.getTenant(String(request.params.tenantId));
    if (!tenant) return response.status(404).json({ error: "TENANT_NOT_FOUND" });
    const removed = await masterRegistry.removeDomain(tenant.id, String(request.params.domainId));
    if (!removed) return response.status(404).json({ error: "DOMAIN_NOT_FOUND" });
    return response.json({ ok: true });
  });
  router.get("/api/master/tenants/:tenantId/note", async (request, response) => {
    if (!checkMasterKey(request, response)) return;
    const tenant = await store.getTenant(String(request.params.tenantId));
    if (!tenant) return response.status(404).json({ error: "TENANT_NOT_FOUND" });
    return response.json({ tenantId: tenant.id, note: await masterRegistry.getSupportNote(tenant.id) });
  });
  router.post("/api/master/tenants/:tenantId/note", async (request, response) => {
    if (!checkMasterKey(request, response)) return;
    const tenant = await store.getTenant(String(request.params.tenantId));
    if (!tenant) return response.status(404).json({ error: "TENANT_NOT_FOUND" });
    const body = z.object({ note: z.string().max(5000) }).safeParse(request.body);
    if (!body.success) return response.status(400).json({ error: "INVALID_INPUT" });
    return response.json({ tenantId: tenant.id, note: await masterRegistry.setSupportNote(tenant.id, body.data.note) });
  });

  // Phase 5 slice 1 — Public registration. Owner decision after pushback:
  // anyone may register a pharmacy, but the guardrails stay: plan is forced
  // to Basic (Advanced is a master-panel upgrade, so public signups cannot
  // burn Advanced AI quota), and registrations are rate-limited per IP
  // (10 per hour) so the endpoint cannot be used to flood tenant databases.
  const publicRegisterHits = new Map<string, number[]>();
  router.post("/api/public/register", async (request, response) => {
    if (process.env.STORAGE_MODE !== "mariadb") return response.status(503).json({ error: "STORAGE_NOT_MARIADB", message: "Public registration requires STORAGE_MODE=mariadb." });
    const ip = request.ip || "unknown";
    const now = Date.now();
    const hits = (publicRegisterHits.get(ip) ?? []).filter((t) => now - t < 3600000);
    if (hits.length >= 10) return response.status(429).json({ error: "RATE_LIMITED", message: "Too many registrations from this address. Try again later." });
    hits.push(now); publicRegisterHits.set(ip, hits);
    const body = z.object({ name: z.string().min(2).max(160), ownerName: z.string().min(2).max(160), ownerLogin: z.string().min(2).max(160), ownerPassword: z.string().min(8).max(200), branchName: z.string().min(2).max(160), branchCity: z.string().max(120).optional() }).safeParse(request.body);
    if (!body.success) return response.status(400).json({ error: "INVALID_INPUT", message: "Please fill all required fields: pharmacy name, owner name, login, password (min 8 characters) and branch name.", issues: body.error.flatten() });
    try {
      const result = await provisionTenant({ ...body.data, plan: "basic" });
      return response.status(201).json({ tenant: { id: result.tenantId, name: body.data.name, databaseName: result.databaseName, plan: "basic" }, ownerLogin: body.data.ownerLogin });
    } catch (error) {
      const code = error instanceof Error ? error.message : "REGISTER_FAILED";
      if (code === "TENANT_ALREADY_EXISTS") return response.status(409).json({ error: code });
      if (code === "LOGIN_ALREADY_EXISTS") return response.status(409).json({ error: code, message: "This login already exists. Please sign in with it, or register with a different login." });
      return response.status(503).json({ error: "REGISTER_FAILED", message: "Registration failed. The database or provisioning step did not complete." });
    }
  });

  // Phase 4 slice 5 — Public storefront + master feature control.
  // Public store routes are NOT tenant-JWT routes: the tenant comes from
  // the URL path, and the server checks that tenant's plan, status and
  // master feature flag itself. No customer login exists, no payment is
  // taken here (cash on delivery / pickup only), and controlled medicines
  // are never listed — an anonymous customer cannot present a prescription.
  async function publicStoreTenant(tenantId: string, response: Response) {
    let tenant;
    try { tenant = await store.getPublicStore(tenantId); } catch { response.status(404).json({ error: "TENANT_NOT_FOUND" }); return null; }
    if (tenant.status !== "active") { response.status(423).json({ error: "TENANT_UNAVAILABLE" }); return null; }
    if (tenant.plan !== "advanced") { response.status(403).json({ error: "PLAN_NOT_ADVANCED", message: "Online store is available on the Advanced plan only." }); return null; }
    try {
      const license = await masterRegistry.getTenantLicense(tenant.id);
      if (isLicenseBlocked(license ?? null)) { response.status(423).json({ error: "LICENSE_BLOCKED", message: "This pharmacy's license is suspended, revoked or expired." }); return null; }
    } catch { /* license lookup failure must not lock out a store */ }
    if (!tenant.onlineStoreEnabled) { response.status(403).json({ error: "STORE_DISABLED", message: "This pharmacy's online store is turned off by the master panel." }); return null; }
    return tenant;
  }
  router.get("/api/public/store/:tenantId", async (request, response) => {
    const tenant = await publicStoreTenant(String(request.params.tenantId), response);
    if (!tenant) return;
    return response.json({ store: { id: tenant.id, name: tenant.name, branches: tenant.branches } });
  });
  router.get("/api/public/store/:tenantId/products", async (request, response) => {
    const tenant = await publicStoreTenant(String(request.params.tenantId), response);
    if (!tenant) return;
    const branchId = typeof request.query.branchId === "string" ? request.query.branchId : "";
    if (!branchId) return response.status(400).json({ error: "BRANCH_REQUIRED" });
    try { return response.json({ products: await store.getPublicStoreProducts(tenant.id, branchId) }); } catch (error) {
      const code = error instanceof Error ? error.message : "STORE_FAILED";
      if (code === "BRANCH_NOT_FOUND") return response.status(404).json({ error: code });
      return response.status(503).json({ error: "STORE_FAILED" });
    }
  });
  const publicOrderHits = new Map<string, number[]>();
  router.post("/api/public/store/:tenantId/orders", async (request, response) => {
    const tenant = await publicStoreTenant(String(request.params.tenantId), response);
    if (!tenant) return;
    const ip = request.ip || "unknown";
    const now = Date.now();
    const hits = (publicOrderHits.get(ip) ?? []).filter((t) => now - t < 3600000);
    if (hits.length >= 30) return response.status(429).json({ error: "RATE_LIMITED", message: "Too many orders from this address. Try again later." });
    hits.push(now); publicOrderHits.set(ip, hits);
    const body = z.object({ branchId: z.string().min(1), customerName: z.string().min(2).max(160), customerPhone: z.string().min(7).max(40), address: z.string().max(400).nullable().optional(), items: z.array(z.object({ medicineId: z.string().min(1), quantity: z.number().int().positive() })).min(1).max(50) }).safeParse(request.body);
    if (!body.success) return response.status(400).json({ error: "INVALID_INPUT", issues: body.error.flatten() });
    try { return response.status(201).json({ order: await store.createOnlineOrder(tenant.id, body.data) }); } catch (error) {
      const code = error instanceof Error ? error.message : "ORDER_FAILED";
      const map: Record<string, number> = { MEDICINE_NOT_FOUND: 404, BRANCH_NOT_FOUND: 404, INSUFFICIENT_STOCK: 400, INVALID_ITEMS: 400, TENANT_DATABASE_NOT_FOUND: 503 };
      return response.status(map[code] ?? 500).json({ error: code, message: code === "INSUFFICIENT_STOCK" ? "Some items do not have enough stock in this branch right now." : "Order could not be placed." });
    }
  });

  // Master feature control (user order): /server only controls tenants —
  // one flag per function per tenant. Today only "online_store" exists;
  // other menus reuse this endpoint when their controls are set later.
  // This endpoint never returns tenant business data (no orders, sales or
  // inventory), only the tenant's own feature flags.
  router.get("/api/master/tenants/:tenantId/features", async (request, response) => {
    if (!checkMasterKey(request, response)) return;
    try { return response.json({ tenantId: String(request.params.tenantId), features: await store.getTenantFeatures(String(request.params.tenantId)) }); } catch (error) {
      const code = error instanceof Error ? error.message : "FEATURE_FAILED";
      if (code === "TENANT_NOT_FOUND") return response.status(404).json({ error: code });
      return response.status(503).json({ error: "FEATURE_FAILED" });
    }
  });
  router.post("/api/master/tenants/:tenantId/features", async (request, response) => {
    if (!checkMasterKey(request, response)) return;
    const body = z.object({ feature: z.string().min(1), enabled: z.boolean() }).safeParse(request.body);
    if (!body.success) return response.status(400).json({ error: "INVALID_INPUT" });
    try { return response.json({ tenantId: String(request.params.tenantId), features: await store.setTenantFeature(String(request.params.tenantId), body.data.feature, body.data.enabled) }); } catch (error) {
      const code = error instanceof Error ? error.message : "FEATURE_FAILED";
      if (code === "TENANT_NOT_FOUND") return response.status(404).json({ error: code });
      if (code === "FEATURE_NOT_SUPPORTED") return response.status(400).json({ error: code, message: "Only the online_store feature flag exists today." });
      return response.status(503).json({ error: "FEATURE_FAILED" });
    }
  });

  router.post("/api/master/tenants", async (request, response) => {
    const masterKey = process.env.MASTER_ADMIN_KEY;
    if (!masterKey) return response.status(503).json({ error: "MASTER_PROVISIONING_DISABLED", message: "Set MASTER_ADMIN_KEY in the server env to enable tenant provisioning." });
    const provided = request.header("x-master-key") || "";
    const keysMatch = provided.length === masterKey.length && (() => {
      let diff = 0;
      for (let i = 0; i < provided.length; i++) diff |= provided.charCodeAt(i) ^ masterKey.charCodeAt(i);
      return diff === 0;
    })();
    if (!keysMatch) return response.status(403).json({ error: "MASTER_KEY_INVALID" });
    if (process.env.STORAGE_MODE !== "mariadb") return response.status(503).json({ error: "STORAGE_NOT_MARIADB", message: "Tenant provisioning requires STORAGE_MODE=mariadb." });
    const body = z.object({
      name: z.string().min(2).max(160),
      plan: z.enum(["basic", "advanced"]),
      ownerName: z.string().min(2).max(160),
      ownerLogin: z.string().min(2).max(160),
      ownerPassword: z.string().min(8).max(200),
      branchName: z.string().min(2).max(160),
      branchCity: z.string().max(120).optional(),
    }).safeParse(request.body);
    if (!body.success) return response.status(400).json({ error: "INVALID_INPUT", issues: body.error.flatten() });
    try {
      const result = await provisionTenant(body.data);
      return response.status(201).json({ tenant: { id: result.tenantId, name: body.data.name, databaseName: result.databaseName, plan: body.data.plan }, ownerUserId: result.ownerUserId, branchId: result.branchId });
    } catch (error) {
      // Never leak database error details (host, user, or SQL) to the client.
      const message = error instanceof Error ? error.message : "PROVISION_FAILED";
      if (message === "TENANT_ALREADY_EXISTS") return response.status(409).json({ error: message });
      if (message === "LOGIN_ALREADY_EXISTS") return response.status(409).json({ error: message, message: "This login already exists. Use a different owner login." });
      if (message === "INVALID_PLAN") return response.status(400).json({ error: message });
      return response.status(503).json({ error: "PROVISION_FAILED", message: "Tenant provisioning failed. Check the server database configuration and try again." });
    }
  });

  // Master Admin AI credits control (per tenant, custom numbers).
  // Master key gated, same as tenant provisioning. The tenant's own
  // credits live in that tenant's database (MariaDB) or in memory
  // (demo), never in another tenant's store.
  router.get("/api/master/ai-credits", async (request, response) => {
    if (!checkMasterKey(request, response)) return;
    const tenantId = typeof request.query.tenantId === "string" ? request.query.tenantId : "";
    if (!tenantId) return response.status(400).json({ error: "TENANT_REQUIRED", message: "Pass ?tenantId= to read one tenant's AI credits." });
    const tenant = await store.getTenant(tenantId);
    if (!tenant) return response.status(404).json({ error: "TENANT_NOT_FOUND" });
    return response.json({ tenantId, credits: await store.getAiCredits(tenantId, tenant.plan) });
  });
  router.post("/api/master/ai-credits", async (request, response) => {
    if (!checkMasterKey(request, response)) return;
    const body = z.object({ tenantId: z.string().min(2), creditsTotal: z.number().int().min(0).max(1000000), enabled: z.boolean() }).safeParse(request.body);
    if (!body.success) return response.status(400).json({ error: "INVALID_INPUT", issues: body.error.flatten() });
    const tenant = await store.getTenant(body.data.tenantId);
    if (!tenant) return response.status(404).json({ error: "TENANT_NOT_FOUND" });
    return response.json({ tenantId: body.data.tenantId, credits: await store.setAiCredits(body.data.tenantId, { total: body.data.creditsTotal, enabled: body.data.enabled }) });
  });

  router.use("/api", requireAuth, tenantGuard(store));

  router.get("/api/me", async (request: RequestContext, response) => {
    const user = await store.getUser(request.auth!.sub); const tenant = response.locals.tenant;
    response.json({ user: user && { id: user.id, name: user.name, role: user.role, branchIds: user.branchIds, permissions: user.permissions }, tenant });
  });
  router.get("/api/dashboard", requirePermission("dashboard.view"), async (request: RequestContext, response) => response.json({ tenantId: request.auth!.tenantId, summary: await store.getDashboard(request.auth!.tenantId) }));
  router.get("/api/tenant", (_request, response) => response.json({ tenant: response.locals.tenant }));
  router.get("/api/devices", requirePermission("admin.devices"), async (request: RequestContext, response) => response.json({ devices: await store.listDevices(request.auth!.tenantId) }));
  router.post("/api/devices", requirePermission("admin.devices"), async (request: RequestContext, response) => {
    const body = z.object({ name: z.string().min(2).max(80), userId: z.string().min(2), hwid: z.string().min(4).max(200) }).safeParse(request.body);
    if (!body.success) return response.status(400).json({ error: "INVALID_INPUT" });
    const user = await store.getUser(body.data.userId);
    if (!user || user.tenantId !== request.auth!.tenantId) return response.status(404).json({ error: "USER_NOT_FOUND" });
    const devices = await store.listDevices(request.auth!.tenantId); const limit = plans[request.auth!.plan].limits.devices;
    if (devices.filter((device) => device.status !== "revoked").length >= limit) return response.status(409).json({ error: "DEVICE_LIMIT_REACHED", limit });
    const device = await store.registerDevice({ tenantId: request.auth!.tenantId, userId: user.id, name: body.data.name, hwidHash: deviceFingerprint(body.data.hwid) });
    response.status(201).json({ device });
  });
  router.post("/api/devices/:id/revoke", requirePermission("admin.devices"), async (request: RequestContext, response) => {
    const deviceId = String(request.params.id);
    const changed = await store.revokeDevice(request.auth!.tenantId, deviceId); if (!changed) return response.status(404).json({ error: "DEVICE_NOT_FOUND" });
    response.json({ ok: true, deviceId });
  });
  // Home layout (drag-drop, per tenant, server-saved). Layout is stored
  // in the tenant's own database, so one tenant's order never leaks to
  // another tenant. The client may not invent widget keys: the layout
  // must contain exactly the default widget set, in any order.
  router.get("/api/home/layout", async (request: RequestContext, response) => response.json({ tenantId: request.auth!.tenantId, layout: await store.getHomeLayout(request.auth!.tenantId) }));
  router.post("/api/home/layout", async (request: RequestContext, response) => {
    const body = z.object({ layout: z.array(z.string()).min(1).max(20) }).safeParse(request.body);
    if (!body.success) return response.status(400).json({ error: "INVALID_INPUT", issues: body.error.flatten() });
    const layout = body.data.layout;
    const allowed = new Set<string>(DEFAULT_HOME_LAYOUT);
    const unique = new Set(layout);
    if (unique.size !== layout.length || layout.length !== DEFAULT_HOME_LAYOUT.length || layout.some((key) => !allowed.has(key))) {
      return response.status(400).json({ error: "INVALID_LAYOUT", message: "Layout must contain each home widget exactly once.", allowed: [...DEFAULT_HOME_LAYOUT] });
    }
    return response.json({ tenantId: request.auth!.tenantId, layout: await store.saveHomeLayout(request.auth!.tenantId, layout) });
  });

  // AI credits (own tenant only) and AI chat (Groq, env key only).
  // Credits are per tenant: 1 chat request = 1 credit. Credits are checked
  // before calling Groq and consumed only on a successful answer, so a
  // provider failure does not cost a credit. If the server has no Groq
  // key, chat returns 503 and consumes nothing — never a fake answer.
  router.get("/api/ai/credits", async (request: RequestContext, response) => response.json({ tenantId: request.auth!.tenantId, credits: await store.getAiCredits(request.auth!.tenantId, request.auth!.plan) }));
  router.post("/api/ai/chat", async (request: RequestContext, response) => {
    const body = z.object({
      message: z.string().min(1).max(2000),
      history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(2000) })).max(8).optional(),
    }).safeParse(request.body);
    if (!body.success) return response.status(400).json({ error: "INVALID_INPUT", issues: body.error.flatten() });
    const tenant = response.locals.tenant;
    const creditsBefore = await store.getAiCredits(request.auth!.tenantId, request.auth!.plan);
    if (!creditsBefore.enabled) return response.status(403).json({ error: "AI_DISABLED", message: "AI is disabled for this tenant. Ask Master Admin to enable it." });
    if (creditsBefore.used >= creditsBefore.total) return response.status(403).json({ error: "AI_CREDITS_EXHAUSTED", message: "AI credits are finished for this tenant. Ask Master Admin for more credits.", credits: creditsBefore });
    if (!process.env.GROQ_API_KEY) return response.status(503).json({ error: "AI_NOT_CONFIGURED", message: "AI is not configured on the server yet. Master Admin must set GROQ_API_KEY in the server env.", credits: creditsBefore });
    const dashboard = await store.getDashboard(request.auth!.tenantId);
    const context = `Pharmacy: ${tenant.name} (${tenant.plan} plan). Branches: ${tenant.branches.map((b: { name: string }) => b.name).join(", ") || "none"}. Dashboard summary: revenue ${dashboard.revenue}, profit ${dashboard.profit}, low stock ${dashboard.lowStock}, expiring soon ${dashboard.expiringSoon}, total SKUs ${dashboard.totalSkus}.`;
    try {
      const history = body.data.history ?? [];
      const result = await chatWithGroq([...history, { role: "user", content: body.data.message }], context);
      const consumed = await store.consumeAiCredit(request.auth!.tenantId, request.auth!.plan);
      if (!consumed.ok) return response.status(403).json({ error: consumed.reason, message: "AI credits ran out while answering. The answer was not returned and the request was not counted twice.", credits: consumed.credits });
      return response.json({ answer: result.answer, model: result.model, credits: consumed.credits });
    } catch (error) {
      const code = error instanceof Error ? error.message : "AI_PROVIDER_ERROR";
      if (code === "AI_NOT_CONFIGURED") return response.status(503).json({ error: code, message: "AI is not configured on the server yet." });
      return response.status(502).json({ error: "AI_PROVIDER_ERROR", message: "The AI provider could not answer right now. No credit was consumed." });
    }
  });

  // Phase 2 — Inventory core. Medicines are tenant-wide, stock is per
  // branch+batch. No hard delete: medicines are deactivated, stock never
  // goes negative (transaction + row lock in MariaDB), stock movements are
  // idempotent by x-idempotency-key (or body idempotencyKey).
  function branchAccess(request: RequestContext, branchId: string): boolean {
    return request.auth!.branchIds.includes(branchId);
  }
  function mapStoreError(error: unknown, response: Response) {
    const code = error instanceof Error ? error.message : "INVENTORY_ERROR";
    const map: Record<string, number> = { SKU_ALREADY_EXISTS: 409, BARCODE_ALREADY_EXISTS: 409, BATCH_ALREADY_EXISTS: 409, MEDICINE_NOT_FOUND: 404, BATCH_NOT_FOUND: 404, NEGATIVE_STOCK: 400, TENANT_DATABASE_NOT_FOUND: 503 };
    const status = map[code] ?? 500;
    return response.status(status).json({ error: code, message: code === "NEGATIVE_STOCK" ? "Stock cannot go negative." : code === "SKU_ALREADY_EXISTS" ? "This SKU already exists for this tenant." : code === "BARCODE_ALREADY_EXISTS" ? "This barcode already exists for this tenant." : code === "BATCH_ALREADY_EXISTS" ? "This batch number already exists for this medicine." : "Inventory operation failed." });
  }
  router.get("/api/inventory/medicines", requirePermission("inventory.view"), async (request: RequestContext, response) => {
    const search = typeof request.query.search === "string" ? request.query.search : "";
    return response.json({ medicines: await store.listMedicines(request.auth!.tenantId, search) });
  });
  router.post("/api/inventory/medicines", requirePermission("inventory.edit"), async (request: RequestContext, response) => {
    const body = z.object({ sku: z.string().min(1).max(96), barcode: z.string().max(128).nullable().optional(), name: z.string().min(1).max(220), genericSalt: z.string().max(220).nullable().optional(), strength: z.string().max(120).nullable().optional(), dosageForm: z.string().max(80).nullable().optional(), category: z.string().max(120).nullable().optional(), isControlled: z.boolean().optional() }).safeParse(request.body);
    if (!body.success) return response.status(400).json({ error: "INVALID_INPUT", issues: body.error.flatten() });
    try { return response.status(201).json({ medicine: await store.createMedicine(request.auth!.tenantId, request.auth!.sub, body.data) }); } catch (error) { return mapStoreError(error, response); }
  });
  router.post("/api/inventory/medicines/import", requirePermission("inventory.edit"), async (request: RequestContext, response) => {
    const body = z.object({ items: z.array(z.object({ sku: z.string().min(1).max(96), barcode: z.string().max(128).nullable().optional(), name: z.string().min(1).max(220), genericSalt: z.string().max(220).nullable().optional(), strength: z.string().max(120).nullable().optional(), dosageForm: z.string().max(80).nullable().optional(), category: z.string().max(120).nullable().optional() })).min(1).max(200) }).safeParse(request.body);
    if (!body.success) return response.status(400).json({ error: "INVALID_INPUT", issues: body.error.flatten() });
    const created: unknown[] = []; const failed: Array<{ sku: string; error: string }> = [];
    for (const item of body.data.items) {
      try { created.push(await store.createMedicine(request.auth!.tenantId, request.auth!.sub, item)); } catch (error) { failed.push({ sku: item.sku, error: error instanceof Error ? error.message : "IMPORT_FAILED" }); }
    }
    return response.json({ created, failed, createdCount: created.length, failedCount: failed.length });
  });
  router.post("/api/inventory/medicines/:id/active", requirePermission("inventory.edit"), async (request: RequestContext, response) => {
    const body = z.object({ active: z.boolean() }).safeParse(request.body);
    if (!body.success) return response.status(400).json({ error: "INVALID_INPUT" });
    const medicine = await store.setMedicineActive(request.auth!.tenantId, request.auth!.sub, String(request.params.id), body.data.active);
    if (!medicine) return response.status(404).json({ error: "MEDICINE_NOT_FOUND" });
    return response.json({ medicine });
  });
  router.get("/api/inventory/medicines/:id/batches", requirePermission("inventory.view"), async (request: RequestContext, response) => {
    return response.json({ batches: await store.listBatches(request.auth!.tenantId, String(request.params.id)) });
  });
  router.post("/api/inventory/batches", requirePermission("inventory.edit"), async (request: RequestContext, response) => {
    const body = z.object({ medicineId: z.string().min(1), batchNo: z.string().min(1).max(96), expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), purchasePrice: z.number().min(0), salePrice: z.number().min(0) }).safeParse(request.body);
    if (!body.success) return response.status(400).json({ error: "INVALID_INPUT", issues: body.error.flatten() });
    try { return response.status(201).json({ batch: await store.createBatch(request.auth!.tenantId, request.auth!.sub, body.data) }); } catch (error) { return mapStoreError(error, response); }
  });
  router.post("/api/inventory/stock/adjust", requirePermission("inventory.adjust"), async (request: RequestContext, response) => {
    const body = z.object({ branchId: z.string().min(1), batchId: z.string().min(1), quantity: z.number().int().refine((n) => n !== 0), movementType: z.enum(["purchase", "sale", "adjust", "return", "damage", "transfer"]), referenceId: z.string().max(96).nullable().optional(), idempotencyKey: z.string().min(1).max(160).optional(), reorderLevel: z.number().int().min(0).optional() }).safeParse(request.body);
    if (!body.success) return response.status(400).json({ error: "INVALID_INPUT", issues: body.error.flatten() });
    if (!branchAccess(request, body.data.branchId)) return response.status(403).json({ error: "BRANCH_ACCESS_DENIED", message: "Your account does not have access to this branch." });
    const idempotencyKey = body.data.idempotencyKey ?? request.header("x-idempotency-key") ?? "";
    if (!idempotencyKey) return response.status(400).json({ error: "IDEMPOTENCY_KEY_REQUIRED", message: "Send idempotencyKey (or x-idempotency-key) with every stock adjustment." });
    try { return response.json({ movement: await store.adjustStock(request.auth!.tenantId, request.auth!.sub, { ...body.data, idempotencyKey }) }); } catch (error) { return mapStoreError(error, response); }
  });
  router.get("/api/inventory/alerts", requirePermission("inventory.view"), async (request: RequestContext, response) => response.json(await store.getStockAlerts(request.auth!.tenantId)));
  router.get("/api/inventory/fefo", requirePermission("inventory.view"), async (request: RequestContext, response) => {
    const medicineId = typeof request.query.medicineId === "string" ? request.query.medicineId : "";
    const branchId = typeof request.query.branchId === "string" ? request.query.branchId : "";
    if (!medicineId || !branchId) return response.status(400).json({ error: "INVALID_INPUT", message: "Pass medicineId and branchId." });
    if (!branchAccess(request, branchId)) return response.status(403).json({ error: "BRANCH_ACCESS_DENIED" });
    const batch = await store.getFefoBatch(request.auth!.tenantId, medicineId, branchId);
    if (!batch) return response.status(404).json({ error: "NO_FEFO_BATCH", message: "No non-expired batch with stock for this branch." });
    return response.json({ batch });
  });

  // Phase 3 — POS, Purchases, Khata. Sales and purchases are tenant-scoped,
  // branch-checked, and written with inventory + khata in one transaction
  // (MariaDB) or one pre-checked step (memory). Discount needs sales.discount;
  // approval needs purchases.approve; a pending purchase adds no stock.
  function mapPhase3Error(error: unknown, response: Response) {
    const code = error instanceof Error ? error.message : "PHASE3_ERROR";
    const map: Record<string, number> = { PARTY_NOT_FOUND: 404, SALE_NOT_FOUND: 404, PURCHASE_NOT_FOUND: 404, MEDICINE_NOT_FOUND: 404, RETURN_ITEM_NOT_FOUND: 404, INSUFFICIENT_STOCK: 400, INVALID_DISCOUNT: 400, PAYMENT_MISMATCH: 400, INVALID_AMOUNT: 400, INVALID_ITEMS: 400, CUSTOMER_REQUIRED: 400, CONTROLLED_PRESCRIPTION_REQUIRED: 400, PRESCRIPTION_QTY_EXCEEDED: 400, PRESCRIPTION_BRANCH_MISMATCH: 400, PRESCRIPTION_NOT_FOUND: 404, PRESCRIPTION_NOT_PENDING: 409, RETURN_EXCEEDS_SOLD: 400, ALREADY_RETURNED: 409, ALREADY_APPROVED: 409, TENANT_DATABASE_NOT_FOUND: 503 };
    const status = map[code] ?? 500;
    return response.status(status).json({ error: code, message: code === "INSUFFICIENT_STOCK" ? "Not enough stock in this branch for this sale. Nothing was sold." : code === "CUSTOMER_REQUIRED" ? "A credit sale needs a customer." : code === "PAYMENT_MISMATCH" ? "Paid amount does not match this sale or purchase total." : "Phase 3 operation failed." });
  }
  router.get("/api/parties", requirePermission("parties.view"), async (request: RequestContext, response) => {
    const type = typeof request.query.type === "string" ? request.query.type : undefined;
    return response.json({ parties: await store.listParties(request.auth!.tenantId, type) });
  });
  router.post("/api/parties", requirePermission("parties.view"), async (request: RequestContext, response) => {
    const body = z.object({ type: z.enum(["customer", "supplier"]), name: z.string().min(1).max(220), phone: z.string().max(40).nullable().optional(), address: z.string().max(400).nullable().optional() }).safeParse(request.body);
    if (!body.success) return response.status(400).json({ error: "INVALID_INPUT", issues: body.error.flatten() });
    return response.status(201).json({ party: await store.createParty(request.auth!.tenantId, body.data) });
  });
  router.get("/api/parties/:id/statement", requirePermission("parties.view"), async (request: RequestContext, response) => {
    try { return response.json(await store.getPartyBalance(request.auth!.tenantId, String(request.params.id))); } catch (error) { return mapPhase3Error(error, response); }
  });
  router.post("/api/parties/:id/pay", requirePermission("parties.payment"), async (request: RequestContext, response) => {
    const body = z.object({ amount: z.number().positive(), note: z.string().max(400).nullable().optional() }).safeParse(request.body);
    if (!body.success) return response.status(400).json({ error: "INVALID_INPUT", issues: body.error.flatten() });
    try { return response.json({ entry: await store.payParty(request.auth!.tenantId, request.auth!.sub, { partyId: String(request.params.id), amount: body.data.amount, note: body.data.note }) }); } catch (error) { return mapPhase3Error(error, response); }
  });
  router.get("/api/sales", requirePermission("sales.view"), async (request: RequestContext, response) => response.json({ sales: await store.listSales(request.auth!.tenantId) }));
  router.get("/api/sales/:id", requirePermission("sales.view"), async (request: RequestContext, response) => {
    const sale = await store.getSale(request.auth!.tenantId, String(request.params.id));
    if (!sale) return response.status(404).json({ error: "SALE_NOT_FOUND" });
    return response.json({ sale });
  });
  router.post("/api/sales", requirePermission("sales.create"), async (request: RequestContext, response) => {
    const body = z.object({ branchId: z.string().min(1), customerId: z.string().min(1).nullable().optional(), prescriptionId: z.string().min(1).nullable().optional(), items: z.array(z.object({ medicineId: z.string().min(1), quantity: z.number().int().positive() })).min(1).max(100), discount: z.number().min(0).default(0), paymentType: z.enum(["cash", "credit"]), paidAmount: z.number().min(0) }).safeParse(request.body);
    if (!body.success) return response.status(400).json({ error: "INVALID_INPUT", issues: body.error.flatten() });
    if (!branchAccess(request, body.data.branchId)) return response.status(403).json({ error: "BRANCH_ACCESS_DENIED" });
    if (body.data.discount > 0 && !request.auth!.permissions.includes("sales.discount" as never)) return response.status(403).json({ error: "PERMISSION_DENIED", message: "Your account does not have discount permission." });
    try { return response.status(201).json({ sale: await store.createSale(request.auth!.tenantId, request.auth!.sub, body.data) }); } catch (error) { return mapPhase3Error(error, response); }
  });
  router.post("/api/sales/:id/return", requirePermission("sales.refund"), async (request: RequestContext, response) => {
    const body = z.object({ items: z.array(z.object({ medicineId: z.string().min(1), batchId: z.string().min(1), quantity: z.number().int().positive() })).min(1).max(100) }).safeParse(request.body);
    if (!body.success) return response.status(400).json({ error: "INVALID_INPUT", issues: body.error.flatten() });
    const existing = await store.getSale(request.auth!.tenantId, String(request.params.id));
    if (!existing) return response.status(404).json({ error: "SALE_NOT_FOUND" });
    if (!branchAccess(request, existing.branchId)) return response.status(403).json({ error: "BRANCH_ACCESS_DENIED" });
    try { return response.json({ sale: await store.returnSale(request.auth!.tenantId, request.auth!.sub, String(request.params.id), body.data.items) }); } catch (error) { return mapPhase3Error(error, response); }
  });
  router.get("/api/purchases", requirePermission("purchases.view"), async (request: RequestContext, response) => response.json({ purchases: await store.listPurchases(request.auth!.tenantId) }));
  router.post("/api/purchases", requirePermission("purchases.create"), async (request: RequestContext, response) => {
    const body = z.object({ branchId: z.string().min(1), supplierId: z.string().min(1), items: z.array(z.object({ medicineId: z.string().min(1), batchNo: z.string().min(1).max(96), expiryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), purchasePrice: z.number().min(0), salePrice: z.number().min(0), quantity: z.number().int().positive() })).min(1).max(100), paidAmount: z.number().min(0).default(0) }).safeParse(request.body);
    if (!body.success) return response.status(400).json({ error: "INVALID_INPUT", issues: body.error.flatten() });
    if (!branchAccess(request, body.data.branchId)) return response.status(403).json({ error: "BRANCH_ACCESS_DENIED" });
    const approved = request.auth!.permissions.includes("purchases.approve" as never);
    try { return response.status(201).json({ purchase: await store.createPurchase(request.auth!.tenantId, request.auth!.sub, { ...body.data, approved }) }); } catch (error) { return mapPhase3Error(error, response); }
  });
  router.post("/api/purchases/:id/approve", requirePermission("purchases.approve"), async (request: RequestContext, response) => {
    const existing = (await store.listPurchases(request.auth!.tenantId)).find((x) => x.id === String(request.params.id));
    if (!existing) return response.status(404).json({ error: "PURCHASE_NOT_FOUND" });
    if (!branchAccess(request, existing.branchId)) return response.status(403).json({ error: "BRANCH_ACCESS_DENIED" });
    try { return response.json({ purchase: await store.approvePurchase(request.auth!.tenantId, request.auth!.sub, String(request.params.id)) }); } catch (error) { return mapPhase3Error(error, response); }
  });

  // Phase 4 slice 1 — Reports/Export + Branch Transfer. Advanced plan only:
  // Basic tenants are blocked server-side (403), not just hidden in the UI.
  // Reports are computed from the same Phase 3 sales/purchases/stock tables,
  // so report totals must equal the dashboard and the sales list.
  function requireAdvanced(request: RequestContext, response: Response): boolean {
    if (request.auth!.plan !== "advanced") { response.status(403).json({ error: "PLAN_NOT_ADVANCED", message: "This module is available on the Advanced plan only." }); return false; }
    return true;
  }
  function mapPhase4Error(error: unknown, response: Response) {
    const code = error instanceof Error ? error.message : "PHASE4_ERROR";
    const map: Record<string, number> = { TRANSFER_NOT_FOUND: 404, BATCH_NOT_FOUND: 404, INSUFFICIENT_STOCK: 400, SAME_BRANCH_TRANSFER: 400, INVALID_ITEMS: 400, TRANSFER_NOT_PENDING: 409, TENANT_DATABASE_NOT_FOUND: 503 };
    return response.status(map[code] ?? 500).json({ error: code, message: code === "INSUFFICIENT_STOCK" ? "Not enough stock in the source branch for this transfer." : code === "SAME_BRANCH_TRANSFER" ? "Source and destination branches must be different." : "Phase 4 operation failed." });
  }
  router.get("/api/reports/sales", requirePermission("reports.view"), async (request: RequestContext, response) => {
    if (!requireAdvanced(request, response)) return;
    const filters = { from: typeof request.query.from === "string" ? request.query.from : undefined, to: typeof request.query.to === "string" ? request.query.to : undefined, branchId: typeof request.query.branchId === "string" ? request.query.branchId : undefined };
    if (filters.branchId && !branchAccess(request, filters.branchId)) return response.status(403).json({ error: "BRANCH_ACCESS_DENIED" });
    return response.json({ report: await store.getSalesReport(request.auth!.tenantId, filters) });
  });
  router.get("/api/reports/sales/export", requirePermission("reports.export"), async (request: RequestContext, response) => {
    if (!requireAdvanced(request, response)) return;
    const filters = { from: typeof request.query.from === "string" ? request.query.from : undefined, to: typeof request.query.to === "string" ? request.query.to : undefined, branchId: typeof request.query.branchId === "string" ? request.query.branchId : undefined };
    if (filters.branchId && !branchAccess(request, filters.branchId)) return response.status(403).json({ error: "BRANCH_ACCESS_DENIED" });
    const report = await store.getSalesReport(request.auth!.tenantId, filters);
    const escapeCsv = (value: unknown) => '"' + String(value ?? "").replace(/"/g, '""') + '"';
    const lines = ["invoice_no,branch_id,total,paid_amount,balance_due,payment_type,status,created_at"];
    for (const sale of report.sales) lines.push([sale.invoiceNo, sale.branchId, sale.total, sale.paidAmount, sale.balanceDue, sale.paymentType, sale.status, sale.createdAt].map(escapeCsv).join(","));
    lines.push("");
    lines.push(["TOTAL_SALES", "", report.totalSales, "", "", "", "", ""].map(escapeCsv).join(","));
    response.setHeader("content-type", "text/csv; charset=utf-8");
    response.setHeader("content-disposition", "attachment; filename=sales-report.csv");
    return response.send(lines.join("\n"));
  });
  router.get("/api/transfers", requirePermission("transfers.request"), async (request: RequestContext, response) => {
    if (!requireAdvanced(request, response)) return;
    return response.json({ transfers: await store.listTransfers(request.auth!.tenantId) });
  });
  router.post("/api/transfers", requirePermission("transfers.request"), async (request: RequestContext, response) => {
    if (!requireAdvanced(request, response)) return;
    const body = z.object({ medicineId: z.string().min(1), batchId: z.string().min(1), fromBranchId: z.string().min(1), toBranchId: z.string().min(1), quantity: z.number().int().positive() }).safeParse(request.body);
    if (!body.success) return response.status(400).json({ error: "INVALID_INPUT", issues: body.error.flatten() });
    if (!branchAccess(request, body.data.fromBranchId) || !branchAccess(request, body.data.toBranchId)) return response.status(403).json({ error: "BRANCH_ACCESS_DENIED" });
    try { return response.status(201).json({ transfer: await store.createTransfer(request.auth!.tenantId, request.auth!.sub, body.data) }); } catch (error) { return mapPhase4Error(error, response); }
  });
  router.post("/api/transfers/:id/approve", requirePermission("transfers.approve"), async (request: RequestContext, response) => {
    if (!requireAdvanced(request, response)) return;
    const existing = (await store.listTransfers(request.auth!.tenantId)).find((x) => x.id === String(request.params.id));
    if (!existing) return response.status(404).json({ error: "TRANSFER_NOT_FOUND" });
    if (!branchAccess(request, existing.fromBranchId) || !branchAccess(request, existing.toBranchId)) return response.status(403).json({ error: "BRANCH_ACCESS_DENIED" });
    try { return response.json({ transfer: await store.approveTransfer(request.auth!.tenantId, request.auth!.sub, String(request.params.id)) }); } catch (error) { return mapPhase4Error(error, response); }
  });
  router.post("/api/transfers/:id/reject", requirePermission("transfers.approve"), async (request: RequestContext, response) => {
    if (!requireAdvanced(request, response)) return;
    const existing = (await store.listTransfers(request.auth!.tenantId)).find((x) => x.id === String(request.params.id));
    if (!existing) return response.status(404).json({ error: "TRANSFER_NOT_FOUND" });
    try { return response.json({ transfer: await store.rejectTransfer(request.auth!.tenantId, request.auth!.sub, String(request.params.id)) }); } catch (error) { return mapPhase4Error(error, response); }
  });

  // Phase 4 slice 4 — Staff attendance + simple pro-rata payroll, Advanced
  // only. Payroll rule (documented, not a full payroll): pay = monthly
  // salary x days present / days in month. No deductions, overtime or tax
  // are calculated here.
  function mapSlice4Error(error: unknown, response: Response) {
    const code = error instanceof Error ? error.message : "SLICE4_ERROR";
    const map: Record<string, number> = { USER_NOT_FOUND: 404, ATTENDANCE_NOT_FOUND: 404, INVALID_AMOUNT: 400, INVALID_INPUT: 400, ALREADY_CHECKED_IN: 409, ALREADY_CHECKED_OUT: 409, TENANT_DATABASE_NOT_FOUND: 503 };
    return response.status(map[code] ?? 500).json({ error: code, message: code === "ALREADY_CHECKED_IN" ? "Already checked in today." : code === "ALREADY_CHECKED_OUT" ? "Already checked out today." : "Attendance operation failed." });
  }
  router.post("/api/attendance/check-in", requirePermission("attendance.mark"), async (request: RequestContext, response) => {
    if (!requireAdvanced(request, response)) return;
    const body = z.object({ branchId: z.string().min(1) }).safeParse(request.body);
    if (!body.success) return response.status(400).json({ error: "INVALID_INPUT" });
    if (!branchAccess(request, body.data.branchId)) return response.status(403).json({ error: "BRANCH_ACCESS_DENIED" });
    try { return response.status(201).json({ attendance: await store.checkIn(request.auth!.tenantId, request.auth!.sub, body.data.branchId) }); } catch (error) { return mapSlice4Error(error, response); }
  });
  router.post("/api/attendance/check-out", requirePermission("attendance.mark"), async (request: RequestContext, response) => {
    if (!requireAdvanced(request, response)) return;
    try { return response.json({ attendance: await store.checkOut(request.auth!.tenantId, request.auth!.sub) }); } catch (error) { return mapSlice4Error(error, response); }
  });
  router.get("/api/attendance", requirePermission("attendance.view"), async (request: RequestContext, response) => {
    if (!requireAdvanced(request, response)) return;
    const filters = { userId: typeof request.query.userId === "string" ? request.query.userId : undefined, branchId: typeof request.query.branchId === "string" ? request.query.branchId : undefined, date: typeof request.query.date === "string" ? request.query.date : undefined };
    if (filters.branchId && !branchAccess(request, filters.branchId)) return response.status(403).json({ error: "BRANCH_ACCESS_DENIED" });
    return response.json({ attendance: await store.listAttendance(request.auth!.tenantId, filters) });
  });
  router.post("/api/staff/:id/salary", requirePermission("admin.users"), async (request: RequestContext, response) => {
    if (!requireAdvanced(request, response)) return;
    const body = z.object({ monthlySalary: z.number().min(0) }).safeParse(request.body);
    if (!body.success) return response.status(400).json({ error: "INVALID_INPUT" });
    try { return response.json(await store.setStaffSalary(request.auth!.tenantId, String(request.params.id), body.data.monthlySalary)); } catch (error) { return mapSlice4Error(error, response); }
  });
  router.get("/api/payroll", requirePermission("payroll.view"), async (request: RequestContext, response) => {
    if (!requireAdvanced(request, response)) return;
    const month = typeof request.query.month === "string" ? request.query.month : new Date().toISOString().slice(0, 7);
    try { return response.json({ month, payroll: await store.getPayroll(request.auth!.tenantId, month) }); } catch (error) { return mapSlice4Error(error, response); }
  });

  // Phase 4 slice 3 — Prescriptions + Controlled drugs, Advanced only.
  // A controlled medicine cannot be sold without a pending prescription for
  // the same branch covering the quantity; the sale (or a direct dispense)
  // marks the prescription dispensed and writes a controlled-drug log entry.
  function mapSlice3Error(error: unknown, response: Response) {
    const code = error instanceof Error ? error.message : "SLICE3_ERROR";
    const map: Record<string, number> = { PRESCRIPTION_NOT_FOUND: 404, MEDICINE_NOT_FOUND: 404, INSUFFICIENT_STOCK: 400, INVALID_ITEMS: 400, CONTROLLED_PRESCRIPTION_REQUIRED: 400, PRESCRIPTION_QTY_EXCEEDED: 400, PRESCRIPTION_BRANCH_MISMATCH: 400, PRESCRIPTION_NOT_PENDING: 409, TENANT_DATABASE_NOT_FOUND: 503 };
    return response.status(map[code] ?? 500).json({ error: code, message: code === "CONTROLLED_PRESCRIPTION_REQUIRED" ? "This controlled medicine needs a valid prescription." : code === "PRESCRIPTION_NOT_PENDING" ? "This prescription is already dispensed or cancelled." : "Prescription operation failed." });
  }
  router.post("/api/inventory/medicines/:id/controlled", requirePermission("inventory.edit"), async (request: RequestContext, response) => {
    if (!requireAdvanced(request, response)) return;
    const body = z.object({ controlled: z.boolean() }).safeParse(request.body);
    if (!body.success) return response.status(400).json({ error: "INVALID_INPUT" });
    const medicine = await store.setMedicineControlled(request.auth!.tenantId, request.auth!.sub, String(request.params.id), body.data.controlled);
    if (!medicine) return response.status(404).json({ error: "MEDICINE_NOT_FOUND" });
    return response.json({ medicine });
  });
  router.post("/api/prescriptions", requirePermission("prescriptions.create"), async (request: RequestContext, response) => {
    if (!requireAdvanced(request, response)) return;
    const body = z.object({ patientName: z.string().min(1).max(220), doctorName: z.string().min(1).max(220), branchId: z.string().min(1), items: z.array(z.object({ medicineId: z.string().min(1), quantity: z.number().int().positive(), dosage: z.string().max(120).nullable().optional(), instructions: z.string().max(300).nullable().optional() })).min(1).max(50) }).safeParse(request.body);
    if (!body.success) return response.status(400).json({ error: "INVALID_INPUT", issues: body.error.flatten() });
    if (!branchAccess(request, body.data.branchId)) return response.status(403).json({ error: "BRANCH_ACCESS_DENIED" });
    try { return response.status(201).json({ prescription: await store.createPrescription(request.auth!.tenantId, request.auth!.sub, body.data) }); } catch (error) { return mapSlice3Error(error, response); }
  });
  router.get("/api/prescriptions", requirePermission("prescriptions.view"), async (request: RequestContext, response) => {
    if (!requireAdvanced(request, response)) return;
    return response.json({ prescriptions: await store.listPrescriptions(request.auth!.tenantId) });
  });
  router.post("/api/prescriptions/:id/dispense", requirePermission("prescriptions.dispense"), async (request: RequestContext, response) => {
    if (!requireAdvanced(request, response)) return;
    try { return response.json({ prescription: await store.dispensePrescription(request.auth!.tenantId, request.auth!.sub, String(request.params.id)) }); } catch (error) { return mapSlice3Error(error, response); }
  });
  router.post("/api/prescriptions/:id/cancel", requirePermission("prescriptions.dispense"), async (request: RequestContext, response) => {
    if (!requireAdvanced(request, response)) return;
    try { return response.json({ prescription: await store.cancelPrescription(request.auth!.tenantId, request.auth!.sub, String(request.params.id)) }); } catch (error) { return mapSlice3Error(error, response); }
  });
  router.get("/api/controlled-log", requirePermission("prescriptions.view"), async (request: RequestContext, response) => {
    if (!requireAdvanced(request, response)) return;
    return response.json({ logs: await store.listControlledLogs(request.auth!.tenantId) });
  });

  // Phase 4 slice 5 — Tenant owner's online orders. The owner (and staff
  // with orders permissions) sees ALL of this tenant's online store data
  // here — every order, its items, customer and status — and confirms,
  // rejects or delivers it. Confirm deducts FEFO stock in one transaction;
  // reject moves no stock; delivered is a status change only. Online
  // totals are a separate channel from POS sales totals and are never
  // added into dashboard/POS revenue, so the menus cannot double-count.
  function mapSlice5Error(error: unknown, response: Response) {
    const code = error instanceof Error ? error.message : "SLICE5_ERROR";
    const map: Record<string, number> = { ORDER_NOT_FOUND: 404, MEDICINE_NOT_FOUND: 404, BRANCH_NOT_FOUND: 404, INSUFFICIENT_STOCK: 400, INVALID_ITEMS: 400, ORDER_NOT_PENDING: 409, ORDER_NOT_CONFIRMED: 409, TENANT_DATABASE_NOT_FOUND: 503 };
    return response.status(map[code] ?? 500).json({ error: code, message: code === "ORDER_NOT_PENDING" ? "This order is no longer pending." : code === "ORDER_NOT_CONFIRMED" ? "Only a confirmed order can be delivered." : code === "INSUFFICIENT_STOCK" ? "Not enough stock in this branch to confirm this order." : "Online order operation failed." });
  }
  router.get("/api/orders", requirePermission("orders.view"), async (request: RequestContext, response) => {
    if (!requireAdvanced(request, response)) return;
    return response.json({ orders: await store.listOnlineOrders(request.auth!.tenantId) });
  });
  router.get("/api/orders/:id", requirePermission("orders.view"), async (request: RequestContext, response) => {
    if (!requireAdvanced(request, response)) return;
    const order = await store.getOnlineOrder(request.auth!.tenantId, String(request.params.id));
    if (!order) return response.status(404).json({ error: "ORDER_NOT_FOUND" });
    return response.json({ order });
  });
  router.post("/api/orders/:id/confirm", requirePermission("orders.manage"), async (request: RequestContext, response) => {
    if (!requireAdvanced(request, response)) return;
    const existing = await store.getOnlineOrder(request.auth!.tenantId, String(request.params.id));
    if (!existing) return response.status(404).json({ error: "ORDER_NOT_FOUND" });
    if (!branchAccess(request, existing.branchId)) return response.status(403).json({ error: "BRANCH_ACCESS_DENIED" });
    try { return response.json({ order: await store.confirmOnlineOrder(request.auth!.tenantId, request.auth!.sub, String(request.params.id)) }); } catch (error) { return mapSlice5Error(error, response); }
  });
  router.post("/api/orders/:id/reject", requirePermission("orders.manage"), async (request: RequestContext, response) => {
    if (!requireAdvanced(request, response)) return;
    const existing = await store.getOnlineOrder(request.auth!.tenantId, String(request.params.id));
    if (!existing) return response.status(404).json({ error: "ORDER_NOT_FOUND" });
    if (!branchAccess(request, existing.branchId)) return response.status(403).json({ error: "BRANCH_ACCESS_DENIED" });
    try { return response.json({ order: await store.rejectOnlineOrder(request.auth!.tenantId, request.auth!.sub, String(request.params.id)) }); } catch (error) { return mapSlice5Error(error, response); }
  });
  router.post("/api/orders/:id/deliver", requirePermission("orders.manage"), async (request: RequestContext, response) => {
    if (!requireAdvanced(request, response)) return;
    const existing = await store.getOnlineOrder(request.auth!.tenantId, String(request.params.id));
    if (!existing) return response.status(404).json({ error: "ORDER_NOT_FOUND" });
    if (!branchAccess(request, existing.branchId)) return response.status(403).json({ error: "BRANCH_ACCESS_DENIED" });
    try { return response.json({ order: await store.deliverOnlineOrder(request.auth!.tenantId, request.auth!.sub, String(request.params.id)) }); } catch (error) { return mapSlice5Error(error, response); }
  });

  // Phase 4 slice 2 — Accounting, Advanced only. No separate stored ledger:
  // the summary and ledger are derived from Phase 3 sales, purchases and
  // khata entries every time, so accounting can never drift from the menus.
  router.get("/api/accounting/summary", requirePermission("accounting.view"), async (request: RequestContext, response) => {
    if (!requireAdvanced(request, response)) return;
    const filters = { from: typeof request.query.from === "string" ? request.query.from : undefined, to: typeof request.query.to === "string" ? request.query.to : undefined, branchId: typeof request.query.branchId === "string" ? request.query.branchId : undefined };
    if (filters.branchId && !branchAccess(request, filters.branchId)) return response.status(403).json({ error: "BRANCH_ACCESS_DENIED" });
    return response.json({ accounting: await store.getAccounting(request.auth!.tenantId, filters) });
  });

  // Phase 0 honesty fix: sync health must not return a random cursor, and
  // sync push must not pretend a record was saved when it was not.
  // Cursor-based offline sync storage lands in Phase 6. Until then, clients
  // must keep records in their local queue when they see SYNC_NOT_IMPLEMENTED.
  router.get("/api/sync/health", (request: RequestContext, response) => response.json({ ok: true, transport: "REST", tenantScoped: true, additive: true, cursor: null, cursorImplemented: false, tenantId: request.auth!.tenantId, lastSync: new Date().toISOString() }));
  router.post("/api/sync/push", requirePermission("inventory.edit"), (request, response) => {
    const idempotencyKey = request.header("x-idempotency-key");
    if (!idempotencyKey) return response.status(400).json({ error: "IDEMPOTENCY_KEY_REQUIRED", message: "Send x-idempotency-key with every sync record. Records without it are never accepted." });
    return response.status(501).json({ error: "SYNC_NOT_IMPLEMENTED", message: "Offline sync storage lands in Phase 6. Keep this record in the local queue; it was validated, not saved.", tenantId: (request as RequestContext).auth!.tenantId, idempotencyKey });
  });

  return router;
}
