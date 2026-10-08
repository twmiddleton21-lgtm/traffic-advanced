import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const html = readFileSync("web/index.html", "utf8");
const css = readFileSync("web/src/styles.css", "utf8");

/** Width and height from a PNG's IHDR chunk. */
function pngSize(path: string): { width: number; height: number } {
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 8).toString("hex"), `${path} is a real PNG`).toBe("89504e470d0a1a0a");
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe("app shell: page zoom", () => {
  it("never blocks page zoom (people who need to enlarge the app can still pinch-zoom it)", () => {
    const viewport = html.match(/<meta name="viewport" content="([^"]+)"/)?.[1];
    expect(viewport).toBe("width=device-width, initial-scale=1, viewport-fit=cover");
    expect(readFileSync("web/src/main.tsx", "utf8")).not.toMatch(/gesturestart|gesturechange/);
  });

  it("turns off double-tap zoom on the shell, and leaves the map canvas's own gesture handling to MapLibre", () => {
    expect(css).toMatch(/html,\s*body \{[^}]*touch-action: manipulation;/);
    expect(css).not.toMatch(/maplibregl-canvas[^{]*\{[^}]*touch-action/);
  });
});

describe("app icons", () => {
  const links = [...html.matchAll(/<link rel="(icon|apple-touch-icon)"[^>]*href="\/([^"]+)"[^>]*>/g)].map((m) => ({ tag: m[0], rel: m[1]!, file: m[2]! }));

  it("are an SVG favicon plus square PNGs in web/public, at the sizes they declare", () => {
    expect(links.map((l) => `${l.rel} ${l.file}`).sort()).toEqual([
      "apple-touch-icon apple-touch-icon.png",
      "icon favicon-16x16.png",
      "icon favicon-32x32.png",
      "icon favicon.svg",
    ]);
    expect(links.find((l) => l.file === "favicon.svg")?.tag).toMatch(/type="image\/svg\+xml"/);
    for (const { tag, rel, file } of links) {
      expect(existsSync(`web/public/${file}`), file).toBe(true);
      if (file.endsWith(".svg")) continue;
      const { width, height } = pngSize(`web/public/${file}`);
      expect(width, file).toBe(height);
      const declared = tag.match(/sizes="(\d+)x(\d+)"/);
      if (declared) expect([width, height]).toEqual([Number(declared[1]), Number(declared[2])]);
      if (rel === "apple-touch-icon") expect(width).toBe(180);
    }
  });

  it("are the only images published: the masters stay in web/brand, and the superseded branding is gone", () => {
    expect(readdirSync("web/public").filter((f) => /\.(png|jpe?g|svg|ico|webp)$/i.test(f)).sort()).toEqual([
      "apple-touch-icon.png",
      "banner.svg",
      "favicon-16x16.png",
      "favicon-32x32.png",
      "favicon.svg",
    ]);
    for (const old of ["web/public/banner.jpg", "web/public/favicon-32.png", "web/brand/appicon.jpg"]) expect(existsSync(old), old).toBe(false);
  });
});
