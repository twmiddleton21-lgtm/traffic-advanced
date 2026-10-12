import { highlightFileName, type RoutesHighlightLayer } from "../../../shared/api/routes-highlights.ts";
import { ROUTES_DATA_LAYERS, routesManifestSchema, type RoutesDataLayer, type RoutesManifest } from "../../../shared/api/routes-layers.ts";

/**
 * Which Routes map layers this build has data for (the catalogue from scripts/routes-layers/build-routes-layers.ts, bundled), and the
 * URL of each layer's file. The files are separate, content-hashed assets (Vite `?url`), so the app downloads one only when its
 * layer is switched on, and a new build's data never mixes with an old one's. Kept apart from the Closures view's restriction
 * catalogue (web/src/restrictions/catalog.ts), which it never reads.
 *
 * The data is generated, not kept in the repository (docs/ROUTES-MAP.md, "Generated data"): a build without it simply offers no
 * OpenStreetMap layers. So the catalogue is found the same way as the files (a glob), and is optional.
 */
const urls = import.meta.glob<string>(["./data/*.json", "!./data/manifest.json"], { query: "?url", import: "default", eager: true });
const manifests = import.meta.glob<unknown>("./data/manifest.json", { import: "default", eager: true });

export const routesManifest: RoutesManifest | null = (() => {
  const raw = manifests["./data/manifest.json"];
  if (raw === undefined) return null;
  const parsed = routesManifestSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
})();

export interface RoutesLayerEntry {
  layer: RoutesDataLayer;
  url: string;
  records: number;
  notes: string[];
  /** The layer's road highlighting file, when it has one (restriction layers only; scripts/routes-layers/build-highlights.ts). */
  roadsUrl: string | null;
}

const HIGHLIGHTED = new Set<string>(["height", "weight", "width-length", "access"]);

/** The layers with data in this build, in the panel's order. A layer without a file or catalogue entry has no switch. */
export function availableRoutesLayers(m: RoutesManifest | null = routesManifest, files: Record<string, string> = urls): RoutesLayerEntry[] {
  if (!m) return [];
  return ROUTES_DATA_LAYERS.flatMap((layer) => {
    const entry = m.layers[layer];
    const url = entry ? files[`./data/${entry.file}`] : undefined;
    const roadsUrl = HIGHLIGHTED.has(layer) ? (files[`./data/${highlightFileName(layer as RoutesHighlightLayer)}`] ?? null) : null;
    return entry && url ? [{ layer, url, records: entry.records, notes: entry.notes, roadsUrl }] : [];
  });
}
