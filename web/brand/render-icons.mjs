// Renders every brand raster from its SVG master, and copies the published SVGs, so each PNG matches its master exactly.
// Run by hand after changing a master: `node web/brand/render-icons.mjs` (from the repository root). Not part of the build.
// Uses Sharp, already installed with Wrangler (no extra dependency); web/src/brand.test.ts checks the outputs.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const brand = "web/brand";
const pub = "web/public";

/** [master, output, size]: the simplified favicon below 48px, the full badge from 48px up. */
const rasters = [
  ["traffic-advanced-favicon.svg", `${pub}/favicon-16x16.png`, 16],
  ["traffic-advanced-favicon.svg", `${pub}/favicon-32x32.png`, 32],
  // Full bleed: iOS rounds the corners itself, and would turn transparent corners black.
  ["traffic-advanced-icon-square.svg", `${pub}/apple-touch-icon.png`, 180],
  // Ready for a web app manifest; not published until one is added.
  ["traffic-advanced-icon.svg", `${brand}/pwa/icon-192.png`, 192],
  ["traffic-advanced-icon.svg", `${brand}/pwa/icon-512.png`, 512],
  ["traffic-advanced-icon-maskable.svg", `${brand}/pwa/icon-maskable-512.png`, 512],
];

mkdirSync(`${brand}/pwa`, { recursive: true });
for (const [master, output, size] of rasters) {
  const svg = readFileSync(`${brand}/${master}`);
  const viewBoxWidth = Number(/viewBox="0 0 ([\d.]+)/.exec(svg.toString())?.[1]);
  // Rasterise at the target size (not downscaled from a large render), as a browser draws the SVG.
  const png = await sharp(svg, { density: (72 * size) / viewBoxWidth }).resize(size, size).png({ compressionLevel: 9 }).toBuffer();
  writeFileSync(output, png);
  console.log(`${output} ${size}x${size} from ${master}`);
}

copyFileSync(`${brand}/traffic-advanced-favicon.svg`, `${pub}/favicon.svg`);
copyFileSync(`${brand}/traffic-advanced-banner.svg`, `${pub}/banner.svg`);
console.log(`${pub}/favicon.svg and ${pub}/banner.svg copied from their masters`);
