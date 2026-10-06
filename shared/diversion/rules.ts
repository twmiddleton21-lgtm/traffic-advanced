/**
 * Every threshold and text rule used by diversion classification, in one place (SPECIFICATION §5).
 * Values marked P0-PROVISIONAL are not yet justified by a measured distribution: P0 must measure them before they're
 * frozen. Changing any value requires fixture evidence and the owner's sign-off (CLAUDE.md, Accuracy).
 */

/** Establishing a stretch's S5 link path from its routes (support for E5/E6). */
export const STRETCH_PATH_RULES = {
  /** Traced path length ÷ stretch geometry length must fall inside this band. P0-PROVISIONAL. */
  minLengthRatio: 0.8,
  maxLengthRatio: 1.25,
  /** Share of path vertices within `bufferMetres` of the stretch geometry. P0-PROVISIONAL. */
  minGeometryAgreement: 0.95,
  bufferMetres: 30,
} as const;

/**
 * E6 position precision (approved decision D9). NH distanceAlong values are integer metres measured by NH, compared with our geometric
 * link length (~1% error). Measured 2026-10-05 over 32,632 S1 elements ending in the last 10% of a link: toMetres − length p95 +5.2 m,
 * p99 +9.0 m, max +21.8 m. A closed section within this tolerance of a link end is treated as reaching that end's node. P0-PROVISIONAL.
 */
export const E6_POSITION_RULES = { endpointToleranceMetres: 10 } as const;

/** E7 spatial corroboration: share of closure points within `bufferMetres` of the stretch geometry. P0-PROVISIONAL. */
export const E7_RULES = { minCoverage: 0.9, bufferMetres: 30 } as const;

/**
 * E1 text gate over NH's own record comments. Text can only ever *disqualify* a closure (move it to D). It never
 * qualifies one on its own. Added in P0 because NH encodes layby, slip-road, access-road and traffic-light works with the
 * main carriageway "closed" (fixtures/matcher). PENDING OWNER APPROVAL as a tightening of E1.
 */
export const E1_TEXT_RULES = {
  /** At least one contributing record must state a carriageway/road closure. */
  closureStatement: /\bcarriageway\s+clos(?:ure|ed)\b|\bfull\s+(?:carriageway\s+)?closure\b|\broad\s+closure\b/i,
  /** Any contributing record mentioning one of these makes the closure ineligible. */
  disqualifiers: [
    /\bslip\b/i,
    /\blay-?by\b/i,
    /\baccess\s+road\b/i,
    /\bdepot\b/i,
    /\bservices\b/i,
    /\btraffic\s+lights?\b/i,
    /\blanes?\s+\d/i,
    /\bhard\s+shoulder\b/i,
    /\blink\s+road\b|\blink\b/i,
    /\bnarrow\s+lanes?\b/i,
  ],
} as const;

/** Class A (SPECIFICATION §5.3): a diversion statement naming a specific road or signage symbol. */
export const A_TEXT_RULES = {
  /** Non-global on purpose (no lastIndex state). Callers needing every match build a global copy. */
  diversionStatement: /\bdivers(?:ion|ions|ed)\b[^\n\r]*/i,
  specificRoad: /\b[ABM]\d{1,4}(?:\(M\))?\b/,
  signageSymbol: /\b(?:solid|hollow|filled|black|white)\s+(?:triangle|square|circle|diamond)\b/i,
} as const;

/**
 * HGV status of an official route. NH text saying a route is not for HGVs overrides an "all vehicles" classification
 * (found in P0: e.g. M6/J27/J26/1 "Non HGV Route" with Class 1A). Text can only make a route less suitable, never more.
 */
export const HGV_TEXT_RULES = {
  notForHgv: /non[\s-]*hgv|no\s+hgvs?\b|not\s+(?:suitable\s+)?for\s+hgvs?|unsuitable\s+for\s+hgvs?|hgvs?\s+(?:not|prohibited|unsuitable)|cars?\s+only|light\s+vehicles?\s+only/i,
} as const;
