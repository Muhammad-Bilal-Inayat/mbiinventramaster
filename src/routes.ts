import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { allPermissionCodes, plans } from "./catalog.js";
import { signAccessToken, verifyAccessToken, verifyPassword, type AccessClaims, deviceFingerprint } from "./security.js";
import type { Store } from "./store.js";

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
