import * as z from "zod";
import { backOff, canReserve, reserve, type LedgerStore } from "./usage-ledger.ts";

/**
 * The usage counter's Durable Object (SQLite storage backend, available on Workers Free). The Worker reaches the one instance
 * named "tomtom" through the TRAFFIC_USAGE binding.
 * DEFERRED: not in the first release. wrangler.jsonc has no binding or migration for it, and worker/src/index.ts neither exports
 * this class nor routes /api/traffic/* (worker/src/deploy-config.test.ts enforces both). The binding and migration v1 tested
 * locally are recorded in docs/LIVE-TRAFFIC-RESEARCH.md ("Implementation status") for a later, separately approved release.
 *
 * The subset of the Durable Objects API used here is typed locally (as worker/src/store.ts does for R2), so no type package is added.
 */
interface SqlCursor {
  toArray(): Record<string, unknown>[];
}
export interface DurableObjectState {
  storage: {
    sql: { exec(query: string, ...bindings: unknown[]): SqlCursor };
    transactionSync<T>(fn: () => T): T;
  };
}

/** The ledger on the object's SQLite storage: one row per key. */
export function sqliteLedgerStore(state: DurableObjectState): LedgerStore {
  const { sql } = state.storage;
  sql.exec("CREATE TABLE IF NOT EXISTS ledger (key TEXT PRIMARY KEY, value INTEGER NOT NULL)");
  return {
    get: (key) => {
      const row = sql.exec("SELECT value FROM ledger WHERE key = ?", key).toArray()[0];
      return row === undefined ? undefined : Number(row["value"]);
    },
    set: (key, value) => void sql.exec("INSERT INTO ledger (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, value),
    transaction: (fn) => state.storage.transactionSync(fn),
  };
}

const commandSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("reserve"), period: z.string().min(1).max(64), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), now: z.number() }),
  z.object({ op: z.literal("status"), period: z.string().min(1).max(64), day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), now: z.number() }),
  z.object({ op: z.literal("backoff"), until: z.number() }),
]);
export type UsageCommand = z.infer<typeof commandSchema>;

/** Handles one command. Exported for tests; the Durable Object below is a thin wrapper. */
export function runCommand(store: LedgerStore, command: UsageCommand): unknown {
  switch (command.op) {
    case "reserve":
      return reserve(store, command.period, command.day, command.now);
    case "status":
      return { available: canReserve(store, command.period, command.day, command.now) };
    case "backoff":
      backOff(store, command.until);
      return { ok: true };
  }
}

export class TrafficUsage {
  private readonly store: LedgerStore;
  constructor(state: DurableObjectState) {
    this.store = sqliteLedgerStore(state);
  }

  async fetch(request: Request): Promise<Response> {
    const parsed = commandSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return new Response("bad command", { status: 400 });
    return Response.json(runCommand(this.store, parsed.data));
  }
}
