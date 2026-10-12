import type { OsmRef, RoutesDataLayer, RoutesPoint, RoutesSection } from "../../../shared/api/routes-layers.ts";
import { formatHeight } from "../domain/units.ts";
import { RESTRICTIONS_STALE_AFTER_DAYS } from "../restrictions/describe.ts";

/**
 * Words for the Routes map's OpenStreetMap layers: the Layers panel rows, marker text, the key and each record's details. Values are
 * shown as mapped, conditions and exemptions verbatim; nothing here says a road is clear, legal or suitable for a vehicle.
 */

/** Each layer's name and what it covers, for its switch in the Layers panel. */
export const ROUTES_LAYER_TEXT: Record<RoutesDataLayer, { label: string; description: string }> = {
  "speed-cameras": { label: "Speed cameras", description: "Fixed speed cameras as mapped. Mobile cameras aren't included." },
  "average-speed": { label: "Average speed checks", description: "Mapped average speed check sections, with arrows for the direction checked." },
  "red-light-cameras": { label: "Red-light cameras", description: "Red-light cameras as mapped. Very few are mapped." },
  height: { label: "Height limits", description: "Signed height limits and measured clearances on roads." },
  weight: { label: "Weight limits", description: "Lorry weight limits and limits for all vehicles, with exemptions as mapped." },
  "width-length": { label: "Width and length limits", description: "Signed width and length limits, and measured widths on roads." },
  access: { label: "Lorry access restrictions", description: "Where lorries are banned, limited to access or deliveries, or discouraged, as mapped." },
};

/** Shown when a layer's OpenStreetMap data is older than the restriction layers' threshold. */
export const STALE_ROUTES_TEXT = "This map layer data is more than four months old and may be out of date.";
export const isRoutesDataStale = (dataAsOf: string, now: Date) => now.getTime() - Date.parse(dataAsOf) > RESTRICTIONS_STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;

const hasConditions = (p: Pick<RoutesPoint, "conditions" | "conditionalOnly">) => p.conditionalOnly || p.conditions.length > 0;

/** The text on a marker: the value, with "*" when conditions or exemptions are mapped (the key explains it). Cameras have none. */
export function routesMarkerText(p: Pick<RoutesPoint, "kind" | "value" | "conditions" | "conditionalOnly">): string {
  if (p.kind === "speed-camera" || p.kind === "red-light-camera" || p.value === null) return "";
  const star = hasConditions(p) ? "*" : "";
  if (p.value.type === "access") return `${{ no: "No", destination: "Access", delivery: "Delivery", discouraged: "Unsuitable" }[p.value.access]}${star}`;
  return `${p.value.amount}${p.value.unit}${star}`;
}

/** What a record is, in a few words. */
export function routesKindLabel(p: Pick<RoutesPoint, "kind" | "value" | "physical">): string {
  switch (p.kind) {
    case "speed-camera":
      return "Speed camera";
    case "red-light-camera":
      return "Red-light camera";
    case "height":
      return p.physical ? "Measured height clearance" : "Height limit";
    case "weight-goods":
      return "Lorry weight limit";
    case "weight-structural":
      return "Weight limit, all vehicles";
    case "width":
      return p.physical ? "Measured width" : "Width limit";
    case "length":
      return "Length limit";
    case "hgv-access":
      return p.value?.type === "access"
        ? { no: "No lorries", destination: "Lorries: access only", delivery: "Lorries: deliveries only", discouraged: "Lorries discouraged (advisory)" }[p.value.access]
        : "Lorry access restriction";
  }
}

/** The value in full: heights and widths in metres and feet-inches, weights in tonnes, speed limits as mapped. */
export function routesValueText(p: Pick<RoutesPoint, "kind" | "value">): string {
  const v = p.value;
  if (p.kind === "speed-camera" || p.kind === "red-light-camera") {
    return v?.type === "measure" ? `Speed limit as mapped: ${v.amount} mph. This is the road's mapped limit, not a lorry limit.` : "Speed limit: not mapped, or mapped values disagree.";
  }
  if (v === null) return "No value";
  if (v.type === "access") return routesKindLabel(p as RoutesPoint);
  if (v.unit === "t") return `${v.amount} t`;
  if (v.unit === "m") return formatHeight(v.amount);
  return `${v.amount} mph`;
}

const COMPASS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
export const compassName = (bearing: number) => COMPASS[Math.round((((bearing % 360) + 360) % 360) / 45) % 8]!;

/** A camera's direction, only as mapped. */
export function directionText(p: Pick<RoutesPoint, "direction">): string[] {
  if (!p.direction) return ["Direction: not mapped."];
  const lines = p.direction.travelBearings.map((b) => `Checks traffic heading ${compassName(b)} (from the mapped start and end of its enforcement).`);
  if (p.direction.mapped !== null) lines.push(`Direction tag as mapped: "${p.direction.mapped}". Its meaning varies between mappers.`);
  return lines;
}

/** Where it is: the mapped road number and name, or coordinates. */
export function routesLocationText(p: { road: { name: string | null; ref: string | null }; position?: readonly [number, number]; approximate?: boolean }): string {
  const parts = [p.road.ref, p.road.name].filter((x): x is string => Boolean(x));
  const place = parts.length > 0 ? parts.join(", ") : p.position ? `${p.position[1].toFixed(5)}, ${p.position[0].toFixed(5)}` : "Road not named in the data";
  return p.approximate ? `${place} (approximate position: mapped along a stretch of road)` : place;
}

/** A link to one OpenStreetMap element, built from its validated type and numeric id only. */
export const osmLink = (ref: OsmRef): string => `https://www.openstreetmap.org/${ref.type}/${encodeURIComponent(String(ref.id))}`;

export function sectionTitle(s: Pick<RoutesSection, "value">): string {
  return s.value ? `Average speed check, ${s.value.amount} mph as mapped` : "Average speed check";
}
