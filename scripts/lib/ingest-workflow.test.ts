import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** The GitHub Actions ingestion runner (.github/workflows/ingest.yml): safety properties that must not drift silently. */
const workflow = readFileSync(".github/workflows/ingest.yml", "utf8");
const active = workflow
  .split(/\r?\n/)
  .filter((l) => !l.trimStart().startsWith("#"))
  .join("\n");

describe("ingest workflow", () => {
  it("runs every 15 minutes (owner-approved) and can still be started by hand", () => {
    expect(active).toMatch(/^\s*workflow_dispatch:/m);
    expect(active).toMatch(/^\s*schedule:\s*\n\s*- cron: "7,22,37,52 \* \* \* \*"$/m);
    expect(active.match(/cron:/g)).toHaveLength(1);
  });

  /** The text of one step, from its "- name:" line up to the next step. */
  const step = (name: string) => {
    const start = active.indexOf(`- name: ${name}`);
    expect(start, `step "${name}"`).toBeGreaterThanOrEqual(0);
    const next = active.indexOf("\n      - ", start + 1);
    return active.slice(start, next < 0 ? undefined : next);
  };

  it("defaults to a run that uploads nothing; the real bucket needs the explicit 'remote' choice", () => {
    expect(active).toMatch(/default: dry-run/);
    const noUpload = step("Ingest once (no upload)");
    const remote = step("Ingest once and publish to R2");
    // Scheduled runs (no inputs) publish; manual runs publish only with the explicit "remote" choice. The two conditions are exact
    // complements, so exactly one ingest step runs.
    expect(noUpload).toMatch(/if: \$\{\{ github\.event_name != 'schedule' && inputs\.target != 'remote' \}\}/);
    expect(noUpload).toMatch(/run: npm run ingest:once -- --no-upload$/m);
    expect(remote).toMatch(/if: \$\{\{ github\.event_name == 'schedule' \|\| inputs\.target == 'remote' \}\}/);
    expect(remote).toMatch(/run: npm run ingest:once -- --remote$/m);
    // --remote appears in exactly one place: the step gated on the explicit choice.
    expect(active.match(/--remote/g)).toHaveLength(1);
  });

  it("gives R2 credentials only to the remote step; the no-upload step gets just the NH key", () => {
    const noUpload = step("Ingest once (no upload)");
    const remote = step("Ingest once and publish to R2");
    expect(noUpload).toMatch(/NH_API_KEY: \$\{\{ secrets\.NH_API_KEY \}\}/);
    expect(noUpload).not.toMatch(/R2_|CLOUDFLARE_/);
    expect(remote).toMatch(/NH_API_KEY: \$\{\{ secrets\.NH_API_KEY \}\}/);
    for (const name of ["R2_ENDPOINT", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]) expect(remote).toContain(`${name}: \${{ secrets.${name} }}`);
    // The REST-API credentials Wrangler needed are no longer used anywhere.
    expect(active).not.toMatch(/CLOUDFLARE_API_TOKEN|CLOUDFLARE_ACCOUNT_ID/);
    // No other step (checkout, install, freeze test, artifacts) receives any secret.
    const others = active.split("\n      - ").filter((s) => !s.startsWith("name: Ingest once"));
    for (const s of others) expect(s).not.toMatch(/secrets\./);
  });

  it("pins every action to a full commit SHA", () => {
    const uses = [...active.matchAll(/uses:\s*(\S+)/g)].map((m) => m[1]!);
    expect(uses.length).toBeGreaterThan(0);
    for (const u of uses) expect(u, u).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
  });

  it("is least-privilege, never runs two ingestions at once, checks the freeze first, and passes secrets only via env", () => {
    expect(active).toMatch(/permissions:\s*\n\s*contents: read\s*\n\s*\n/);
    expect(active.match(/permissions:/g)).toHaveLength(1);
    expect(active).toMatch(/environment: ingest/);
    expect(active).toMatch(/timeout-minutes: \d+/);
    expect(active).toMatch(/concurrency:\s*\n\s*group: ingest\s*\n\s*cancel-in-progress: false/);
    expect(active.indexOf("rules-freeze.test.ts")).toBeLessThan(active.indexOf("npm run ingest:once"));
    // Secrets appear only as env values, never interpolated into a shell command.
    for (const line of active.split("\n").filter((l) => l.includes("secrets."))) expect(line).toMatch(/^\s+[A-Z][A-Z0-9_]*: \$\{\{ secrets\.[A-Z][A-Z0-9_]* \}\}$/);
    expect(active).not.toMatch(/run:.*\$\{\{/);
  });

  it("keeps only the refresh log and provenance as artifacts (no raw captures)", () => {
    expect(active).toMatch(/data\/published\/meta\.json/);
    expect(active).not.toMatch(/data\/raw/);
  });
});
