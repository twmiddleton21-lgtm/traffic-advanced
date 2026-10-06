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

export function addMapImages(map: MapLibreMap): void {
  if (map.hasImage("ta-arrow")) return;
  addShield(map, "ta-shield-blue", "#0b4f9c", "#ffffff");
  addShield(map, "ta-shield-green", "#00703c", "#ffffff");
  addShield(map, "ta-shield-white", "#ffffff", COLOURS.ink);
  addShield(map, "ta-junction", COLOURS.ink, "#ffffff");
  addArrow(map);
}
