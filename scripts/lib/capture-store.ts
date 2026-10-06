import { mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

export interface ManifestEntry {
  source: string;
  file: string;
  url: string;
  fetchedAt: string;
  records?: number;
  expectedRecords?: number;
  sourceLastEditDate?: string;
  notes?: string;
}

/** One capture run = one timestamped folder under data/raw (git-ignored), with a manifest. */
export class CaptureRun {
  readonly dir: string;
  readonly startedAt: string;
  private readonly entries: ManifestEntry[] = [];

  constructor(root: string, label: string) {
    this.startedAt = new Date().toISOString();
    const stamp = this.startedAt.replace(/[:.]/g, "").slice(0, 15) + "Z";
    this.dir = join(root, "data", "raw", `${stamp}-${label}`);
  }

  async writeJson(relPath: string, data: unknown, entry: Omit<ManifestEntry, "file">): Promise<void> {
    await this.writeRaw(relPath, JSON.stringify(data), entry);
  }

  async writeRaw(relPath: string, data: string | Uint8Array, entry: Omit<ManifestEntry, "file">): Promise<void> {
    const path = join(this.dir, relPath);
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, data);
    this.entries.push({ ...entry, file: relative(this.dir, path).replaceAll("\\", "/") });
  }

  async writeManifest(extra: Record<string, unknown> = {}): Promise<string> {
    const manifest = { startedAt: this.startedAt, finishedAt: new Date().toISOString(), ...extra, entries: this.entries };
    const path = join(this.dir, "manifest.json");
    await mkdir(this.dir, { recursive: true });
    await writeFile(path, JSON.stringify(manifest, null, 2));
    return path;
  }
}
