# Ingestion: National Highways → R2 → Worker

How a National Highways capture becomes the snapshot the Worker serves. Status (2026-10-05): **implemented and tested locally;
automated scheduling NOT enabled; nothing deployed.** The Day-1 development snapshot remains the served data.

## Flow

```
rules-freeze → capture → capture-check → pin → matcher → re-pin → publish → upload (pointer last)
```

| Stage | What it does | Fails closed when |
|---|---|---|
| rules-freeze | Every frozen matcher file must match `fixtures/p0/rules-freeze.json` (`assertRulesFrozen`) | any frozen file changed: nothing is captured |
| capture | Runs the existing `scripts/capture/capture-open.ts` and `capture-nh-api.ts` unchanged (or reuses given folders) | a script exits non-zero (it logged a problem) or reports no manifest |
| capture-check | `assertCompleteCapture`: no logged problems, every dataset has the record count its source reported | partial upstream failure |
| pin | SHA-256 of every capture file (`hashCapture`, the held-out pinning) | |
| matcher | The **frozen** matcher via `runMatcher`, mapped to the contracts (`buildApiSnapshots`) | parse or matcher error |
| re-pin | The capture files must hash the same after the matcher read them | a file changed mid-run |
| publish | `publishSnapshot` into the publication store: contracts, integrity checks, replacement checks, SHA-256 read-back; `current.json` last | schema, integrity, older data, empty data, **50% drop**, read-back mismatch |
| upload | `uploadPublished` to R2: re-verifies SHA-256s and integrity, applies the replacement checks against what **the bucket** serves, uploads, reads back, then switches `current.json` last | any upload or read-back failure; the bucket's pointer is untouched |

Every failure is recorded in the store's `meta.json` (`lastAttemptAt`, `lastError`, `lastSuccessAt`) and the served snapshot stays
current. Code: `scripts/lib/ingest.ts` (orchestration only, no matching logic), `worker/src/publish.ts`, `scripts/lib/r2-upload.ts`.

### 50% snapshot-drop safeguard (approved 2026-10-05)

`PUBLISH_RULES.minRetainedFraction = 0.5` in `worker/src/publish.ts`. A candidate snapshot is **rejected if its closure count is
strictly less than 50% of the closure count currently served** (exactly half is accepted). The existing good snapshot stays current.
It is a publication-safety guard against partial upstream failures, **not a matcher rule**, and it never changes a classification.
It runs on the publish path and again against the bucket's current snapshot before `current.json` is replaced.

## Commands

| Purpose | Command | Needs |
|---|---|---|
| Run ingestion once (capture now → local bucket) | `npm run ingest:once` | `NH_API_KEY` in `.dev.vars` |
| Run once from existing captures (no NH requests) | `npm run ingest:once -- --open data/raw/<open> --api data/raw/<nh-api>` | nothing |
| Dry run (temporary copy of the store, no upload) | add `--dry-run` | |
| Publish only, upload later | add `--no-upload` (or `npm run api:publish -- <open> <nh-api>`) | |
| Upload a previously validated snapshot | `npm run api:upload` (local bucket) / `npm run api:upload -- --remote` (real bucket) | `--remote`: `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` |
| Serve it locally like production | `npm run worker:dev` | nothing |

Without `--remote`, every command works with **no Cloudflare credentials**: the local bucket is Wrangler's simulation used by
`wrangler dev`. `--remote` is never a default anywhere. The real bucket is reached through R2's S3-compatible API with a
bucket-scoped R2 API token ("Object Read & Write" on `traffic-advanced-snapshots`), signed with AWS Signature V4
(`scripts/lib/r2-upload.ts`). Wrangler's own `r2 object --remote` uses Cloudflare's REST API, which rejects bucket-scoped R2
tokens (401, code 9109: seen on the first Stage B run, 2026-10-06), so it is used only for the local bucket.

## Provenance

Each published snapshot carries enough to answer what produced it:

- `current.json` (the pointer): `version`, `capturedAt` (when NH data was fetched), `publishedAt`, closure count, `closuresSha256`,
  `junctionsSha256`, `pins` (rules-freeze hash, a digest per capture), `provenanceKey`, `provenanceSha256`.
- `snapshots/<version>/provenance.json`: the rules freeze (hash and reason), each capture's start/finish time and **SHA-256 of every
  capture file**, closures left out (quarantined) with reasons, and the snapshot's version, hashes and publication time.
- Whether it is current: the bucket's `current.json` names the current `version`; `meta.json` logs the last attempt and success.

## When ingestion stops working

Nothing replaces the last good snapshot: a failed run stops before `current.json`. The Worker keeps serving the last good snapshot
unchanged, and its `provenance.capturedAt` ages, so the UI moves from fresh to delayed (15 min) to "Offline/stale … Check official
sources." (60 min) on its own (SPECIFICATION §4). The API never relabels data as live; the provenance kind stays as published.
Verified locally on 2026-10-05: a capture reporting an upstream 503 failed at capture-check, the store and local bucket kept their
version, and `wrangler dev` kept serving it (565 minutes old, so stale).

