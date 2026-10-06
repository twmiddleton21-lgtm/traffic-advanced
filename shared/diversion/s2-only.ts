import type { ScheduledClosureEvent } from "../sources/nh-arcgis/normalise.ts";
import { classify, type Classification } from "./classify.ts";
import { A_LABEL, situationIdFromEventNumber, specificDiversionStatements, type AEvaluation } from "./evaluate-a.ts";
import type { BEvaluation } from "./evaluate-b.ts";

/**
 * S2-only closures (SPECIFICATION §5.3, approved decision D3): S2 events with no S1 situation. Shown as official NH
 * closure records with source "nh-s2". A only from the record's own specific text; never B; otherwise D.
 */

export interface S2OnlyEvent {
  source: "nh-s2";
  eventNumber: string;
  road: string;
  description: string;
  /** S2 rows (occurrences or sub-closures) under this event. More than one means the text covers several closures. */
  closureCount: number;
  occurrences: { start: string | null; end: string | null }[];
}

/** Groups S2 rows by event number and keeps events whose NH identifier has no S1 situation. Unparseable numbers are kept (no link). */
export function findS2OnlyEvents(rows: ScheduledClosureEvent[], s1SituationIds: ReadonlySet<string>): S2OnlyEvent[] {
  const byEvent = new Map<string, S2OnlyEvent>();
  for (const row of rows) {
    const situationId = situationIdFromEventNumber(row.eventNumber);
    if (situationId !== null && s1SituationIds.has(situationId)) continue;
    const event = byEvent.get(row.eventNumber) ?? {
      source: "nh-s2" as const,
      eventNumber: row.eventNumber,
      road: row.road,
      description: row.description,
      closureCount: 0,
      occurrences: [],
    };
    event.closureCount++;
    event.occurrences.push({ start: row.start, end: row.end });
    byEvent.set(row.eventNumber, event);
  }
  return [...byEvent.values()];
}

const NEVER_B: BEvaluation = {
  outcome: "D",
  failed: "E5",
  reason: "S2-only closure: the record has no Network Model link evidence, so an official route can never be matched (B).",
};

export function classifyS2Only(event: S2OnlyEvent): Classification {
  const statements = specificDiversionStatements(event.description);
  const a: AEvaluation =
    statements.length > 0
      ? { outcome: "A", label: A_LABEL, eventNumber: event.eventNumber, text: event.description, statements, basis: "own-s2-record" }
      : { outcome: "none", reason: "The S2 record's own text has no specific diversion statement." };
  return classify("nh-s2", a, NEVER_B);
}
