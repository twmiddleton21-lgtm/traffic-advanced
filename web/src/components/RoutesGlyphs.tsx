import type { RoutesPointKind } from "../../../shared/api/routes-layers.ts";
import { AVERAGE_SPEED_COLOUR } from "../map/routesOverlayLayers.ts";
import { Plate } from "./RestrictionGlyphs.tsx";

/**
 * The Routes layers' symbols in the app's own UI (map key, details, keyboard list): the same glyphs and plates as the map markers
 * (map/images.ts, addRoutesImages), so the key matches what is drawn. Decorative: the text beside them carries the meaning. Plates
 * have a dashed border: community data.
 */
const svg = "inline size-3.5 shrink-0 align-[-2px]";

function RoutesPlate({ glyph, text }: { glyph: "width" | "length" | "no-lorry"; text: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 rounded-[4px] border-2 border-dashed border-closure bg-white px-1 text-[11px] font-bold leading-4 text-[#14191e]" aria-hidden="true">
      <svg viewBox="0 0 20 20" className={svg}>
        {glyph === "width" && <path d="M3 4h1.6v12H3zM14.4 4H16v12h-1.6zM5.2 10l3-3v6zM13.8 10l-3-3v6zM8 9.2h3v1.6H8z" fill="currentColor" />}
        {glyph === "length" && <path d="M4 4.5h8v5H4zM12.5 6.5H16v3h-3.5zM3 13.2h14v1.4H3zM3 11.5h1.4v4.8H3zM15.6 11.5H17v4.8h-1.4z" fill="currentColor" />}
        {glyph === "no-lorry" && (
          <>
            <path d="M5.5 7.5h6V12h-6zM11.8 9h2.7v3h-2.7z" fill="currentColor" />
            <circle cx="7.3" cy="12.8" r="1.2" fill="currentColor" />
            <circle cx="12.8" cy="12.8" r="1.2" fill="currentColor" />
            <circle cx="10" cy="10" r="7.2" fill="none" stroke="#c8102e" strokeWidth="1.8" />
            <path d="M4.9 15.1 15.1 4.9" stroke="#c8102e" strokeWidth="1.8" />
          </>
        )}
      </svg>
      {text}
    </span>
  );
}

/** A speed camera as on the map: a dark square sign with a white camera and a flash. */
export function CameraGlyph({ redLight = false }: { redLight?: boolean }) {
  if (redLight) return <RedLightGlyph />;
  return (
    <svg viewBox="0 0 26 26" className="inline size-5 shrink-0" aria-hidden="true">
      <rect x="0.5" y="0.5" width="25" height="25" rx="5" fill="#ffffff" />
      <rect x="2" y="2" width="22" height="22" rx="4" fill="#14191e" />
      <rect x="5" y="8" width="13" height="10" rx="2" fill="#ffffff" />
      <rect x="8" y="6" width="5" height="2.5" fill="#ffffff" />
      <circle cx="11.5" cy="13" r="3" fill="#14191e" />
      <path d="M19 7h3l-1.5 4h2l-4 7 1-5.5H18z" fill="#ffd200" />
    </svg>
  );
}

/** A red-light camera as on the map: a tall dark signal housing with red, amber and green lights over a small camera. */
function RedLightGlyph() {
  return (
    <svg viewBox="0 0 18 32" className="inline h-6 w-[13.5px] shrink-0" aria-hidden="true">
      <rect x="0.5" y="0.5" width="17" height="31" rx="5" fill="#ffffff" />
      <rect x="2" y="2" width="14" height="28" rx="4" fill="#14191e" />
      <circle cx="9" cy="6.5" r="2.5" fill="#e5322d" />
      <circle cx="9" cy="12" r="2.5" fill="#f6b100" />
      <circle cx="9" cy="17.5" r="2.5" fill="#1fa34a" />
      <rect x="4.5" y="22" width="9" height="6" rx="1.5" fill="#ffffff" />
      <circle cx="9" cy="25" r="1.7" fill="#14191e" />
    </svg>
  );
}

/** An average speed check section as on the map: a dashed purple line on a white casing, with an arrow. */
export function SectionGlyph() {
  return (
    <svg viewBox="0 0 28 10" className="h-2.5 w-7 shrink-0" aria-hidden="true">
      <path d="M2 5 H26" stroke="#ffffff" strokeWidth="6" strokeLinecap="round" />
      <path d="M2 5 H26" stroke={AVERAGE_SPEED_COLOUR} strokeWidth="3.5" strokeDasharray="5 2.5" />
      <path d="M12 2 L17 5 L12 8 L13.2 5 Z" fill="#14191e" />
    </svg>
  );
}

/** Any Routes record's symbol, with its marker text. */
export function RoutesSymbol({ kind, text }: { kind: RoutesPointKind; text: string }) {
  switch (kind) {
    case "speed-camera":
      return <CameraGlyph />;
    case "red-light-camera":
      return <CameraGlyph redLight />;
    case "height":
    case "weight-goods":
    case "weight-structural":
      return <Plate kind={kind} text={text} community />;
    case "width":
      return <RoutesPlate glyph="width" text={text} />;
    case "length":
      return <RoutesPlate glyph="length" text={text} />;
    case "hgv-access":
      return <RoutesPlate glyph="no-lorry" text={text} />;
  }
}
