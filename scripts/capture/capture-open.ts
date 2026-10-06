/**
 * P0 capture of the key-free National Highways sources (see docs/DATA-SOURCES.md):
 *   S2 Public Scheduled Road Closures, S3 7-day closure report (xlsx), S4 Diversion Routes, S5 Network Model.
 * Output: data/raw/<timestamp>-open/ (git-ignored) + manifest.json. Run: npm run capture:open
 */
import { CaptureRun } from "../lib/capture-store.ts";
import { queryAll } from "../lib/arcgis.ts";
import { fetchWithRetry } from "../lib/http.ts";

const ARCGIS = "https://services-eu1.arcgis.com/mZXeBXkkZpekxjXT/arcgis/rest/services";

const LAYERS: { source: string; file: string; url: string }[] = [
  { source: "S2", file: "s2/scheduled-closures.json", url: `${ARCGIS}/PublicScheduledRoadClosures/FeatureServer/0` },
  { source: "S4", file: "s4/closure-stretches.json", url: `${ARCGIS}/Diversion_Route_Data_Service_(Production_View)/FeatureServer/1` },
  { source: "S4", file: "s4/diversion-routes.json", url: `${ARCGIS}/Diversion_Route_Data_Service_(Production_View)/FeatureServer/2` },
  { source: "S4", file: "s4/diversion-points.json", url: `${ARCGIS}/Diversion_Route_Data_Service_(Production_View)/FeatureServer/3` },
  { source: "S5", file: "s5/nodes.json", url: `${ARCGIS}/Network_Model_Public_view2/FeatureServer/0` },
  { source: "S5", file: "s5/links.json", url: `${ARCGIS}/Network_Model_Public_view2/FeatureServer/1` },
  { source: "S5", file: "s5/vehicle-restrictions.json", url: `${ARCGIS}/Network_Model_Public_view2/FeatureServer/3` },
  { source: "S5", file: "s5/junctions.json", url: `${ARCGIS}/Network_Model_Public_view2/FeatureServer/14` },
  { source: "S5", file: "s5/junction-references.json", url: `${ARCGIS}/Network_Model_Public_view2/FeatureServer/15` },
  { source: "S5", file: "s5/vehicle-restriction-references.json", url: `${ARCGIS}/Network_Model_Public_view2/FeatureServer/22` },
];

const S3_PAGE = "https://nationalhighways.co.uk/roads-and-travel/live-travel-updates/road-closure-report/";

async function captureLayers(run: CaptureRun): Promise<string[]> {
  const problems: string[] = [];
  for (const layer of LAYERS) {
    const fetchedAt = new Date().toISOString();
    try {
      const { info, expectedCount, features } = await queryAll(layer.url);
      const lastEdit = info.editingInfo?.dataLastEditDate ?? info.editingInfo?.lastEditDate;
      await run.writeJson(
        layer.file,
        { layer: { id: info.id, name: info.name, fields: info.fields, editingInfo: info.editingInfo }, features },
        {
          source: layer.source,
          url: layer.url,
          fetchedAt,
          records: features.length,
          expectedRecords: expectedCount,
          ...(lastEdit === undefined ? {} : { sourceLastEditDate: new Date(lastEdit).toISOString() }),
        },
      );
      const status = features.length === expectedCount ? "ok" : `COUNT MISMATCH (expected ${expectedCount})`;
      if (features.length !== expectedCount) problems.push(`${layer.file}: ${status}`);
      console.log(`${layer.source} ${info.name}: ${features.length} records ${status}`);
    } catch (error) {
      problems.push(`${layer.file}: ${String(error)}`);
      console.error(`${layer.source} ${layer.file} FAILED: ${String(error)}`);
    }
  }
  return problems;
}

async function captureS3(run: CaptureRun): Promise<string[]> {
  const fetchedAt = new Date().toISOString();
  try {
    const page = await (await fetchWithRetry(S3_PAGE)).text();
    const href = /href="([^"]+\.xlsx)"/i.exec(page)?.[1];
    if (!href) return ["s3: no .xlsx link found on the closure report page"];
    const url = new URL(href, S3_PAGE).toString();
    const bytes = new Uint8Array(await (await fetchWithRetry(url)).arrayBuffer());
    await run.writeRaw("s3/7-day-closure-report.xlsx", bytes, { source: "S3", url, fetchedAt, notes: `${bytes.length} bytes` });
    console.log(`S3 closure report: ${bytes.length} bytes`);
    return [];
  } catch (error) {
    return [`s3: ${String(error)}`];
  }
}

const run = new CaptureRun(process.cwd(), "open");
const problems = [...(await captureLayers(run)), ...(await captureS3(run))];
const manifest = await run.writeManifest({ problems });
console.log(`\nManifest: ${manifest}`);
if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
  process.exitCode = 1;
}
