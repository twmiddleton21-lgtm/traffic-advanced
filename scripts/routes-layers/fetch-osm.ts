/**
 * Downloads one dated OpenStreetMap extract of England from Geofabrik into data/raw/routes-layers/<stamp>/ (git-ignored) for the
 * Routes map's layers, and records where it came from: the exact dated file, its size, Geofabrik's MD5 (checked), our SHA-256, the
 * server's Last-Modified, and Geofabrik's replication timestamp (the moment the extract's OSM data runs to). Nothing is published.
 *
 *   node scripts/routes-layers/fetch-osm.ts [--file england-YYMMDD.osm.pbf]
 *
 * Without --file it asks Geofabrik which dated file "england-latest" is today and downloads that dated file, so the manifest always
 * names a file that can be fetched again. Geofabrik updates the extract about once a day (download.geofabrik.de/technical.html); the
 * data is © OpenStreetMap contributors, ODbL 1.0. See docs/ROUTES-MAP.md for the whole update procedure.
 */
import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fetchWithRetry } from "../lib/http.ts";

const BASE = "https://download.geofabrik.de/europe/united-kingdom";
const USER_AGENT = "TrafficAdvanced-routes-layers-build/1.0 (+https://github.com/twmiddleton21-lgtm)";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** The dated file name "england-latest.osm.pbf" redirects to today, e.g. "england-261011.osm.pbf". */
async function latestDatedFile(): Promise<string> {
  const response = await fetch(`${BASE}/england-latest.osm.pbf`, { method: "HEAD", redirect: "manual", headers: { "User-Agent": USER_AGENT } });
  const location = response.headers.get("location");
  const name = location?.split("/").at(-1);
  if (!name || !/^england-\d{6}\.osm\.pbf$/.test(name)) throw new Error(`Geofabrik didn't name a dated England file (HTTP ${response.status}, location ${location ?? "none"})`);
  return name;
}

async function main() {
  const file = arg("--file") ?? (await latestDatedFile());
  if (!/^england-\d{6}\.osm\.pbf$/.test(file)) throw new Error(`Not a dated Geofabrik England file: ${file}`);
  const url = `${BASE}/${file}`;
  const stamp = new Date().toISOString().replace(/[:]/g, "").replace(/\.\d+Z$/, "Z");
  const dir = join("data", "raw", "routes-layers", stamp);
  await mkdir(dir, { recursive: true });

  const expectedMd5 = (await (await fetchWithRetry(`${url}.md5`, { headers: { "User-Agent": USER_AGENT } })).text()).trim().split(/\s+/)[0];
  if (!expectedMd5 || !/^[0-9a-f]{32}$/.test(expectedMd5)) throw new Error(`Unreadable MD5 for ${file}`);
  // The replication state of the extract the dated file was made from: "timestamp=2026-10-11T20\:21\:06Z".
  const state = await (await fetchWithRetry(`${BASE}/england-updates/state.txt`, { headers: { "User-Agent": USER_AGENT } })).text();

  const fetchedAt = new Date().toISOString();
  const response = await fetchWithRetry(url, { headers: { "User-Agent": USER_AGENT }, timeoutMs: 60 * 60_000, retries: 2 });
  const md5 = createHash("md5");
  const sha256 = createHash("sha256");
  let bytes = 0;
  const body = Readable.fromWeb(response.body as never);
  body.on("data", (chunk: Buffer) => {
    md5.update(chunk);
    sha256.update(chunk);
    bytes += chunk.length;
  });
  await pipeline(body, createWriteStream(join(dir, file)));
  const actualMd5 = md5.digest("hex");
  if (actualMd5 !== expectedMd5) throw new Error(`MD5 mismatch for ${file}: Geofabrik says ${expectedMd5}, downloaded ${actualMd5}`);

  const manifest = {
    createdAt: new Date().toISOString(),
    entries: [
      {
        id: "geofabrik-england",
        url,
        file,
        fetchedAt,
        bytes,
        md5: actualMd5,
        sha256: sha256.digest("hex"),
        lastModified: response.headers.get("last-modified"),
        // Geofabrik's latest state, recorded for reference; the extract's own header timestamp (read by the extractor) is authoritative.
        replicationState: state.trim().split("\n").filter((l) => !l.startsWith("#")),
        licence: "ODbL 1.0 (https://opendatacommons.org/licenses/odbl/1-0/), © OpenStreetMap contributors",
      },
    ],
  };
  await writeFile(join(dir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`${file}: ${bytes} bytes, MD5 checked. Saved to ${dir}`);
}

await main();
