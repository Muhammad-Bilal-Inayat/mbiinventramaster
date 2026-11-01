// Tenant database naming, shared by provisioning and tenant-pool lookup.
// TENANT_DB_PREFIX is empty by default, so database names stay
// tenant_000001, tenant_000002, ... Shared hosting often grants a
// database user rights only on databases starting with the account
// prefix (e.g. "mbiinv_"); setting the prefix makes tenant databases
// "mbiinv_tenant_000001" so creation works under that grant.
export function tenantDbPrefix(): string {
  const prefix = (process.env.TENANT_DB_PREFIX || "").trim();
  if (prefix && !/^[A-Za-z0-9_]+$/.test(prefix)) throw new Error("INVALID_TENANT_DB_PREFIX");
  return prefix;
}

export function tenantDatabaseName(n: number): string {
  return `${tenantDbPrefix()}tenant_${String(n).padStart(6, "0")}`;
}

export function isTenantDatabaseName(name: string): boolean {
  let prefix = "";
  try { prefix = tenantDbPrefix(); } catch { return false; }
  if (prefix) return name.startsWith(prefix) && /^tenant_[0-9]{6}$/.test(name.slice(prefix.length));
  return /^tenant_[0-9]{6}$/.test(name);
}
