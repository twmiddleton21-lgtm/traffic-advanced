import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import viteConfig from "../../vite.config.ts";

/** Static security headers (web/public/_headers, served by Workers Static Assets) and production build settings. */
function parseHeaders(text: string): Map<string, Map<string, string>> {
  const rules = new Map<string, Map<string, string>>();
  let current: Map<string, string> | undefined;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim() || line.trimStart().startsWith("#")) continue;
    if (!/^\s/.test(line)) rules.set(line.trim(), (current = new Map<string, string>()));
    else {
      const i = line.indexOf(":");
      current?.set(line.slice(0, i).trim().toLowerCase(), line.slice(i + 1).trim());
    }
  }
  return rules;
}

const all = parseHeaders(readFileSync("web/public/_headers", "utf8")).get("/*");
const csp = new Map(
  (all?.get("content-security-policy") ?? "")
    .split(";")
    .map((d) => d.trim().split(/\s+/))
    .filter((d) => d[0])
    .map(([name, ...sources]) => [name!, sources]),
);
const inlineScriptHashes = (html: string) =>
  [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => `'sha256-${createHash("sha256").update(m[1]!).digest("base64")}'`);

const sourceFiles: string[] = [];
const walk = (dir: string): void => {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name)) sourceFiles.push(path);
  }
};
walk("web/src");

describe("static security headers", () => {
  it("apply to every static path", () => {
    expect(all).toBeDefined();
    expect(all?.get("x-content-type-options")).toBe("nosniff");
    expect(all?.get("referrer-policy")).toBe("no-referrer");
    expect(all?.get("strict-transport-security")).toMatch(/max-age=\d{7,}/);
    expect(all?.get("x-frame-options")).toBe("DENY");
    expect(all?.get("permissions-policy")).toMatch(/camera=\(\)/);
  });

  it("CSP allows no inline code, eval or wildcard sources", () => {
    const policy = all?.get("content-security-policy") ?? "";
    expect(policy).not.toMatch(/'unsafe-inline'|'unsafe-eval'|'unsafe-hashes'|\s\*|https:\s|http:/);
    expect(csp.get("default-src")).toEqual(["'self'"]);
    expect(csp.get("style-src")).toEqual(["'self'"]);
    expect(csp.get("font-src")).toEqual(["'self'"]);
    for (const d of ["object-src", "base-uri", "form-action", "frame-ancestors"]) expect(csp.get(d), d).toEqual(["'none'"]);
  });

  it("CSP allows the inline theme script only by its exact hash (update _headers if web/index.html's script changes)", () => {
    const hashes = inlineScriptHashes(readFileSync("web/index.html", "utf8"));
    expect(hashes).toHaveLength(1);
    expect(csp.get("script-src")).toEqual(["'self'", ...hashes]);
  });

  it("CSP connects only to our origin and the external hosts the app's code actually uses", () => {
    const hosts = new Set(sourceFiles.flatMap((f) => [...readFileSync(f, "utf8").matchAll(/https:\/\/([a-z0-9.-]+)/g)].map((m) => `https://${m[1]}`)));
    expect([...hosts]).toEqual(["https://tiles.openfreemap.org"]);
    expect(csp.get("connect-src")).toEqual(["'self'", ...hosts]);
  });

  it("MapLibre: self-hosted worker (no blob: workers), images decoded from data:/blob: (MapLibre v6 CSP guidance)", () => {
    expect(readFileSync("web/src/map/MapView.tsx", "utf8")).toMatch(/setWorkerUrl\(workerUrl\)/);
    expect(csp.get("worker-src")).toEqual(["'self'"]);
    expect(csp.get("img-src")).toEqual(["'self'", "data:", "blob:"]);
  });
});

describe("production build", () => {
  it("publishes no source maps", () => {
    expect(viteConfig.build?.sourcemap).toBe(false);
  });

  it("copies _headers into the deployed assets (Vite's public directory)", () => {
    // Vite copies <root>/public into the build output; the headers file lives there.
    expect(viteConfig.root).toBe("web");
    expect(viteConfig.publicDir).toBeUndefined();
  });
});
