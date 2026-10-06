import * as z from "zod";
import {
  arcgisCountSchema,
  arcgisErrorSchema,
  arcgisLayerInfoSchema,
  arcgisQueryPageSchema,
  type ArcgisFeature,
  type ArcgisLayerInfo,
} from "../../shared/sources/arcgis/schema.ts";
import { fetchWithRetry, sleep } from "./http.ts";

const POLITE_DELAY_MS = 300;

async function getJson<T>(url: string, schema: z.ZodType<T>): Promise<T> {
  const body: unknown = await (await fetchWithRetry(url)).json();
  const asError = arcgisErrorSchema.safeParse(body);
  if (asError.success) {
    throw new Error(`ArcGIS error ${asError.data.error.code}: ${asError.data.error.message} (${url})`);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new Error(`Unexpected ArcGIS response from ${url}:\n${z.prettifyError(parsed.error)}`);
  return parsed.data;
}

export const layerInfo = (layerUrl: string): Promise<ArcgisLayerInfo> =>
  getJson(`${layerUrl}?f=json`, arcgisLayerInfoSchema);

export interface QueryAllResult {
  info: ArcgisLayerInfo;
  expectedCount: number;
  features: ArcgisFeature[];
}

/**
 * Fetch every feature of a layer/table, paging by objectId order so pages are stable.
 * Geometry is requested in WGS84 (EPSG:4326) at 6 dp (~0.1 m).
 */
export async function queryAll(layerUrl: string, where = "1=1"): Promise<QueryAllResult> {
  const info = await layerInfo(layerUrl);
  const oid = info.objectIdField ?? "objectid";
  const pageSize = Math.min(info.maxRecordCount ?? 1000, 2000);
  const { count: expectedCount } = await getJson(
    `${layerUrl}/query?${new URLSearchParams({ where, returnCountOnly: "true", f: "json" }).toString()}`,
    arcgisCountSchema,
  );
  const features: ArcgisFeature[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const params = new URLSearchParams({
      where,
      outFields: "*",
      returnGeometry: info.geometryType ? "true" : "false",
      outSR: "4326",
      geometryPrecision: "6",
      orderByFields: `${oid} ASC`,
      resultOffset: String(offset),
      resultRecordCount: String(pageSize),
      f: "json",
    });
    const page = await getJson(`${layerUrl}/query?${params.toString()}`, arcgisQueryPageSchema);
    features.push(...page.features);
    if (page.features.length < pageSize && !page.exceededTransferLimit) break;
    await sleep(POLITE_DELAY_MS);
  }
  return { info, expectedCount, features };
}
