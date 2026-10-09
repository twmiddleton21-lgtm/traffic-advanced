import { restrictionsManifestSchema, type RestrictionSource, type RestrictionsManifest } from "../../../shared/api/restrictions.ts";
import type { RestrictionLayer } from "../settings/preferences.ts";
import manifestJson from "./data/manifest.json";

/**
 * Which restriction layers this build has data for (the catalogue from scripts/restrictions/build-restrictions.ts, bundled), and the
 * URL of each layer's data file. The files themselves are separate, content-hashed assets (Vite `?url`), so the app downloads one
 * only when its layer is switched on, and a new build's data never mixes with an old build's.
 */
const urls = import.meta.glob<string>(["./data/*.json", "!./data/manifest.json"], { query: "?url", import: "default", eager: true });

export const manifest: RestrictionsManifest | null = (() => {
  const parsed = restrictionsManifestSchema.safeParse(manifestJson);
  return parsed.success ? parsed.data : null;
})();

export interface LayerEntry {
  layer: RestrictionLayer;
  url: string;
  records: number;
  sources: RestrictionSource[];
}

/** The layers with data in this build, in display order. A layer without a file or catalogue entry has no switch. */
export function availableLayers(m: RestrictionsManifest | null = manifest, files: Record<string, string> = urls): LayerEntry[] {
  if (!m) return [];
  const order: RestrictionLayer[] = ["height", "weight", "lez", "ulez"];
  return order.flatMap((layer) => {
    const entry = m.layers[layer];
    const url = entry ? files[`./data/${entry.file}`] : undefined;
    return entry && url && entry.records > 0 ? [{ layer, url, records: entry.records, sources: entry.sources }] : [];
  });
}

/** Every distinct source across the available layers, for the attribution list in Settings. */
export function allSources(entries: LayerEntry[] = availableLayers()): RestrictionSource[] {
  const byId = new Map<string, RestrictionSource>();
  for (const e of entries) for (const s of e.sources) byId.set(s.id, s);
  return [...byId.values()];
}
