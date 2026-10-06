/**
 * P0 capture of the keyed National Highways APIs (see docs/DATA-SOURCES.md):
 *   S1 Road and Lane Closures v2.0 (planned + unplanned), S6 Speed Managed Areas v1.0 (planned + unplanned).
 * The key is read from .dev.vars (git-ignored) as NH_API_KEY, sent only in the Ocp-Apim-Subscription-Key header,
 * and never logged or saved. Output: data/raw/<timestamp>-nh-api/ + manifest.json. Run: npm run capture:nh
 */
import { CaptureRun } from "../lib/capture-store.ts";
import { assertKeyNotSaved, loadNhKey } from "../lib/nh-key.ts";
import { fetchWithRetry, sleep } from "../lib/http.ts";

const API = "https://api.data.nationalhighways.co.uk";
const RATE_LIMIT_SPACING_MS = 6_500; // documented limit: 10 calls per minute per key
const MAX_PAGES = 200;

/** The API expects ISO 8601 without zone (e.g. 2023-07-21T17:32:28). Whether it reads UTC or UK time is unverified: P0 checks. */
const isoNoZone = (date: Date): string => date.toISOString().slice(0, 19);
const hoursFromNow = (hours: number): Date => new Date(Date.now() + hours * 3_600_000);

interface Query {
  name: string;
  path: string;
  params: Record<string, string>;
}

function queries(): Query[] {
  const planned = { startDateTime: isoNoZone(hoursFromNow(-24)), endDateTime: isoNoZone(hoursFromNow(24 * 14)) };
  const unplanned = { startDateTime: isoNoZone(hoursFromNow(-48)), endDateTime: isoNoZone(hoursFromNow(1)) };
  return [
    { name: "s1-planned", path: "/roads/v2.0/closures", params: { closureType: "planned", ...planned } },
    { name: "s1-unplanned", path: "/roads/v2.0/closures", params: { closureType: "unplanned", ...unplanned } },
    { name: "s6-planned", path: "/sma/v1.0/speedManagedAreas", params: { speedRestrictionType: "planned", ...planned } },
    { name: "s6-unplanned", path: "/sma/v1.0/speedManagedAreas", params: { speedRestrictionType: "unplanned", ...unplanned } },
  ];
}

async function captureQuery(run: CaptureRun, key: string, query: Query): Promise<string | null> {
  let url: string | null = `${API}${query.path}?${new URLSearchParams(query.params).toString()}`;
  const firstUrl = url;
  let page = 0;
  let total = 0;
  while (url && page < MAX_PAGES) {
    const fetchedAt = new Date().toISOString();
    const response = await fetchWithRetry(url, {
      headers: { "Ocp-Apim-Subscription-Key": key, "X-Response-MediaType": "application/json", "X-Data-Format": "DATEXII" },
    });
    const body = await response.text();
    const next = response.headers.get("x-next");
    const responseHeaders = Object.fromEntries(
      [...response.headers.entries()].filter(([name]) => !/key|auth|cookie|subscription/i.test(name)),
    );
    await run.writeJson(
      `${query.name.slice(0, 2)}/${query.name}-page${String(page).padStart(3, "0")}.json`,
      { request: { url, params: query.params }, responseHeaders, body: JSON.parse(body) as unknown },
      { source: query.name.slice(0, 2).toUpperCase(), url, fetchedAt, notes: `${body.length} bytes; x-next ${next ? "present" : "absent"}` },
    );
    total += body.length;
    page++;
    url = next ? new URL(next, API).toString() : null;
    if (url) await sleep(RATE_LIMIT_SPACING_MS);
  }
  console.log(`${query.name}: ${page} page(s), ${total} bytes`);
  if (page >= MAX_PAGES && url) return `${query.name}: stopped at MAX_PAGES (${firstUrl})`;
  return null;
}

const key = loadNhKey();
const run = new CaptureRun(process.cwd(), "nh-api");
const problems: string[] = [];
for (const [index, query] of queries().entries()) {
  if (index > 0) await sleep(RATE_LIMIT_SPACING_MS);
  try {
    const problem = await captureQuery(run, key, query);
    if (problem) problems.push(problem);
  } catch (error) {
    problems.push(`${query.name}: ${String(error)}`);
    console.error(`${query.name} FAILED: ${String(error)}`);
  }
}
const manifest = await run.writeManifest({ problems, timeParameterAssumption: "UTC, formatted without zone (unverified)" });
await assertKeyNotSaved(run.dir, key);
console.log(`\nManifest: ${manifest}`);
if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
  process.exitCode = 1;
}
