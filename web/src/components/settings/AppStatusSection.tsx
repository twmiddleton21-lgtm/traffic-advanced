import { builtLabel, versionLabel, type AppVersion } from "../../app/version.ts";
import type { UpdateState } from "../../app/updates.ts";
import { formatTime } from "../../domain/dataStatus.ts";
import { Fact, SettingsSection } from "./SettingsSection.tsx";

/** The app build (separate from the traffic data's version), its update state, and any current problems. */
export function AppStatusSection({
  version,
  update,
  onCheck,
  onReload,
  warnings,
}: {
  version: AppVersion;
  update: UpdateState;
  onCheck: () => void;
  onReload: () => void;
  warnings: string[];
}) {
  return (
    <SettingsSection title="App status">
      <dl>
        <Fact label="App version">{versionLabel(version)}</Fact>
        <Fact label="Built">{builtLabel(version)}</Fact>
      </dl>
      <p className="mt-1 text-[13px] text-muted">This is the app itself. The traffic data has its own version, under Data status.</p>
      <div className="mt-3">
        <UpdateStatus update={update} onCheck={onCheck} onReload={onReload} />
      </div>
      <h4 className="mt-4 font-bold">Problems</h4>
      {warnings.length === 0 ? (
        <p className="text-[14px]">No problems right now.</p>
      ) : (
        <ul className="mt-1 list-disc space-y-1 pl-5 text-[14px]">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
    </SettingsSection>
  );
}

const button = "min-h-12 rounded-[4px] border border-line px-4 font-bold hover:bg-raised disabled:cursor-progress disabled:opacity-70";

export function UpdateStatus({ update, onCheck, onReload }: { update: UpdateState; onCheck: () => void; onReload: () => void }) {
  switch (update.kind) {
    case "unsupported":
      return <p className="text-[14px]">{update.reason}</p>;
    case "current":
      return (
        <div className="space-y-2 text-[14px]">
          <p>
            {update.checking
              ? "Checking for a new version…"
              : update.checkFailed
                ? "Couldn't check for a new version. Check your connection."
                : update.checkedAt !== null
                  ? `No new version found when checked at ${formatTime(update.checkedAt)}.`
                  : "The app checks for a new version each time it opens, and every hour while it is open."}
          </p>
          <button type="button" className={button} onClick={onCheck} disabled={update.checking} aria-busy={update.checking}>
            Check for a new version
          </button>
        </div>
      );
    case "downloading":
      return <p className="text-[14px]">A new version is downloading. You'll be asked before it's used.</p>;
    case "ready":
      return (
        <div className="space-y-2 text-[14px]">
          <p className="font-bold">A new version of Traffic Advanced is ready.</p>
          <p>Reload to use it. The map reloads at its starting view.</p>
          <button type="button" className={button} onClick={onReload} disabled={update.reloading} aria-busy={update.reloading}>
            {update.reloading ? "Reloading…" : "Reload to update"}
          </button>
        </div>
      );
    case "applied-elsewhere":
      return (
        <div className="space-y-2 text-[14px]">
          <p className="font-bold">Traffic Advanced was updated in another tab.</p>
          <p>Reload this page to use the new version.</p>
          <button type="button" className={button} onClick={onReload}>
            Reload
          </button>
        </div>
      );
  }
}
