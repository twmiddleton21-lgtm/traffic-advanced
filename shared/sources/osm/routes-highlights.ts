import { STRONG_WEIGHT_LIMIT_TONNES, type RoutesHighlightCategory, type RoutesHighlightLayer, type RoutesHighlightRoad } from "../../api/routes-highlights.ts";
import type { RoutesPoint } from "../../api/routes-layers.ts";

/**
 * Road highlighting from a layer's existing records (shared/api/routes-highlights.ts). It reads no tags and makes no judgement of its
 * own: each record that was read from a road (its first OSM element is a way) gets that road's line, with a category from the record's
 * own kind and value. A record from a point, a road missing from the extract, or a road with a node missing (cut at the extract's
 * edge) gets no line, and is reported.
 */
export interface WayGeometry {
  id: number;
  geometry: (readonly [number, number] | null)[];
}

const round5 = (n: number) => Math.round(n * 1e5) / 1e5;

export function highlightCategory(layer: RoutesHighlightLayer, record: RoutesPoint): RoutesHighlightCategory | null {
  if (layer === "weight") {
    if (record.value?.type !== "measure" || record.value.unit !== "t") return null;
    return record.value.amount <= STRONG_WEIGHT_LIMIT_TONNES ? "weight-strong" : "weight-soft";
  }
  return layer;
}

export function readHighlights(layer: RoutesHighlightLayer, records: RoutesPoint[], ways: Map<number, WayGeometry>): { roads: RoutesHighlightRoad[]; skipped: { id: string; reason: string }[] } {
  const roads: RoutesHighlightRoad[] = [];
  const skipped: { id: string; reason: string }[] = [];
  for (const r of records) {
    const element = r.osm[0]!;
    if (element.type !== "way") continue; // a point restriction: its marker is all there is
    const way = ways.get(element.id);
    if (!way) {
      skipped.push({ id: r.id, reason: "road not in the extract" });
      continue;
    }
    if (way.geometry.length < 2 || way.geometry.some((g) => g === null)) {
      skipped.push({ id: r.id, reason: "road geometry incomplete" });
      continue;
    }
    const category = highlightCategory(layer, r);
    if (!category) {
      skipped.push({ id: r.id, reason: "no value to categorise" });
      continue;
    }
    // Consecutive points closer than about 1 m (5 decimal places) are merged; the line keeps its shape.
    const line: [number, number][] = [];
    for (const g of way.geometry as (readonly [number, number])[]) {
      const p: [number, number] = [round5(g[0]), round5(g[1])];
      const last = line.at(-1);
      if (!last || last[0] !== p[0] || last[1] !== p[1]) line.push(p);
    }
    if (line.length < 2) {
      skipped.push({ id: r.id, reason: "road shorter than a metre" });
      continue;
    }
    roads.push({ id: r.id, category, conditional: r.conditionalOnly || r.conditions.length > 0, line });
  }
  roads.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return { roads, skipped };
}
