import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const brand = (file: string) => readFileSync(`web/brand/${file}`, "utf8");
const html = readFileSync("web/index.html", "utf8");
const logo = readFileSync("web/src/components/BrandLogo.tsx", "utf8");
const header = readFileSync("web/src/components/AppHeader.tsx", "utf8");

const MASTERS = [
  "traffic-advanced-icon.svg",
  "traffic-advanced-icon-square.svg",
  "traffic-advanced-icon-maskable.svg",
  "traffic-advanced-favicon.svg",
  "traffic-advanced-banner.svg",
  "traffic-advanced-header-dark.svg",
  "traffic-advanced-header-light.svg",
];

function pngSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 8).toString("hex"), `${path} is a real PNG`).toBe("89504e470d0a1a0a");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

/** WCAG 2.2 contrast ratio of two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => {
      const c = parseInt(hex.slice(i, i + 2), 16) / 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    }) as [number, number, number];
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

describe("brand masters (web/brand)", () => {
  it("are plain vector artwork: no live text, fonts, scripts, links or embedded images, so they render the same everywhere", () => {
    for (const file of MASTERS) {
      const svg = brand(file);
      expect(svg, file).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 [\d.]+ [\d.]+"/);
      expect(svg, file).not.toMatch(/<text|font-family|<script|<foreignObject|<image|href=|url\(|on\w+=/i);
    }
  });

  it("use only the brand palette: deep navy, secondary navy, road gold and off-white", () => {
    for (const file of MASTERS) {
      const colours = new Set([...brand(file).matchAll(/#[0-9a-f]{6}\b/gi)].map((m) => m[0].toUpperCase()));
      for (const c of colours) expect(["#061426", "#102844", "#F7B928", "#F7F9FC"], `${file} ${c}`).toContain(c);
    }
  });

  it("draw the road's centre-line dashes in navy on the white road surface, so they show", () => {
    const icon = brand("traffic-advanced-icon.svg");
    const road = icon.indexOf('<path d="M223 144 H289 L314 344 H198 Z" fill="#F7F9FC"/>');
    const dashes = icon.indexOf('stroke="#102844" stroke-width="9"');
    expect(road).toBeGreaterThan(0);
    expect(dashes).toBeGreaterThan(road); // drawn on top of the road
  });

  it("keep the maskable icon's badge inside the 40% safe-zone circle", () => {
    const svg = brand("traffic-advanced-icon-maskable.svg");
    const [, tx, ty, s] = /<g transform="translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\)">/.exec(svg)!.map(Number) as [number, number, number, number];
    expect(svg).toMatch(/<rect width="512" height="512" fill="#061426"\/>/); // full bleed: nothing transparent to crop into
    // Every point of the shield outline (the badge's outermost shape; curve control points bound their curves), after the
    // transform, plus half its 10-unit rim.
    const shield = /<path d="(M256 39 [^"]+)"/.exec(svg)![1]!;
    const points: [number, number][] = [];
    let [x, y] = [0, 0];
    for (const [, cmd, args] of shield.matchAll(/([MLQVHZ])([^MLQVHZ]*)/g)) {
      const n = args!.trim().split(/\s+/).filter(Boolean).map(Number);
      if (cmd === "V") y = n[0]!;
      else if (cmd === "H") x = n[0]!;
      else for (let i = 0; i + 1 < n.length; i += 2) points.push([n[i]!, n[i + 1]!]);
      if (cmd === "V" || cmd === "H") points.push([x, y]);
      else if (n.length >= 2) [x, y] = [n[n.length - 2]!, n[n.length - 1]!];
    }
    expect(points.length).toBeGreaterThan(10);
    const farthest = Math.max(...points.map(([px, py]) => Math.hypot(tx + px * s - 256, ty + py * s - 256))) + 5 * s;
    expect(farthest).toBeLessThan(512 * 0.4);
    expect(farthest).toBeGreaterThan(512 * 0.3); // and still large enough to read
  });
});

describe("published brand files", () => {
  it("are the masters themselves (SVG) or rendered from them at the declared sizes (PNG)", () => {
    expect(readFileSync("web/public/favicon.svg", "utf8")).toBe(brand("traffic-advanced-favicon.svg"));
    expect(readFileSync("web/public/banner.svg", "utf8")).toBe(brand("traffic-advanced-banner.svg"));
    const sizes: Record<string, number> = {
      "web/public/favicon-16x16.png": 16,
      "web/public/favicon-32x32.png": 32,
      "web/public/apple-touch-icon.png": 180,
      "web/brand/pwa/icon-192.png": 192,
      "web/brand/pwa/icon-512.png": 512,
      "web/brand/pwa/icon-maskable-512.png": 512,
    };
    for (const [file, size] of Object.entries(sizes)) expect(pngSize(file), file).toEqual({ width: size, height: size });
    const script = readFileSync("web/brand/render-icons.mjs", "utf8");
    for (const file of Object.keys(sizes)) expect(script, file).toContain(file.replace(/^web\/(public|brand)\//, ""));
  });

  it("add no web app manifest: the PWA icons are prepared in web/brand/pwa but not published or linked", () => {
    expect(html).not.toMatch(/rel="manifest"/);
    expect(existsSync("web/public/manifest.webmanifest")).toBe(false);
    expect(existsSync("web/public/icon-192.png")).toBe(false);
  });
});

describe("header logo", () => {
  it("is the page heading, named Traffic Advanced for assistive technology at every width", () => {
    expect(header).toMatch(/<BrandLogo \/>/);
    expect(header).not.toMatch(/<h1/);
    expect(logo.match(/<h1/g)).toHaveLength(1);
    expect(logo).toMatch(/<h1[^>]*>\s*<span className="sr-only">Traffic Advanced<\/span>/);
    // The drawings themselves are hidden from screen readers, so the name is read once.
    expect(logo.match(/<svg /g)).toHaveLength(2);
    expect(logo.match(/<svg [^>]*aria-hidden="true"/g)).toHaveLength(2);
  });

  it("shows the badge alone below 360px, and the one-line wordmark from 360px", () => {
    expect(logo).toMatch(/<svg viewBox="50 0 217 40" className="hidden h-8 w-\[173\.6px\] min-\[360px\]:block lg:h-10 lg:w-\[217px\]"/);
    // Explicit widths (Safari can size width: auto at 300px) that keep the viewBox's 217:40 ratio at both heights, so the
    // lettering is never stretched: h-8 (32px) with 173.6px, lg:h-10 (40px) with 217px.
    const cls = /<svg viewBox="50 0 217 40" className="([^"]+)"/.exec(logo)![1]!;
    const px = (re: RegExp) => Number(re.exec(cls)![1]);
    expect(px(/(?:^| )w-\[([\d.]+)px\]/) / 32).toBeCloseTo(217 / 40, 6);
    expect(px(/lg:w-\[([\d.]+)px\]/) / 40).toBeCloseTo(217 / 40, 6);
    expect(cls).toMatch(/(?:^| )h-8 /);
    expect(cls).toMatch(/ lg:h-10 /);
    expect(logo).toMatch(/<svg viewBox="0 0 512 512" className="size-8 shrink-0 lg:size-10"/);
  });

  it("draws exactly the master artwork: the badge and the outlined wordmark", () => {
    const paths = (s: string) => [...s.matchAll(/<path [^>]*?\bd="([^"]+)"/g)].map((m) => m[1]);
    const badge = paths(brand("traffic-advanced-icon.svg"));
    const dark = paths(brand("traffic-advanced-header-dark.svg"));
    expect(paths(brand("traffic-advanced-header-light.svg"))).toEqual(dark);
    expect(dark.slice(0, badge.length)).toEqual(badge);
    expect(paths(logo)).toEqual([...badge, ...dark.slice(badge.length)]);
  });

  it("keeps the wordmark readable in both themes: navy on the light header, off-white and gold on the dark header", () => {
    const fills = [...logo.matchAll(/className="fill-\[(#\w+)\] dark:fill-\[(#\w+)\]"/g)].map((m) => [m[1]!, m[2]!]);
    expect(fills).toEqual([
      ["#061426", "#F7F9FC"],
      ["#102844", "#F7B928"],
    ]);
    // Header surfaces from web/src/styles.css (--ta-surface): #ffffff light, #1c2126 dark.
    for (const [light, dark] of fills) {
      expect(contrast(light!, "#ffffff")).toBeGreaterThanOrEqual(4.5);
      expect(contrast(dark!, "#1c2126")).toBeGreaterThanOrEqual(4.5);
    }
    // Why "ADVANCED" isn't gold in the light theme.
    expect(contrast("#F7B928", "#ffffff")).toBeLessThan(3);
  });
});
