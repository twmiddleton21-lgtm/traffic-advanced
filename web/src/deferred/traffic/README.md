# Deferred: live traffic for the Routes view

**Not in the first release** (owner's release decision, 2026-10-12). TomTom's terms, attribution, the use of TomTom's name and the
privacy wording are unresolved, so nothing here is shown to users. This is not evidence that any licence has been approved; see
`docs/LIVE-TRAFFIC-RESEARCH.md`.

Nothing in the app imports this folder. `web/src/ui-safety.test.ts`, `web/src/routemap/routemap.test.ts` and
`web/src/deferred/traffic/traffic.test.ts` fail if that changes, so it isn't in the build. It is still type-checked, linted and
tested, so it stays in working order.

| File | What it is |
|---|---|
| `traffic.ts` | the traffic state (off, checking, available, unavailable), the status check hook and the 10-minute refresh |
| `status.ts` | asks our Worker's `/api/traffic/status`; belongs in `web/src/data/trafficService.ts` when re-integrated |
| `layers.ts` | the traffic source and congestion layers (TomTom vector flow tiles through our Worker, zoom 7 to 13) |
| `TrafficControls.tsx` | the "Live traffic" switch, its source note and the congestion key (wording not approved) |
| `TrafficAttribution.tsx`, `credits.ts` | the provisional "Traffic © TomTom" credit |

The Worker side is in `worker/src/traffic/` (gate, usage ledger, `TrafficUsage` Durable Object, tests). In the first release
`worker/src/index.ts` neither routes `/api/traffic/*` nor exports `TrafficUsage`, and `wrangler.jsonc` has no binding or migration
(`worker/src/deploy-config.test.ts` enforces both).

## To bring it back (a later release, each step approved separately)

1. Resolve TomTom's terms, attribution text and name approval, and approve the user-facing wording.
2. Worker: route `/api/traffic/*` to `handleTraffic` and export `TrafficUsage` from `worker/src/index.ts`; add the binding and
   migration v1 to `wrangler.jsonc` (exact config in `docs/LIVE-TRAFFIC-RESEARCH.md`); update `deploy-config.test.ts`.
3. App: move `status.ts` into `trafficService.ts`; add the traffic source and layers to the map (`style.ts`, `MapView.tsx`, with
   tile errors reported to the Routes view, not as a base-map failure); add the switch to the Routes panel and Routes settings;
   show the credit only while traffic is drawn; add the Settings source entry and privacy line.
4. Set the key secret and the R2 control object, then deploy.
