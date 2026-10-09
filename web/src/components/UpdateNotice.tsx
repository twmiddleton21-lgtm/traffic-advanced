import type { UpdateState } from "../app/updates.ts";

/**
 * Says a new version is ready and offers Reload; it never reloads by itself. "Later" hides it for this visit (Settings still shows the
 * update). A polite status, so it doesn't interrupt someone reading the map.
 */
export function UpdateNotice({ update, dismissed, onReload, onDismiss }: { update: UpdateState; dismissed: boolean; onReload: () => void; onDismiss: () => void }) {
  if (dismissed || (update.kind !== "ready" && update.kind !== "applied-elsewhere")) return null;
  const elsewhere = update.kind === "applied-elsewhere";
  const reloading = update.kind === "ready" && update.reloading;
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-raised px-4 py-1.5 text-[14px]">
      <p className="flex-1 py-1">
        <span className="font-bold">{elsewhere ? "Traffic Advanced was updated in another tab." : "A new version of Traffic Advanced is ready."}</span>{" "}
        {elsewhere ? "Reload this page to use it." : "Reload when you're ready; the map reloads at its starting view."}
      </p>
      <button type="button" onClick={onReload} disabled={reloading} aria-busy={reloading} className="min-h-12 rounded-[4px] border border-line bg-surface px-4 font-bold hover:bg-bg disabled:opacity-70">
        {reloading ? "Reloading…" : elsewhere ? "Reload" : "Reload to update"}
      </button>
      <button type="button" onClick={onDismiss} className="min-h-12 rounded-[4px] px-3 font-bold underline">
        Later
      </button>
    </div>
  );
}
