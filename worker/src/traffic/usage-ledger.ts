/**
 * The TomTom request ledger: the single place that decides whether one more upstream traffic request may be made, and counts it.
 *
 * Exactness: `reserve` reads, checks and writes inside ONE synchronous transaction, with no `await` between the read and the
 * write. It runs inside a Durable Object (usage-object.ts), which Cloudflare documents as single-threaded with one instance per
 * name worldwide, and whose `transactionSync` is "atomic and isolated". So concurrent requests are serialised and can never take
 * the count past a cap. (A read-modify-write across `await`s, as R2 or KV would need, could.)
 *
 * Every reservation is counted before the upstream request is made and is never refunded, so errors, 429s and revalidations are
 * all counted: TomTom doesn't document which requests it bills, so we assume all of them are.
 */

/** A synchronous key-value store with transactions: the Durable Object's SQLite storage, or an in-memory one in tests. */
export interface LedgerStore {
  get(key: string): number | undefined;
  set(key: string, value: number): void;
  /** Runs `fn` atomically; if it throws, nothing it wrote is kept. */
  transaction<T>(fn: () => T): T;
}

export const MONTHLY_CAP = 150_000;
export const MONTHLY_WARNING = 120_000;
/**
 * Per UTC day: Workers Free allows 100,000 requests a day for the whole Worker (closures included) and resets at 00:00 UTC, and
 * Durable Objects Free allows 100,000 requests and row writes a day. 5,000 keeps traffic far from both, and is the monthly cap
 * spread evenly over 30 days.
 */
export const DAILY_CAP = 5_000;

export type Refusal = "monthly-cap" | "daily-cap" | "backoff";
export type Reservation = { ok: true; monthly: number; daily: number; warning: boolean } | { ok: false; reason: Refusal };

/** `period` identifies the provider's billing cycle (set by the owner from the TomTom account); `day` is the UTC date. */
export function reserve(store: LedgerStore, period: string, day: string, nowMs: number): Reservation {
  return store.transaction(() => {
    if ((store.get("backoff-until") ?? 0) > nowMs) return { ok: false, reason: "backoff" };
    const monthlyKey = `month:${period}`;
    const dailyKey = `day:${day}`;
    const monthly = store.get(monthlyKey) ?? 0;
    const daily = store.get(dailyKey) ?? 0;
    if (monthly >= MONTHLY_CAP) return { ok: false, reason: "monthly-cap" };
    if (daily >= DAILY_CAP) return { ok: false, reason: "daily-cap" };
    store.set(monthlyKey, monthly + 1);
    store.set(dailyKey, daily + 1);
    // True exactly once a period: on the reservation that reaches the warning level (logged by the Worker).
    return { ok: true, monthly: monthly + 1, daily: daily + 1, warning: monthly + 1 === MONTHLY_WARNING };
  });
}

/** Stops all upstream requests until `untilMs` (never shortens an existing back-off). */
export function backOff(store: LedgerStore, untilMs: number): void {
  store.transaction(() => store.set("backoff-until", Math.max(untilMs, store.get("backoff-until") ?? 0)));
}

/** Whether a request could be reserved now, without reserving one (for /api/traffic/status). */
export function canReserve(store: LedgerStore, period: string, day: string, nowMs: number): boolean {
  return store.transaction(
    () =>
      (store.get("backoff-until") ?? 0) <= nowMs && (store.get(`month:${period}`) ?? 0) < MONTHLY_CAP && (store.get(`day:${day}`) ?? 0) < DAILY_CAP,
  );
}

export function memoryLedgerStore(): LedgerStore & { values: Map<string, number> } {
  const values = new Map<string, number>();
  return {
    values,
    get: (k) => values.get(k),
    set: (k, v) => void values.set(k, v),
    transaction: (fn) => {
      const before = new Map(values);
      try {
        return fn();
      } catch (e) {
        values.clear();
        for (const [k, v] of before) values.set(k, v);
        throw e;
      }
    },
  };
}
