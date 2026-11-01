import type { Store, StockMovementRecord } from "./store.js";

// Phase 6 real sync, scoped to stock adjustments only (the smallest safe
// surface). Other record types (sales, purchases, prescriptions) are NOT
// synced yet and must not be claimed as synced.
//
// Rules:
// - Idempotency: every record carries an idempotencyKey. A retry with the
//   same key returns the original movement and never applies twice —
//   enforced by store.adjustStock in both memory and MariaDB modes.
// - Cursor pull: stock_movements.server_version is monotonic per tenant
//   database. Pull returns only movements after the client's cursor.
// - Server wins: adjustments are deltas, so a delta is applied on top of
//   the current server stock (stock math stays correct and never goes
//   negative). If the client's base cursor is older than the newest
//   server movement for that branch+batch, the record is flagged as a
//   conflict in the response with the server's current quantity, so the
//   client can show it and refresh — the server value is the truth the
//   client displays, never the stale offline value.

export interface SyncRecordInput {
  idempotencyKey: string;
  branchId: string;
  batchId: string;
  quantity: number;
  movementType: "adjust" | "damage" | "return";
  referenceId?: string | null;
}

export interface SyncRecordResult {
  idempotencyKey: string;
  status: "applied" | "replayed" | "error";
  conflict: boolean;
  movement?: StockMovementRecord;
  serverQuantity?: number;
  error?: string;
}

export interface SyncPushResult {
  applied: number;
  replayed: number;
  errors: number;
  results: SyncRecordResult[];
  conflicts: SyncRecordResult[];
  newCursor: number;
}

export async function pushSyncRecords(
  store: Store,
  tenantId: string,
  userId: string,
  records: SyncRecordInput[],
  baseCursor: number | null,
  hasBranchAccess: (branchId: string) => boolean,
): Promise<SyncPushResult> {
  const results: SyncRecordResult[] = [];
  for (const record of records) {
    if (!hasBranchAccess(record.branchId)) {
      results.push({ idempotencyKey: record.idempotencyKey, status: "error", conflict: false, error: "BRANCH_ACCESS_DENIED" });
      continue;
    }
    const existing = await store.getMovementByKey(tenantId, record.idempotencyKey);
    if (existing) {
      results.push({ idempotencyKey: record.idempotencyKey, status: "replayed", conflict: false, movement: existing });
      continue;
    }
    const serverCursor = await store.getBranchBatchCursor(tenantId, record.branchId, record.batchId);
    const conflict = baseCursor !== null && serverCursor > baseCursor;
    try {
      const movement = await store.adjustStock(tenantId, userId, {
        branchId: record.branchId,
        batchId: record.batchId,
        quantity: record.quantity,
        movementType: record.movementType,
        referenceId: record.referenceId ?? null,
        idempotencyKey: record.idempotencyKey,
      });
      const serverQuantity = await store.getBranchBatchQuantity(tenantId, record.branchId, record.batchId);
      results.push({ idempotencyKey: record.idempotencyKey, status: "applied", conflict, movement, serverQuantity });
    } catch (error) {
      const code = error instanceof Error ? error.message : "SYNC_FAILED";
      results.push({ idempotencyKey: record.idempotencyKey, status: "error", conflict: false, error: code });
    }
  }
  return {
    applied: results.filter((r) => r.status === "applied").length,
    replayed: results.filter((r) => r.status === "replayed").length,
    errors: results.filter((r) => r.status === "error").length,
    results,
    conflicts: results.filter((r) => r.conflict),
    newCursor: await store.getSyncCursor(tenantId),
  };
}
