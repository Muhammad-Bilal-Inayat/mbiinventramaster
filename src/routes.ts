import { Router, type NextFunction, type Request, type Response } from "express";
import { z } from "zod";
import { allPermissionCodes, plans } from "./catalog.js";
import { signAccessToken, verifyAccessToken, verifyPassword, type AccessClaims, deviceFingerprint } from "./security.js";
import { provisionTenant } from "./provision.js";
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

  // Phase 1: Master Admin tenant provisioning. This is NOT a tenant route
  // and it does NOT use a tenant JWT. It is gated only by MASTER_ADMIN_KEY,
  // which must be set in the server env. If the key is missing, provisioning
  // is disabled entirely (503), never open. It only runs when
  // STORAGE_MODE=mariadb, because the memory demo has no real databases.
  // No database password is ever accepted in this request body.
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
