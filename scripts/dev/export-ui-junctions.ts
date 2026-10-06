/**
 * Exports numbered junctions for the map (web/src/data/dev-junctions.json) from a development capture of the NH Network Model
 * (S5), using the same builder as the API publisher (scripts/lib/snapshot-builder.ts). Bundled only into development builds.
 * Map context only: nothing here touches matching or classification.
 * Usage: node scripts/dev/export-ui-junctions.ts data/raw/<open capture>
 */
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { JUNCTION_PROVENANCE_NOTES, junctionsSnapshot } from "../lib/snapshot-builder.ts";

const [openDir] = process.argv.slice(2);
if (!openDir) throw new Error("Usage: export-ui-junctions.ts <open capture>");

const manifest = JSON.parse(await readFile(join(openDir, "manifest.json"), "utf8")) as { startedAt?: string; capturedAt?: string };
const { snapshot, skipped } = await junctionsSnapshot(
  openDir,
  {
    kind: "development-snapshot",
    label: "Development snapshot",
    capturedAt: manifest.startedAt ?? manifest.capturedAt ?? "",
    sources: ["National Highways Network Model"],
    notes: JUNCTION_PROVENANCE_NOTES,
  },
  new Date().toISOString(),
);
await writeFile("web/src/data/dev-junctions.json", JSON.stringify(snapshot));
console.log(`Exported ${snapshot.junctions.length} junctions; skipped ${skipped.length}:`);
for (const s of skipped) console.log(`  ${s}`);
