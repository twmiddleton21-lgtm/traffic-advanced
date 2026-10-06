/**
 * Builds fixtures/s1/split-situation-pages.json from a raw S1 planned capture: the smallest situation
 * that NH split across 3+ pages, keeping only that situation on each page (real data, trimmed).
 * Usage: node scripts/fixtures/extract-s1-split-situation.ts data/raw/<capture>-nh-api
 */
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

interface Page {
  body: { D2Payload: { publicationTime: string; situation: { idG: string; situationRecord: unknown[] }[] } };
}

const captureDir = process.argv[2];
if (!captureDir) throw new Error("Usage: extract-s1-split-situation.ts <capture dir>");

const files = (await readdir(join(captureDir, "s1"))).filter((f) => f.startsWith("s1-planned-page")).sort();
const pages = await Promise.all(files.map(async (f) => JSON.parse(await readFile(join(captureDir, "s1", f), "utf8")) as Page));

const appearances = new Map<string, { pageIndex: number; records: number }[]>();
pages.forEach((page, pageIndex) => {
  for (const s of page.body.D2Payload.situation) {
    appearances.set(s.idG, [...(appearances.get(s.idG) ?? []), { pageIndex, records: s.situationRecord.length }]);
  }
});

const candidates = [...appearances.entries()]
  .filter(([, seen]) => seen.length >= 3)
  .map(([id, seen]) => ({ id, total: seen.reduce((n, s) => n + s.records, 0), pages: seen.map((s) => s.pageIndex) }))
  .sort((a, b) => a.total - b.total);
const chosen = candidates[0];
if (!chosen) throw new Error("No situation split across 3+ pages in this capture.");

const fixture = {
  description: "Real S1 planned capture: one situation split across pages with disjoint record subsets.",
  capturedFrom: captureDir.replaceAll("\\", "/").split("/").pop(),
  situationId: chosen.id,
  expectedRecordCount: chosen.total,
  pages: chosen.pages.map((pageIndex) => {
    const payload = pages[pageIndex]!.body.D2Payload;
    return { D2Payload: { ...payload, situation: payload.situation.filter((s) => s.idG === chosen.id) } };
  }),
};
await mkdir("fixtures/s1", { recursive: true });
await writeFile("fixtures/s1/split-situation-pages.json", JSON.stringify(fixture, null, 1));
console.log(`Situation ${chosen.id}: ${chosen.total} records across pages ${chosen.pages.join(", ")}`);
