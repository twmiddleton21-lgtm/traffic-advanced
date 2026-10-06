import { z } from "zod";
import { provenanceSchema } from "./closures.ts";

/**
 * Map context: numbered junctions from the National Highways Network Model (S5 Junction + Junction_Reference + Node).
 * Labels are NH's own junction names, never derived. Each position is the centre of the junction's S5 nodes.
 * This is presentation context only; nothing in it affects closure matching or classification.
 */
export const junctionSchema = z.object({
  /** NH junction name, verbatim (e.g. "M53 J4", "A1(M) J6"). */
  name: z.string().min(1),
  /** Road part of the name ("M53"), for filtering and display. */
  road: z.string().min(1),
  /** Junction number part of the name ("4", "10A"). */
  number: z.string().min(1),
  /** [longitude, latitude] of the centre of the junction's NH nodes. */
  position: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
});

export const junctionsSnapshotSchema = z.object({
  provenance: provenanceSchema,
  generatedAt: z.string().refine((s) => !Number.isNaN(Date.parse(s)), "ISO date-time"),
  junctions: z.array(junctionSchema),
});

export type Junction = z.infer<typeof junctionSchema>;
export type JunctionsSnapshot = z.infer<typeof junctionsSnapshotSchema>;

/**
 * Splits an NH junction name into road and number, or null when the name carries no junction number:
 * "M53 J4" → M53 / "4", "M4 J8/9" → M4 / "8/9", "M6 TOLL T7" → M6 TOLL / "T7". Named junctions ("Almondsbury Interchange") → null.
 */
export function parseJunctionName(name: string): { road: string; number: string } | null {
  const numbered = /^(\S+) J(\d+[A-Z]?(?:\/\d+[A-Z]?)?)$/.exec(name.trim());
  if (numbered) return { road: numbered[1]!, number: numbered[2]! };
  const toll = /^(M6 TOLL) (T\d+[A-Z]?)$/.exec(name.trim());
  return toll ? { road: toll[1]!, number: toll[2]! } : null;
}
