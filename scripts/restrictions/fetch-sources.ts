/**
 * Downloads the restriction source files into data/raw/restrictions/<stamp>/ (git-ignored), with a manifest recording each file's
 * URL, fetch time, size, SHA-256 and the server's Last-Modified/ETag. Nothing is published: build-restrictions.ts turns a reviewed
 * download into the app's static data files. See docs/RESTRICTIONS.md for the sources, their licences and the update procedure.
 *
 *   node scripts/restrictions/fetch-sources.ts [--only tfl|osm] [--overpass <interpreter URL>] [--into <folder to resume>]
 *
 * National Highways restriction records are not fetched here: the build reads them from an existing open-data capture
 * (scripts/capture/capture-open.ts), so this script never touches NH services.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { request } from "node:https";
import { join } from "node:path";
import { fetchWithRetry, sleep } from "../lib/http.ts";

const TFL = "https://s3-eu-west-1.amazonaws.com/roads.data.tfl.gov.uk";
/** The main public Overpass instance; --overpass <url> picks another public instance from the OSM wiki when it is overloaded. */
const OVERPASS = process.argv.includes("--overpass") ? process.argv[process.argv.indexOf("--overpass") + 1]! : "https://overpass-api.de/api/interpreter";
const USER_AGENT = "TrafficAdvanced-restrictions-build/1.0 (+https://github.com/twmiddleton21-lgtm)";

interface Download {
  id: string;
  file: string;
  url: string;
  group: "tfl" | "osm";
  bbox?: string;
}

/** south, west, north, east. Together they cover England (-6.5..1.9 E, 49.8..55.9 N); the query clips to England itself. */
const OSM_TILES: [number, number, number, number][] = [];
for (const [s, n] of [[49.8, 50.9], [50.9, 51.35], [51.35, 51.7], [51.7, 52.3], [52.3, 53.0], [53.0, 53.6], [53.6, 54.4], [54.4, 55.9]] as const) {
  for (const [w, e] of [[-6.5, -2.0], [-2.0, 0.0], [0.0, 1.9]] as const) OSM_TILES.push([s, w, n, e]);
}

const DOWNLOADS: Download[] = [
  { id: "tfl-height-restrictions", group: "tfl", file: "height-restrictions-in-london.xlsx", url: `${TFL}/BridgesRestrictions/height-restrictions-in-london.xlsx` },
  { id: "tfl-lez-boundary", group: "tfl", file: "lez.json", url: `${TFL}/Boundaries/lez.json` },
  { id: "tfl-ulez-boundary", group: "tfl", file: "ULEZ_Boundary_20230829.json", url: `${TFL}/Boundaries/ULEZ_Boundary_20230829.json` },
  {
    id: "gla-ulez-2023",
    group: "tfl",
    file: "LondonWideUltraLowEmissionZone.geojson",
    url: "https://data.london.gov.uk/download/vd455/0cab9a8b-ca8a-47b0-aaf8-0e77a9041a19/LondonWideUltraLowEmissionZone.geojson",
  },
  // England's boundary (ONS Countries December 2023, full resolution extent of the realm, simplified to 10 m by the service), in
  // British National Grid: the build keeps only OSM elements inside it.
  {
    id: "ons-england-boundary",
    group: "osm",
    file: "ons-england-bfe.json",
    url: "https://services1.arcgis.com/ESMARspQHYMw9BZ9/arcgis/rest/services/Countries_December_2023_Boundaries_UK_BFE/FeatureServer/0/query?where=CTRY23CD%3D%27E92000001%27&outFields=CTRY23CD,CTRY23NM&maxAllowableOffset=10&geometryPrecision=0&f=json",
  },
  // England's bounding box in tiles, one Overpass query each so no single query runs long (busier areas get smaller tiles).
  ...OSM_TILES.map(([s, w, n, e], i) => ({
    id: `osm-tile-${String(i + 1).padStart(2, "0")}`,
    group: "osm" as const,
    file: `osm-tile-${String(i + 1).padStart(2, "0")}.json`,
    url: OVERPASS,
    bbox: `${s},${w},${n},${e}`,
  })),
];

