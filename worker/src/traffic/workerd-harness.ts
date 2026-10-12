import { handleTraffic, type TrafficEnv, type UsageNamespace } from "./traffic.ts";
import { sqliteLedgerStore, TrafficUsage, type DurableObjectState } from "./usage-object.ts";

/**
 * TEST ONLY: the entry point of a throwaway Worker that usage-object.workerd.test.ts runs in the LOCAL Workers runtime (workerd, via
 * Wrangler), so the real TrafficUsage class is tested with real Durable Object SQLite storage, real `transactionSync` and real
 * concurrent requests. It is never deployed: wrangler.jsonc's entry is worker/src/index.ts, which doesn't import this file, and the
 * test writes its own config (to a temporary directory) that binds nothing remote. Nothing here calls the network: the TomTom
 * upstream is replaced by a counter that answers with a fake tile.
 */

export { TrafficUsage };

/**
 * The same class, bound under a second name, with two extra commands the real object must never have: `seed` writes a count
 * straight into the ledger table (to test the 150,000 cap without 150,000 requests) and `break` drops the table (a real storage
 * error). Every other command goes to the unchanged TrafficUsage code.
 */
export class SeedableTrafficUsage extends TrafficUsage {
  private readonly state: DurableObjectState;
  constructor(state: DurableObjectState) {
    super(state);
    this.state = state;
  }

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/seed") {
      const { key, value } = (await request.json()) as { key: string; value: number };
      sqliteLedgerStore(this.state).set(key, value);
      return Response.json({ ok: true });
    }
    if (url.pathname === "/break") {
      this.state.storage.sql.exec("DROP TABLE ledger");
      return Response.json({ ok: true });
    }
    return super.fetch(request);
  }
}

/** The test's config supplies a fake key as a plain variable; no key, real or fake, is written in this file. */
interface HarnessEnv extends Omit<TrafficEnv, "TRAFFIC_USAGE"> {
  SNAPSHOTS: TrafficEnv["SNAPSHOTS"] & { put(key: string, value: string): Promise<unknown> };
  TRAFFIC_USAGE: UsageNamespace;
  SEEDABLE_USAGE: UsageNamespace;
}

const TILE = new Uint8Array([0x1a, 0x02, 0x08, 0x01]);

export default {
  async fetch(request: Request, env: HarnessEnv): Promise<Response> {
    const url = new URL(request.url);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const namespace = body["seedable"] ? env.SEEDABLE_USAGE : env.TRAFFIC_USAGE;
    const object = namespace.get(namespace.idFromName(typeof body["name"] === "string" ? body["name"] : "tomtom"));
    const toObject = (path: string, command: unknown) =>
      object.fetch(new Request(`https://traffic-usage.internal${path}`, { method: "POST", body: JSON.stringify(command) }));

    switch (url.pathname) {
      // `n` copies of one command sent to the object at once; each answer, or the error if the request failed.
      case "/burst": {
        const n = Number(body["n"]);
        const results = await Promise.all(
          Array.from({ length: n }, () =>
            toObject("/", body["command"]).then(
              async (r) => (r.ok ? r.json() : { status: r.status }),
              (e: unknown) => ({ thrown: e instanceof Error ? e.message : String(e) }),
            ),
          ),
        );
        return Response.json(results);
      }
      case "/seed":
        return toObject("/seed", { key: body["key"], value: body["value"] });
      case "/break":
        return toObject("/break", {});
      case "/control":
        await env.SNAPSHOTS.put("traffic/control.json", JSON.stringify(body["control"]));
        return Response.json({ ok: true });
      // `n` tile requests through the real gate at once (local R2 control object, this Durable Object), with a fake upstream.
      case "/gate": {
        let upstreamCalls = 0;
        const trafficEnv: TrafficEnv = { ...env, TRAFFIC_USAGE: { idFromName: () => null, get: () => object } };
        const deps = {
          now: () => Number(body["now"]),
          fetch: () => {
            upstreamCalls++;
            const status = Number(body["upstreamStatus"] ?? 200);
            return Promise.resolve(status === 200 ? new Response(TILE, { headers: { "Cache-Control": "max-age=60" } }) : new Response(null, { status }));
          },
        };
        const n = Number(body["n"] ?? 1);
        const statuses = await Promise.all(
          Array.from({ length: n }, (_, i) => handleTraffic(new Request(`https://harness.test/api/traffic/flow/10/${i}/340`), trafficEnv, deps).then((r) => r.status)),
        );
        return Response.json({ statuses, upstreamCalls });
      }
      default:
        return new Response("not found", { status: 404 });
    }
  },
};
