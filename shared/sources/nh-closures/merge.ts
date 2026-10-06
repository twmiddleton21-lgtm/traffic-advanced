import * as z from "zod";

/**
 * S1 (Road and Lane Closures v2.0) paging behaviour, verified 2026-10-05 (docs/P0-REPORT.md):
 * a large situation is split across pages, each page carrying a disjoint subset of its records,
 * so pages must be merged by situation id with records unioned by record id. Deduplicating
 * situations by id would silently drop records.
 */

const recordSchema = z.looseObject({ idG: z.string(), versionG: z.string() });

const situationSchema = z.looseObject({
  idG: z.string(),
  situationVersionTime: z.string(),
  situationRecord: z.array(z.record(z.string(), recordSchema)),
});

export const s1PageBodySchema = z.object({
  D2Payload: z.looseObject({
    publicationTime: z.string(),
    situation: z.array(situationSchema),
  }),
});

export type S1Record = z.infer<typeof recordSchema>;

export interface MergedSituation {
  id: string;
  versionTime: string;
  /** Records keyed by record id, each tagged with its DATEX II record type (e.g. sitRoadOrCarriagewayOrLaneManagement). */
  records: Map<string, { type: string; record: S1Record }>;
}

export interface MergeResult {
  situations: Map<string, MergedSituation>;
  /** Same record id seen with different content on different pages. Never resolved silently. */
  conflicts: string[];
}

export function mergeS1Pages(pages: unknown[]): MergeResult {
  const situations = new Map<string, MergedSituation>();
  const seen = new Map<string, string>();
  const conflicts: string[] = [];
  for (const page of pages) {
    for (const situation of s1PageBodySchema.parse(page).D2Payload.situation) {
      let merged = situations.get(situation.idG);
      if (!merged) {
        merged = { id: situation.idG, versionTime: situation.situationVersionTime, records: new Map() };
        situations.set(situation.idG, merged);
      }
      // ISO 8601 UTC strings with identical format compare correctly as strings.
      if (situation.situationVersionTime > merged.versionTime) merged.versionTime = situation.situationVersionTime;
      for (const wrapper of situation.situationRecord) {
        for (const [type, record] of Object.entries(wrapper)) {
          const serialised = JSON.stringify(record);
          const previous = seen.get(record.idG);
          if (previous !== undefined && previous !== serialised) conflicts.push(record.idG);
          seen.set(record.idG, serialised);
          merged.records.set(record.idG, { type, record });
        }
      }
    }
  }
  return { situations, conflicts };
}