/**
 * One Overpass query over node:https (not fetch: Overpass can hold a request in its queue for longer than fetch's fixed five-minute
 * wait for response headers). Retried a few times on a busy server (429/504/timeouts), with a pause between attempts.
 */
async function overpass(query: string): Promise<{ status: number; headers: Headers; body: Buffer }> {
  const once = () =>
    new Promise<{ status: number; headers: Headers; body: Buffer }>((resolve, reject) => {
      const body = new URLSearchParams({ data: query }).toString();
      const req = request(
        OVERPASS,
        { method: "POST", headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded", "Content-Length": Buffer.byteLength(body) }, timeout: 15 * 60_000 },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () => {
            const headers = new Headers();
            for (const [k, v] of Object.entries(res.headers)) if (typeof v === "string") headers.set(k, v);
            resolve({ status: res.statusCode ?? 0, headers, body: Buffer.concat(chunks) });
          });
          res.on("error", reject);
        },
      );
      req.on("timeout", () => req.destroy(new Error("Overpass request timed out")));
      req.on("error", reject);
      req.end(body);
    });
  for (let attempt = 1; ; attempt++) {
    let detail: string;
    try {
      const r = await once();
      if (r.status === 200) return r;
      detail = `HTTP ${r.status}: ${r.body.toString("utf8").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").slice(0, 200)}`;
      if (r.status !== 429 && r.status !== 504) throw new Error(`Overpass ${detail}`);
    } catch (e) {
      if ((e as Error).message.startsWith("Overpass HTTP")) throw e;
      detail = (e as Error).message;
    }
    if (attempt >= 8) throw new Error(`Overpass failed after ${attempt} attempts: ${detail}`);
    console.log(`Overpass busy (${detail.slice(0, 120)}), retrying in 3 min`);
    await sleep(180_000);
  }
}

const sha256 = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

async function main() {
  const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1] : undefined;
  const stamp = new Date().toISOString().replace(/[:]/g, "").replace(/\.\d+Z$/, "Z");
  // --into <dir> resumes an interrupted download: files already listed in that folder's manifest are kept, not fetched again.
  const into = process.argv.includes("--into") ? process.argv[process.argv.indexOf("--into") + 1] : undefined;
  const dir = into ?? join("data", "raw", "restrictions", stamp);
  await mkdir(dir, { recursive: true });
  const entries: { id: string; [k: string]: unknown }[] = await readFile(join(dir, "manifest.json"), "utf8")
    .then((t) => (JSON.parse(t) as { entries: { id: string }[] }).entries)
    .catch(() => []);
  const save = () => writeFile(join(dir, "manifest.json"), `${JSON.stringify({ createdAt: new Date().toISOString(), entries }, null, 2)}\n`);
  for (const d of DOWNLOADS.filter((x) => (!only || x.group === only) && !entries.some((e) => e.id === x.id))) {
    const fetchedAt = new Date().toISOString();
    let headers: Headers;
    let bytes: Uint8Array;
    if (d.id.startsWith("osm-tile")) {
      const query = (await readFile(new URL("./osm-england.overpassql", import.meta.url), "utf8")).replaceAll("{{BBOX}}", d.bbox!);
      const r = await overpass(query);
      headers = r.headers;
      bytes = new Uint8Array(r.body);
    } else {
      const response = await fetchWithRetry(d.url, { headers: { "User-Agent": USER_AGENT }, timeoutMs: 120_000 });
      headers = response.headers;
      bytes = new Uint8Array(await response.arrayBuffer());
    }
    await writeFile(join(dir, d.file), bytes);
    entries.push({
      id: d.id,
      url: d.url,
      file: d.file,
      fetchedAt,
      bytes: bytes.length,
      sha256: sha256(bytes),
      lastModified: headers.get("last-modified"),
      etag: headers.get("etag"),
    });
    // Saved after every file, so an interrupted run can resume with --into.
    await save();
    console.log(`${d.id}: ${bytes.length} bytes`);
    // Be gentle with the shared Overpass service between regional queries.
    if (d.id.startsWith("osm-tile")) await sleep(10_000);
  }
  await save();
  console.log(`Saved to ${dir}`);
}

await main();
