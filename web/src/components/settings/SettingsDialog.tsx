import type { ComponentProps } from "react";
import { ModalDialog } from "../ModalDialog.tsx";
import { AppearanceSection } from "./AppearanceSection.tsx";
import { AppStatusSection } from "./AppStatusSection.tsx";
import { DataHelpSection } from "./DataHelpSection.tsx";
import type { AppView } from "../../routemap/view.ts";
import { RestrictionsSection } from "./RestrictionsSection.tsx";
import { RoutesSection } from "./RoutesSection.tsx";

/**
 * Settings over the map, for the view that's shown: appearance, then the view's own settings (Closures: road restriction layers;
 * Routes: the route map's layers), then app status and updates, data status and help, contact. One view's settings are never shown
 * in the other, so nothing here can change what the other view shows.
 */
export function SettingsDialog({
  open,
  onClose,
  returnFocus,
  view,
  appearance,
  restrictions,
  routes,
  appStatus,
  dataHelp,
}: {
  open: boolean;
  onClose: () => void;
  returnFocus: () => HTMLElement | null | undefined;
  view: AppView;
  appearance: ComponentProps<typeof AppearanceSection>;
  restrictions: ComponentProps<typeof RestrictionsSection>;
  routes: ComponentProps<typeof RoutesSection>;
  appStatus: ComponentProps<typeof AppStatusSection>;
  dataHelp: ComponentProps<typeof DataHelpSection>;
}) {
  return (
    <ModalDialog id="settings-dialog" open={open} onClose={onClose} titleId="settings-title" title="Settings" returnFocus={returnFocus}>
      <p className="border-b border-line bg-raised px-4 py-2 text-[14px]" data-settings-view={view}>
        {view === "routes" ? "Showing settings for Routes. Closure and restriction settings are in the Closures view." : "Showing settings for Closures. Routes has its own settings."}
      </p>
      <AppearanceSection {...appearance} />
      {view === "routes" ? <RoutesSection {...routes} /> : <RestrictionsSection {...restrictions} />}
      <AppStatusSection {...appStatus} />
      <DataHelpSection {...dataHelp} />
    </ModalDialog>
  );
}
