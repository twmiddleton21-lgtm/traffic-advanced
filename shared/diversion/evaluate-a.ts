import { normaliseRoad } from "../sources/nh-arcgis/normalise.ts";
import { A_TEXT_RULES } from "./rules.ts";

/**
 * Classification A (SPECIFICATION §5.3, approved decision D1): S2 diversion text linked to the S1 situation by
 * National Highways' shared event identifier, naming a specific road or signage symbol.
 */

export const A_LABEL = "Official diversion information for this roadworks event";

/** S2 `formattedeventnumber` "00435300-001" → S1 situation id "435300". Null if the format is not NH's. */
export function situationIdFromEventNumber(eventNumber: string): string | null {
  const match = /^(\d+)-\d+$/.exec(eventNumber.trim());
  return match ? String(Number(match[1])) : null;
}

/** Returns the specific diversion statements found in official text (verbatim), or [] if only generic/no statements. */
export function specificDiversionStatements(text: string): string[] {
  const statements = text.match(new RegExp(A_TEXT_RULES.diversionStatement.source, "gi")) ?? [];
  return statements
    .map((s) => s.trim())
    .filter((s) => A_TEXT_RULES.specificRoad.test(s) || A_TEXT_RULES.signageSymbol.test(s));
}

export interface S2Event {
  eventNumber: string;
  road: string;
  description: string;
}

export type AEvaluation =
  | {
      outcome: "A";
      label: typeof A_LABEL;
      eventNumber: string;
      text: string;
      statements: string[];
      /** How the text is tied to the closure: NH's shared S1/S2 event id, or the closure's own S2 record. */
      basis: "shared-event-id" | "own-s2-record";
    }
  | { outcome: "none"; reason: string; genericNote?: string };

/** A requires the explicit NH identifier link and road agreement. No other join may produce A. */
export function evaluateA(situationId: string, closureRoad: string, events: S2Event[]): AEvaluation {
  const linked = events.filter((e) => situationIdFromEventNumber(e.eventNumber) === situationId);
  if (linked.length === 0) return { outcome: "none", reason: "No S2 event shares this situation's NH identifier." };
  const sameRoad = linked.filter((e) => normaliseRoad(e.road) === closureRoad);
  if (sameRoad.length === 0) return { outcome: "none", reason: "Linked S2 event is on a different road." };
  const descriptions = [...new Set(sameRoad.map((e) => e.description))];
  for (const description of descriptions) {
    const statements = specificDiversionStatements(description);
    if (statements.length > 0) {
      return { outcome: "A", label: A_LABEL, eventNumber: sameRoad[0]!.eventNumber, text: description, statements, basis: "shared-event-id" };
    }
  }
  const generic = descriptions.find((t) => A_TEXT_RULES.diversionStatement.test(t));
  return generic
    ? { outcome: "none", reason: "Only a generic diversion statement.", genericNote: generic }
    : { outcome: "none", reason: "Linked S2 text has no diversion statement." };
}
