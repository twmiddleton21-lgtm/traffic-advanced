import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TOMTOM_TRAFFIC_CREDIT } from "./credits.ts";
import { TrafficAttribution } from "./TrafficAttribution.tsx";

/** DEFERRED (README.md here): TomTom's provisional credit, kept for the later traffic release. Not shown in the first release. */
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : /\.(ts|tsx)$/.test(n) && !/\.test\.ts$/.test(n) ? [p] : [];
  });

describe("deferred TomTom attribution bubble", () => {
  const out = renderToStaticMarkup(h(TrafficAttribution));

  it("is a link to TomTom's product attributions, opened safely in a new tab and announced as such", () => {
    expect(TOMTOM_TRAFFIC_CREDIT.url).toBe("https://www.tomtom.com/en-gb/legal/product-attributions/");
    expect(out).toContain(`<a href="${TOMTOM_TRAFFIC_CREDIT.url}" target="_blank" rel="noopener noreferrer"`);
    expect(out).toContain(">Traffic © TomTom<span class=\"sr-only\"> (TomTom product attributions, opens in a new tab)</span></a>");
  });

  it("sits at the bottom centre, clear of the map key and map credits, with a 48 px tap area on a small pill", () => {
    expect(out).toMatch(/^<div class="pointer-events-none absolute inset-x-0 bottom-\[calc\(0\.5rem\+env\(safe-area-inset-bottom\)\)\] z-\[1\][^"]*justify-center">/);
    expect(out).toMatch(/text-\[12px\][^"]*before:-inset-y-3\b/);
  });

  it("its wording is marked provisional: TomTom's Copyright API, not a fixed string, sets the final text", () => {
    expect(TOMTOM_TRAFFIC_CREDIT.provisional).toBe(true);
    expect(readFileSync("web/src/deferred/traffic/credits.ts", "utf8")).toMatch(/PROVISIONAL[\s\S]*TomTom Copyright API/);
  });

  it("the browser never talks to TomTom or holds a key: only the Worker's (unrouted) traffic module names TomTom's API", () => {
    for (const f of [...files("web/src"), ...files("shared"), "wrangler.jsonc"]) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/api\.tomtom\.com|TOMTOM_API_KEY|TomTom-Api-Key/i);
    }
    const workerFiles = files("worker/src").filter((f) => /api\.tomtom\.com|TOMTOM_API_KEY|TomTom-Api-Key/i.test(readFileSync(f, "utf8")));
    expect(workerFiles.map((f) => f.replaceAll("\\", "/"))).toEqual(["worker/src/traffic/traffic.ts"]);
    // The key would only ever be read from the Worker's environment (its secret): no key value anywhere in the code.
    for (const f of [...files("web/src"), ...files("worker/src")]) expect(readFileSync(f, "utf8"), f).not.toMatch(/TOMTOM_API_KEY\s*[:=]\s*["'`][^"'`]+/);
  });
});
