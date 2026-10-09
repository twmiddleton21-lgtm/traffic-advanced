import type { Map as MapLibreMap } from "maplibre-gl";
import { COLOURS } from "./style.ts";

/**
 * Map icons drawn on a canvas at 2× (no image files, no extra requests). Style swaps clear a map's images, so this runs on every
 * "style.load". Shields are stretchable so `icon-text-fit` sizes them to the road number.
 */
const RATIO = 2;

function draw(width: number, height: number, paint: (ctx: CanvasRenderingContext2D) => void): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = width * RATIO;
  canvas.height = height * RATIO;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(RATIO, RATIO);
  paint(ctx);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

function addShield(map: MapLibreMap, id: string, fill: string, border: string): void {
  const size = 20;
  const image = draw(size, size, (ctx) => {
    ctx.fillStyle = border;
    ctx.beginPath();
    ctx.roundRect(0.5, 0.5, size - 1, size - 1, 4);
    ctx.fill();
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(2, 2, size - 4, size - 4, 3);
    ctx.fill();
  });
  // Stretch only the flat middle so the rounded corners and border keep their shape.
  const edge = 6 * RATIO;
  const far = (size - 6) * RATIO;
  map.addImage(id, image, { pixelRatio: RATIO, stretchX: [[edge, far]], stretchY: [[edge, far]], content: [edge, edge, far, far] });
}

/** A solid arrowhead pointing right: MapLibre line placement turns +x to face along the line's direction. */
function addArrow(map: MapLibreMap): void {
  // Black on the yellow route, with a white edge so the arrowhead also reads where it overhangs a dark map.
  const image = draw(30, 24, (ctx) => {
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(3, 3);
    ctx.lineTo(27, 12);
    ctx.lineTo(3, 21);
    ctx.lineTo(9, 12);
    ctx.closePath();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = COLOURS.ink;
    ctx.fill();
  });
  map.addImage("ta-arrow", image, { pixelRatio: RATIO });
}

const RESTRICTION_RED = "#c8102e";

/**
 * Restriction plates, sign-style: white with a red border (a grey border when NH doesn't record the limit's type), the value as
 * text. Lorry limits carry a lorry glyph and structural limits a bridge glyph, so the kinds differ by shape as well as by colour.
 * Community (OpenStreetMap) records have a dashed border. Only the plain middle stretches, so glyphs and corners keep their shape.
 */
function addPlate(map: MapLibreMap, id: string, options: { border: string; dashed: boolean; glyph: "lorry" | "bridge" | null }): void {
  const glyphWidth = options.glyph ? 16 : 0;
  const width = glyphWidth + 16;
  const height = 20;
  const image = draw(width, height, (ctx) => {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(1.5, 1.5, width - 3, height - 3, 4);
    ctx.fill();
    ctx.strokeStyle = options.border;
    ctx.lineWidth = 2.5;
    if (options.dashed) ctx.setLineDash([3, 2]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = COLOURS.ink;
    ctx.strokeStyle = COLOURS.ink;
    if (options.glyph === "lorry") {
      // Trailer, cab and two wheels.
      ctx.fillRect(4, 6, 8, 6);
      ctx.fillRect(12.5, 8, 3.5, 4);
      ctx.beginPath();
      ctx.arc(6.5, 13.5, 1.6, 0, Math.PI * 2);
      ctx.arc(13.5, 13.5, 1.6, 0, Math.PI * 2);
      ctx.fill();
    } else if (options.glyph === "bridge") {
      // A deck on an arch.
      ctx.fillRect(3.5, 6, 13, 2);
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(4.5, 14.5);
      ctx.quadraticCurveTo(10, 6.5, 15.5, 14.5);
      ctx.stroke();
    }
  });
  const left = (glyphWidth + 5) * RATIO;
  const right = (width - 5) * RATIO;
  map.addImage(id, image, { pixelRatio: RATIO, stretchX: [[left, right]], stretchY: [[6 * RATIO, 14 * RATIO]], content: [left, 4 * RATIO, right, 16 * RATIO] });
}

function addRestrictionPlates(map: MapLibreMap): void {
  const kinds = [
    { kind: "height", border: RESTRICTION_RED, glyph: null },
    { kind: "weight-goods", border: RESTRICTION_RED, glyph: "lorry" },
    { kind: "weight-structural", border: RESTRICTION_RED, glyph: "bridge" },
    { kind: "weight-unrecorded-type", border: "#5b6770", glyph: null },
  ] as const;
  for (const k of kinds) {
    addPlate(map, `ta-r-${k.kind}`, { border: k.border, dashed: false, glyph: k.glyph });
    addPlate(map, `ta-r-${k.kind}-community`, { border: k.border, dashed: true, glyph: k.glyph });
  }
}

export function addMapImages(map: MapLibreMap): void {
  if (map.hasImage("ta-arrow")) return;
  addShield(map, "ta-shield-blue", "#0b4f9c", "#ffffff");
  addShield(map, "ta-shield-green", "#00703c", "#ffffff");
  addShield(map, "ta-shield-white", "#ffffff", COLOURS.ink);
  addShield(map, "ta-junction", COLOURS.ink, "#ffffff");
  addArrow(map);
  addRestrictionPlates(map);
}
