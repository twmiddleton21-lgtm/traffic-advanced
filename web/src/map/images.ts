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
 * Restriction plates, sign-style: white with a red border (a grey border when NH doesn't record the limit's type), a glyph for the
 * kind and the value as text. Heights carry up-and-down arrows, weights of unrecorded type a weight, lorry limits a lorry and
 * structural limits a bridge, so the kinds differ by shape as well as by colour. Community (OpenStreetMap) records have a dashed
 * border. Only the plain middle stretches, so glyphs and corners keep their shape. The same glyphs are drawn in the app's key
 * (components/RestrictionGlyphs.tsx).
 */
function addPlate(map: MapLibreMap, id: string, options: { border: string; dashed: boolean; glyph: "height" | "weight" | "lorry" | "bridge" | "width" | "length" | "no-lorry" }): void {
  const glyphWidth = 16;
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
    if (options.glyph === "height") {
      // A vertical double-headed arrow between two bars: the clearance.
      ctx.fillRect(4, 3.5, 10, 1.6);
      ctx.fillRect(4, 14.9, 10, 1.6);
      ctx.beginPath();
      ctx.moveTo(9, 5.6);
      ctx.lineTo(12, 8.6);
      ctx.lineTo(6, 8.6);
      ctx.closePath();
      ctx.moveTo(9, 14.4);
      ctx.lineTo(12, 11.4);
      ctx.lineTo(6, 11.4);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(8.2, 8, 1.6, 4);
    } else if (options.glyph === "weight") {
      // A weight: a ring handle on a trapezoid.
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(9, 6.2, 2.1, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(5.5, 8.6);
      ctx.lineTo(12.5, 8.6);
      ctx.lineTo(14.5, 15.5);
      ctx.lineTo(3.5, 15.5);
      ctx.closePath();
      ctx.fill();
    } else if (options.glyph === "lorry") {
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
    } else if (options.glyph === "width") {
      // A horizontal double-headed arrow between two uprights: the width.
      ctx.fillRect(3, 4, 1.6, 12);
      ctx.fillRect(14.4, 4, 1.6, 12);
      ctx.beginPath();
      ctx.moveTo(5.2, 10);
      ctx.lineTo(8.2, 7);
      ctx.lineTo(8.2, 13);
      ctx.closePath();
      ctx.moveTo(13.8, 10);
      ctx.lineTo(10.8, 7);
      ctx.lineTo(10.8, 13);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(8, 9.2, 3, 1.6);
    } else if (options.glyph === "length") {
      // A lorry over a measuring line with end stops.
      ctx.fillRect(4, 4.5, 8, 5);
      ctx.fillRect(12.5, 6.5, 3.5, 3);
      ctx.fillRect(3, 13.2, 14, 1.4);
      ctx.fillRect(3, 11.5, 1.4, 4.8);
      ctx.fillRect(15.6, 11.5, 1.4, 4.8);
    } else if (options.glyph === "no-lorry") {
      // A prohibition roundel: a small lorry inside a red ring with a red diagonal bar, so access reads differently from the
      // lorry weight and length plates by shape.
      ctx.fillRect(5.5, 7.5, 6, 4.5);
      ctx.fillRect(11.8, 9, 2.7, 3);
      ctx.beginPath();
      ctx.arc(7.3, 12.8, 1.2, 0, Math.PI * 2);
      ctx.arc(12.8, 12.8, 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = RESTRICTION_RED;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.arc(10, 10, 7.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(4.9, 15.1);
      ctx.lineTo(15.1, 4.9);
      ctx.stroke();
    }
  });
  const left = (glyphWidth + 5) * RATIO;
  const right = (width - 5) * RATIO;
  map.addImage(id, image, { pixelRatio: RATIO, stretchX: [[left, right]], stretchY: [[6 * RATIO, 14 * RATIO]], content: [left, 4 * RATIO, right, 16 * RATIO] });
}

function addRestrictionPlates(map: MapLibreMap): void {
  const kinds = [
    { kind: "height", border: RESTRICTION_RED, glyph: "height" },
    { kind: "weight-goods", border: RESTRICTION_RED, glyph: "lorry" },
    { kind: "weight-structural", border: RESTRICTION_RED, glyph: "bridge" },
    { kind: "weight-unrecorded-type", border: "#5b6770", glyph: "weight" },
  ] as const;
  for (const k of kinds) {
    addPlate(map, `ta-r-${k.kind}`, { border: k.border, dashed: false, glyph: k.glyph });
    addPlate(map, `ta-r-${k.kind}-community`, { border: k.border, dashed: true, glyph: k.glyph });
  }
}

/**
 * Routes map images (map/routesOverlayLayers.ts), used only by the Routes view's layers. Each kind differs by shape, not colour alone,
 * and every image has a white edge so it reads on both the light and the dark base map:
 * - restriction plates (dashed red border: community data) for widths, lengths and lorry access, access as a prohibition roundel;
 * - a speed camera: a dark SQUARE sign with a white camera and a flash;
 * - a red-light camera: a dark TALL signal housing with red, amber and green lights over a small camera;
 */
function addRoutesImages(map: MapLibreMap): void {
  addPlate(map, "ta-routes-width", { border: RESTRICTION_RED, dashed: true, glyph: "width" });
  addPlate(map, "ta-routes-length", { border: RESTRICTION_RED, dashed: true, glyph: "length" });
  addPlate(map, "ta-routes-hgv-access", { border: RESTRICTION_RED, dashed: true, glyph: "no-lorry" });
  const speedCamera = draw(26, 26, (ctx) => {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(0.5, 0.5, 25, 25, 5);
    ctx.fill();
    ctx.fillStyle = COLOURS.ink;
    ctx.beginPath();
    ctx.roundRect(2, 2, 22, 22, 4);
    ctx.fill();
    // Camera body and lens.
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(5, 8, 13, 10, 2);
    ctx.fill();
    ctx.fillRect(8, 6, 5, 2.5);
    ctx.fillStyle = COLOURS.ink;
    ctx.beginPath();
    ctx.arc(11.5, 13, 3, 0, Math.PI * 2);
    ctx.fill();
    // A flash.
    ctx.fillStyle = "#ffd200";
    ctx.beginPath();
    ctx.moveTo(19, 7);
    ctx.lineTo(22, 7);
    ctx.lineTo(20.5, 11);
    ctx.lineTo(22.5, 11);
    ctx.lineTo(18.5, 18);
    ctx.lineTo(19.5, 12.5);
    ctx.lineTo(18, 12.5);
    ctx.closePath();
    ctx.fill();
  });
  const redLightCamera = draw(18, 32, (ctx) => {
    // A tall signal housing: white edge, dark body, three lights, and a small white camera at the foot.
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(0.5, 0.5, 17, 31, 5);
    ctx.fill();
    ctx.fillStyle = COLOURS.ink;
    ctx.beginPath();
    ctx.roundRect(2, 2, 14, 28, 4);
    ctx.fill();
    for (const [y, colour] of [
      [6.5, "#e5322d"],
      [12, "#f6b100"],
      [17.5, "#1fa34a"],
    ] as const) {
      ctx.fillStyle = colour;
      ctx.beginPath();
      ctx.arc(9, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(4.5, 22, 9, 6, 1.5);
    ctx.fill();
    ctx.fillStyle = COLOURS.ink;
    ctx.beginPath();
    ctx.arc(9, 25, 1.7, 0, Math.PI * 2);
    ctx.fill();
  });
  map.addImage("ta-routes-speed-camera", speedCamera, { pixelRatio: RATIO });
  map.addImage("ta-routes-red-light-camera", redLightCamera, { pixelRatio: RATIO });
}

export function addMapImages(map: MapLibreMap): void {
  if (map.hasImage("ta-arrow")) return;
  addShield(map, "ta-shield-blue", "#0b4f9c", "#ffffff");
  addShield(map, "ta-shield-green", "#00703c", "#ffffff");
  addShield(map, "ta-shield-white", "#ffffff", COLOURS.ink);
  addShield(map, "ta-junction", COLOURS.ink, "#ffffff");
  addArrow(map);
  addRestrictionPlates(map);
  addRoutesImages(map);
}
