import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hideSplash } from "./splash.ts";

/** Just enough of the DOM for hideSplash (tests run in Node). */
function fakeDocument() {
  const root = { inert: true, removeAttribute: vi.fn(() => (root.inert = false)) };
  const splash = { dataset: {} as Record<string, string>, removed: false, addEventListener: vi.fn(), remove: vi.fn(() => (splash.removed = true)) };
  const nodes: Record<string, unknown> = { root, splash };
  const doc = { getElementById: (id: string) => (id === "splash" && splash.removed ? null : (nodes[id] ?? null)) } as unknown as Document;
  return { doc, root, splash };
}

afterEach(() => vi.useRealTimers());

describe("splash", () => {
  it("makes the app interactive, fades out, and is removed even if no transition runs", () => {
    vi.useFakeTimers();
    const { doc, root, splash } = fakeDocument();
    hideSplash(doc);
    expect(root.inert).toBe(false);
    expect(splash.dataset["state"]).toBe("done");
    expect(splash.addEventListener).toHaveBeenCalledWith("transitionend", expect.any(Function), { once: true });
    vi.advanceTimersByTime(400);
    expect(splash.removed).toBe(true);
  });

  it("can be called more than once (ready and the backstop timer both call it)", () => {
    vi.useFakeTimers();
    const { doc, splash } = fakeDocument();
    hideSplash(doc);
    hideSplash(doc);
    expect(splash.addEventListener).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(400);
    expect(() => hideSplash(doc)).not.toThrow();
  });

  it("is in the page from the first paint, shows the banner at its own aspect ratio, and keeps the app inert until ready", () => {
    const html = readFileSync("web/index.html", "utf8");
    expect(html).toMatch(/<div id="splash" class="ta-splash" role="status">/);
    expect(html).toMatch(/<img class="ta-splash-banner" src="\/banner\.svg" width="1186" height="400" alt="Traffic Advanced"/);
    expect(html).toMatch(/<div id="root" inert><\/div>/);
    // No inline styles: the CSP allows the bundled stylesheet only.
    expect(html).not.toMatch(/<style|style="/);
  });

  it("stops its progress animation for reduced motion", () => {
    const css = readFileSync("web/src/splash.css", "utf8");
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[^@]*\.ta-splash-progress::after \{[^}]*animation: none;/);
  });

  it("is styled before the first paint, at its final size: its own stylesheet is linked in <head>, before the app's script", () => {
    const html = readFileSync("web/index.html", "utf8");
    const head = html.slice(0, html.indexOf("</head>"));
    expect(head).toMatch(/<link rel="stylesheet" href="\/src\/splash\.css" \/>/);
    expect(html.indexOf('href="/src/splash.css"')).toBeLessThan(html.indexOf('<script type="module"'));
    // The splash's rules live only there, so the bundle's later CSS can't resize it once it arrives.
    expect(readFileSync("web/src/styles.css", "utf8")).not.toMatch(/\.ta-splash[\w-]*\s*\{/);
    // The banner's box keeps the image's own ratio before the image loads, and the text's line box is fixed for the font swap.
    const css = readFileSync("web/src/splash.css", "utf8");
    expect(css).toMatch(/\.ta-splash-banner \{[^}]*aspect-ratio: 1186 \/ 400;/);
    expect(css).toMatch(/\.ta-splash-text \{[^}]*height: 20px;[^}]*line-height: 20px;/);
  });

  it("uses the theme's own colours in both themes (its copies match styles.css)", () => {
    const tokens = readFileSync("web/src/styles.css", "utf8");
    const css = readFileSync("web/src/splash.css", "utf8");
    const value = (block: string, name: string) => new RegExp(`--ta-${name}: (#[0-9a-f]{6})`).exec(block)?.[1];
    const light = tokens.slice(tokens.indexOf(":root {"), tokens.indexOf("[data-theme=\"dark\"] {"));
    const dark = tokens.slice(tokens.indexOf("[data-theme=\"dark\"] {"));
    const splashLight = css.slice(css.indexOf(".ta-splash {"), css.indexOf("[data-theme=\"dark\"] .ta-splash {"));
    const splashDark = css.slice(css.indexOf("[data-theme=\"dark\"] .ta-splash {"));
    for (const name of ["bg", "line", "focus", "muted"]) {
      expect(value(splashLight, `splash-${name}`), `light ${name}`).toBe(value(light, name));
      expect(value(splashDark, `splash-${name}`), `dark ${name}`).toBe(value(dark, name));
    }
  });
});
