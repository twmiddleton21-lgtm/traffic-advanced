/**
 * P0 experiment: are S1 startDateTime/endDateTime inputs read as UTC or as UK local time (BST in October)?
 * Queries one narrow window and compares returned record ids with two predictions built from an earlier full
 * capture: records active during the window read as UTC, and during the window read as BST (UTC+1).
 * Usage: node scripts/analysis/check-time-semantics.ts <nh-api capture dir> <YYYY-MM-DDThh:mm:ss> <minutes>
 * Saves the response under <capture>/analysis/time-semantics/ (git-ignored). Never prints the key.
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { mergeS1Pages } from "../../shared/sources/nh-closures/merge.ts";
import { normaliseSituation } from "../../shared/sources/nh-closures/normalise.ts";
import { fetchWithRetry, sleep } from "../lib/http.ts";
import { assertKeyNotSaved, loadNhKey } from "../lib/nh-key.ts";

const [captureDir, windowStart, minutesArg] = process.argv.slice(2);
if (!captureDir || !windowStart || !minutesArg) throw new Error("Usage: check-time-semantics.ts <capture dir> <start> <minutes>");
const minutes = Number(minutesArg);
const iso = (d: Date): string => d.toISOString().slice(0, 19);
const asUtc = new Date(`${windowStart}Z`);
const windowEnd = iso(new Date(asUtc.getTime() + minutes * 60_000));

// Predictions from the earlier full capture.
const files = (await readdir(join(captureDir, "s1"))).filter((f) => f.startsWith("s1-planned-page")).sort();
const pages = await Promise.all(files.map(async (f) => (JSON.parse(await readFile(join(captureDir, "s1", f), "utf8")) as { body: unknown }).body));
const records = [...mergeS1Pages(pages).situations.values()].flatMap((s) => normaliseSituation(s).records);
const activeDuring = (fromMs: number, toMs: number): Set<string> =>
  new Set(records.filter((r) => Date.parse(r.start) < toMs && Date.parse(r.end) > fromMs).map((r) => r.recordId));
const utcPrediction = activeDuring(asUtc.getTime(), asUtc.getTime() + minutes * 60_000);
const bstPrediction = activeDuring(asUtc.getTime() - 3_600_000, asUtc.getTime() - 3_600_000 + minutes * 60_000);

// The live query.
const key = loadNhKey();
const outDir = join(captureDir, "analysis", "time-semantics");
await mkdir(outDir, { recursive: true });
let url: string | null = `https://api.data.nationalhighways.co.uk/roads/v2.0/closures?${new URLSearchParams({
  closureType: "planned",
  startDateTime: windowStart,
  endDateTime: windowEnd,
}).toString()}`;
const returned = new Set<string>();
for (let page = 0; url && page < 50; page++) {
  const response = await fetchWithRetry(url, { headers: { "Ocp-Apim-Subscription-Key": key, "X-Response-MediaType": "application/json" } });
  const body: unknown = await response.json();
  await writeFile(join(outDir, `page${String(page).padStart(3, "0")}.json`), JSON.stringify({ request: url, body }));
  for (const s of mergeS1Pages([body]).situations.values()) for (const id of s.records.keys()) returned.add(id);
  const next = response.headers.get("x-next");
  url = next ? new URL(next, "https://api.data.nationalhighways.co.uk").toString() : null;
  if (url) await sleep(6_500);
}
await assertKeyNotSaved(outDir, key);

const compare = (prediction: Set<string>) => {
  const both = [...returned].filter((id) => prediction.has(id)).length;
  return { predicted: prediction.size, returned: returned.size, inBoth: both, jaccard: both / (returned.size + prediction.size - both || 1) };
};
const result = {
  queriedAt: new Date().toISOString(),
  window: { startDateTime: windowStart, endDateTime: windowEnd },
  ifUtc: compare(utcPrediction),
  ifBst: compare(bstPrediction),
  note: "Records created or changed since the reference capture can make both comparisons imperfect; the better-agreeing reading is the evidence.",
};
await writeFile(join(outDir, "result.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
