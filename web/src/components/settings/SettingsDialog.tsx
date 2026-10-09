import type { ComponentProps } from "react";
import { ModalDialog } from "../ModalDialog.tsx";
import { AppearanceSection } from "./AppearanceSection.tsx";
import { AppStatusSection } from "./AppStatusSection.tsx";
import { DataHelpSection } from "./DataHelpSection.tsx";
import { RestrictionsSection } from "./RestrictionsSection.tsx";

/** Settings over the map: appearance, road restriction layers, app status and updates, data status and help, contact. */
export function SettingsDialog({
  open,
  onClose,
  returnFocus,
  appearance,
  restrictions,
  appStatus,
  dataHelp,
}: {
  open: boolean;
  onClose: () => void;
  returnFocus: () => HTMLElement | null | undefined;
  appearance: ComponentProps<typeof AppearanceSection>;
  restrictions: ComponentProps<typeof RestrictionsSection>;
  appStatus: ComponentProps<typeof AppStatusSection>;
  dataHelp: ComponentProps<typeof DataHelpSection>;
}) {
  return (
    <ModalDialog id="settings-dialog" open={open} onClose={onClose} titleId="settings-title" title="Settings" returnFocus={returnFocus}>
      <AppearanceSection {...appearance} />
      <RestrictionsSection {...restrictions} />
      <AppStatusSection {...appStatus} />
      <DataHelpSection {...dataHelp} />
    </ModalDialog>
  );
}
