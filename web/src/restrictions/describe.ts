import type { RestrictionPoint, RestrictionSource } from "../../../shared/api/restrictions.ts";
import { formatHeight } from "../domain/units.ts";

/**
 * Restriction wording, in one place. Values are shown as recorded: a TfL band stays a band, and nothing says a road is clear or that
 * a vehicle may use it. Heights in metres and feet-inches (inches rounded down, so clearance is never overstated); weights in tonnes.
 */
export function kindLabel(p: Pick<RestrictionPoint, "kind" | "physical">): string {
  switch (p.kind) {
    case "height":
      return p.physical ? "Height clearance (measured, not signed)" : "Height restriction";
    case "weight-structural":
      return "Weight limit, all vehicles (structural)";
    case "weight-goods":
      return "Lorry weight limit (goods vehicles, environmental)";
    case "weight-unrecorded-type":
      return "Weight value on a National Highways diversion route: type, scope and exemptions not recorded";
  }
}

/**
 * What National Highways' diversion-point weight values don't say (docs/RESTRICTIONS.md): only the value is recorded, so the app
 * never presents one as a confirmed lorry limit, structural limit or limit for all vehicles.
 */
export const UNRECORDED_WEIGHT_NOTE =
  "National Highways records only this value, on one of its emergency diversion routes. It doesn't record whether it is a structural limit or a lorry limit, which vehicles it applies to, where it starts and ends, or any exemptions. Don't treat it as a confirmed limit for all vehicles or for lorries. Follow the road signs.";

const m = (n: number) => n.toFixed(1);

/**
 * A height in feet and inches stated in the source's own wording, e.g. NH's "Vehicles Exceeding Height 14ft 0ins Prohibited". Only an
 * unambiguous statement counts: exactly one feet-and-inches value, inches 0 to 11. Anything else gives null.
 */
export function wordingImperialHeight(text: string | null): { feet: number; inches: number; metres: number } | null {
  if (!text) return null;
  const found = [...text.matchAll(/\b(\d{1,2})\s*(?:ft|feet|foot|'|′)\s*(\d{1,2})\s*(?:ins|in|inches|inch|"|″)(?![a-z])/gi)];
  if (found.length !== 1) return null;
  const feet = Number(found[0]![1]);
  const inches = Number(found[0]![2]);
  if (inches > 11) return null;
  return { feet, inches, metres: (feet * 12 + inches) * 0.0254 };
}

/**
 * How the feet-and-inches figure shown relates to the recorded metric value, for a height whose wording states feet and inches.
 * Says the figure is taken from the wording, and flags a metric value that is higher than the wording (the lower figure is safer).
 */
export function heightWordingNote(p: Pick<RestrictionPoint, "kind" | "limit" | "sourceText">): string | null {
  if (p.kind !== "height" || p.limit.min !== p.limit.max) return null;
  const worded = wordingImperialHeight(p.sourceText);
  if (!worded) return null;
  const imperial = `${worded.feet}′${worded.inches}″`;
  const approx = `about ${worded.metres.toFixed(2)} m`;
  const base = `${imperial} is taken from the source's wording, not converted from the metric value.`;
  if (p.limit.max > worded.metres + 0.005)
    return `${base} The recorded metric value, ${p.limit.max} m, is higher than ${imperial} (${approx}). Use the lower figure, ${imperial}, and follow the sign.`;
  if (p.limit.max < worded.metres - 0.005) return `${base} The recorded metric value, ${p.limit.max} m, is lower than ${imperial} (${approx}). Follow the sign.`;
  return `${base} Follow the sign.`;
}

/**
 * The limit in words for the details panel, e.g. "4.4 m (14′5″)", "Between 3.6 m (11′9″) and 4.0 m (13′1″)", "7.5 t". When the
 * source's wording states the height in feet and inches, that figure is shown as written, never a conversion of the metric value,
 * which can disagree with it (NH records 14ft 0ins as 4.2 m, which converts to 13′9″): "14′0″ in the wording, recorded as 4.2 m".
 */
export function limitText(p: Pick<RestrictionPoint, "kind" | "limit" | "sourceText">): string {
  const { min, max } = p.limit;
  if (p.kind !== "height") return min === null || min === max ? `${max} t` : `Between ${min} t and ${max} t`;
  if (min === null) return `${formatHeight(Number(m(max)))} or lower`;
  const worded = min === max ? wordingImperialHeight(p.sourceText) : null;
  if (worded) return `${worded.feet}′${worded.inches}″ in the wording, recorded as ${max} m`;
  if (min === max) return formatHeight(max);
  return `Between ${formatHeight(Number(m(min)))} and ${formatHeight(Number(m(max)))}`;
}

/** The short text on the map marker, e.g. "4.4m", "3.6–4.0m", "≤3.0m", "7.5t". */
export function markerText(p: Pick<RestrictionPoint, "kind" | "limit">): string {
  const { min, max } = p.limit;
  if (p.kind !== "height") return `${max}t`;
  if (min === null) return `≤${m(max)}m`;
  if (min === max) return `${max}m`;
  return `${m(min)}–${m(max)}m`;
}

/**
 * Who recorded it, and how far to trust it. Community records always say they are unverified. Official sources are named as the
 * source only, never "official record", so nothing suggests official status or endorsement (TfL Transport Data Service licence,
 * "Non-endorsement"). Attribution and licence are shown separately.
 */
export function sourceLabel(s: Pick<RestrictionSource, "kind" | "authority">): string {
  return s.kind === "official" ? `Source: ${s.authority}` : `Community record: ${s.authority}. Unverified.`;
}

/** Where it is, from the source's own road name, number and area, or a plain fallback. */
export function locationText(p: Pick<RestrictionPoint, "road" | "position" | "approximate">): string {
  const parts = [p.road.ref, p.road.name, p.road.area].filter((x): x is string => Boolean(x));
  const place = parts.length > 0 ? parts.join(", ") : `${p.position[1].toFixed(5)}, ${p.position[0].toFixed(5)}`;
  return p.approximate ? `${place} (approximate position: recorded along a stretch of road)` : place;
}

/** A restriction file is flagged as possibly out of date once it is this old. */
export const RESTRICTIONS_STALE_AFTER_DAYS = 120;

export function isStale(generatedAt: string, now: Date): boolean {
  return now.getTime() - Date.parse(generatedAt) > RESTRICTIONS_STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
export const formatDate = (iso: string): string => dateFormat.format(new Date(iso));

/** Hosts the restriction and licence links may point to (CLAUDE.md: outbound links only from an allow-list, https only). */
const LINK_HOSTS = ["www.nationalarchives.gov.uk", "opendatacommons.org", "www.openstreetmap.org", "tfl.gov.uk", "data.london.gov.uk", "www.arcgis.com"];

/** The URL if it is https on an allowed host, otherwise null (the link is then not shown). */
export function allowedLink(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && LINK_HOSTS.includes(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
}

/** A link to one OpenStreetMap element, built from its validated type and numeric id only. */
export const osmElementUrl = (type: "node" | "way", id: number): string => `https://www.openstreetmap.org/${type}/${encodeURIComponent(String(id))}`;