## Scheduler: GitHub Actions (decided 2026-10-05)

`.github/workflows/ingest.yml`, manual dispatch only; **the schedule is commented out until the owner approves it.**

| | GitHub Actions | Cloudflare Worker Cron |
|---|---|---|
| Runs the existing tooling | Yes: Node 24, filesystem, the capture scripts and `runMatcher` unchanged | No: no filesystem; ~170 MB of capture JSON per run and the S5 network build would mean rewriting the pipeline for Workers, which the freeze forbids |
| Runtime limits | 6 h per job (we set 20 min); ~7 GB RAM (GitHub docs, **not verified** today) | Free: 10 ms CPU per request or cron run; Paid: 30 s default; 128 MB memory (Cloudflare Workers limits docs, verified 2026-10-05) |
| Secrets | Environment secrets (`ingest`), optional required reviewer | Wrangler secrets |
| Network | Unrestricted outbound | Outbound fetch allowed |
| Failure / retry | Job fails visibly; manual re-run in one click; `concurrency` prevents overlapping runs | Cron retries are limited; failures only in logs |
| Logging | Full job logs; `meta.json` and provenance kept as artifacts (90 days) | Workers logs / tail |
| Capture SHA-256s | Computed by the existing `hashCapture` | Would need reimplementing |
| Manual re-run | `workflow_dispatch` | Needs a trigger route or deploy |
| Cost | Free for public repositories; private repositories include 2,000 minutes/month on GitHub Free (verified 2026-10-05; see the cadence calculation) | Free plan, but the job can't run there |
| Operational simplicity | One workflow, the same commands as local | A second implementation of the pipeline |

The Worker stays the read-only API and static host; Actions is the only writer to the bucket.

### Cadence calculation (no schedule chosen; the schedule stays disabled)

Measured run time per stage (2026-10-05, from the capture manifests and local runs):

| Part of a run | Time | Source |
|---|---|---|
| Open capture (S2/S3/S4/S5, 11 requests) | 57–66 s | manifests of the two Day-1 open captures |
| NH API capture (S1/S6, 19 requests, 6.5 s apart for the 10 calls/min limit) | 125–126 s | manifests of the two Day-1 NH API captures |
| Freeze check, capture check, hashing, matcher, publish, local-bucket upload | 44 s | `ingest:once` on existing captures (this is the "44 s" figure: it excludes capturing) |
| Runner setup (checkout, Node, `npm ci`, freeze test) and remote upload | not measured | estimate 1–2 min, **unverified** until the first manual run |

So one full run is about 236 s (≈ 4 min) of measured work, plus unmeasured runner overhead: **≈ 4–6 min per run**. Minutes per month
= runs per day × minutes per run × 30:

| Interval | Runs/day | Minutes/day (4–6 min/run) | Minutes/month (30 days) |
|---|---|---|---|
| 5 min (GitHub's minimum) | 288 | 1,152–1,728 | ≈ 34,600–51,800 |
| 15 min | 96 | 384–576 | ≈ 11,500–17,300 |
| 30 min | 48 | 192–288 | ≈ 5,800–8,600 |
| 60 min | 24 | 96–144 | ≈ 2,900–4,300 |

GitHub facts, **verified 2026-10-05** from docs.github.com (billing for GitHub Actions; events that trigger workflows): standard
GitHub-hosted runners are free for public repositories; private repositories include 2,000 minutes/month on GitHub Free and 3,000 on
Pro/Team; Linux 2-core runners cost $0.006/minute beyond that; the shortest schedule interval is 5 minutes; scheduled runs "can be
delayed during periods of high loads", notably at the start of every hour; scheduled workflows in public repositories are disabled
after 60 days without repository activity. **Not verified:** how per-job minutes are rounded for billing.

Every interval in the table exceeds 2,000 minutes/month for a private repository on GitHub Free. Reusing the open capture between
runs (S4 changes daily, S5 weekly; SPECIFICATION §4) would remove ~1 minute per run but isn't implemented. Because scheduled runs can
start late, the UI's delayed/stale states (§4) are the real guarantee, not the schedule. SPECIFICATION §10 described a Worker cron; this
decision changes that, and the spec should be updated once approved.

## Before enabling automated ingestion

1. Owner approval of the cadence (and the GitHub repository/plan it runs on).
2. GitHub repository with environment `ingest` holding `NH_API_KEY` and, for remote runs only, `R2_ENDPOINT`
   (`https://<account id>.r2.cloudflarestorage.com`), `R2_ACCESS_KEY_ID` and `R2_SECRET_ACCESS_KEY` from a bucket-scoped R2 API
   token (Object Read & Write on `traffic-advanced-snapshots`); optional required reviewer.
3. The bucket exists and the Worker is deployed (first deployment).
4. One manual `remote` run, checked end to end, then uncomment the schedule.
5. Decide when published snapshots may be labelled live: the provenance kind is still `development-snapshot`, by design, until the
   owner signs off live operation (and the held-out P0 evaluation).
