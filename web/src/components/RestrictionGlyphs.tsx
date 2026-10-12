import type { RestrictionPoint } from "../../../shared/api/restrictions.ts";
import { POINT_LAYER_COLOURS, ZONE_COLOURS } from "../map/restrictionLayers.ts";

/**
 * The restriction symbols used in the app's own UI: the same glyphs and sign-style plates as the map markers (map/images.ts), so the
 * key, the "Restrictions" button and the details match what is drawn on the map. Decorative: the text beside them carries the meaning.
 */
type Kind = RestrictionPoint["kind"];

const svg = "inline size-3.5 shrink-0 align-[-2px]";

export function HeightGlyph() {
  return (
    <svg viewBox="0 0 18 20" className={svg} aria-hidden="true">
      <rect x="4" y="3.5" width="10" height="1.6" fill="currentColor" />
      <rect x="4" y="14.9" width="10" height="1.6" fill="currentColor" />
      <path d="M9 5.6 L12 8.6 L6 8.6 Z M9 14.4 L12 11.4 L6 11.4 Z" fill="currentColor" />
      <rect x="8.2" y="8" width="1.6" height="4" fill="currentColor" />
    </svg>
  );
}

export function WeightGlyph() {
  return (
    <svg viewBox="0 0 18 20" className={svg} aria-hidden="true">
      <circle cx="9" cy="6.2" r="2.1" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5.5 8.6 H12.5 L14.5 15.5 H3.5 Z" fill="currentColor" />
    </svg>
  );
}

export function LorryGlyph() {
  return (
    <svg viewBox="0 0 16 12" className={svg} aria-hidden="true">
      <rect x="1" y="2" width="8" height="6" fill="currentColor" />
      <rect x="9.5" y="4" width="3.5" height="4" fill="currentColor" />
      <circle cx="3.5" cy="9.5" r="1.6" fill="currentColor" />
      <circle cx="10.5" cy="9.5" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function BridgeGlyph() {
  return (
    <svg viewBox="0 0 16 12" className={svg} aria-hidden="true">
      <rect x="1" y="2" width="14" height="2" fill="currentColor" />
      <path d="M2 11 Q8 3 14 11" stroke="currentColor" strokeWidth="1.8" fill="none" />
    </svg>
  );
}

function KindGlyph({ kind }: { kind: Kind }) {
  if (kind === "height") return <HeightGlyph />;
  if (kind === "weight-goods") return <LorryGlyph />;
  if (kind === "weight-structural") return <BridgeGlyph />;
  return <WeightGlyph />;
}

/** A sign-style plate, as on the map: white, with the kind's glyph and border, the value in dark text in either theme. */
export function Plate({ kind, text, community = false, large = false }: { kind: Kind; text: string; community?: boolean; large?: boolean }) {
  const border = kind === "weight-unrecorded-type" ? "border-[#5b6770]" : "border-closure";
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-[4px] border-2 bg-white font-bold text-[#14191e] ${community ? "border-dashed" : ""} ${border} ${large ? "px-2 py-1 text-[22px] leading-7 [&_svg]:size-6" : "px-1 text-[11px] leading-4"}`}
      aria-hidden="true"
    >
      <KindGlyph kind={kind} />
      {text}
    </span>
  );
}

/** A group marker as on the map: a ring in the layer's colour with a count. */
export function GroupDot({ layer }: { layer: "height" | "weight" }) {
  return (
    <span
      className="inline-grid size-5 shrink-0 place-items-center rounded-full border-[3px] bg-white text-[10px] font-bold leading-none text-[#14191e]"
      style={{ borderColor: POINT_LAYER_COLOURS[layer] }}
      aria-hidden="true"
    >
      3
    </span>
  );
}

/** A zone boundary as on the map: dashed green for the LEZ, solid blue for the ULEZ. */
export function ZoneLine({ zone }: { zone: "lez" | "ulez" }) {
  return (
    <span
      className={`inline-block w-6 shrink-0 border-t-[3px] align-middle ${zone === "lez" ? "border-dashed" : ""}`}
      style={{ borderColor: ZONE_COLOURS[zone] }}
      aria-hidden="true"
    />
  );
}
