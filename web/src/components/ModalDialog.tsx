import { useEffect, useRef, type ReactNode } from "react";

/**
 * A modal panel over the map, built on the native <dialog> (showModal): the browser makes everything behind it inert, keeps focus
 * inside, and closes it on Escape. Phones get a full-height sheet from the right; desktop a 420px panel on the right. The map behind
 * stays mounted and untouched, so closing returns to exactly the same view.
 *
 * Focus: the dialog's close button takes focus on open. On close, focus goes back to `returnFocus` (the button that opened it),
 * explicitly, since browsers differ on where focus lands after a dialog closes.
 */
export function ModalDialog({
  id,
  open,
  onClose,
  titleId,
  title,
  returnFocus,
  children,
}: {
  id?: string;
  open: boolean;
  onClose: () => void;
  titleId: string;
  title: ReactNode;
  returnFocus: () => HTMLElement | null | undefined;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const returnTo = useRef(returnFocus);
  useEffect(() => {
    returnTo.current = returnFocus;
  });
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      closeButton.current?.focus();
    } else if (!open && dialog.open) dialog.close();
    if (!open && wasOpen.current) returnTo.current()?.focus();
    wasOpen.current = open;
  }, [open]);

  return (
    <dialog
      id={id}
      ref={ref}
      aria-labelledby={titleId}
      // Escape (the browser's cancel) and close() both end here; the parent's state then closes the dialog in React too.
      onClose={onClose}
      // A tap on the backdrop (outside the panel) closes it.
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 m-0 ml-auto h-full max-h-none w-full max-w-[min(26.25rem,100%)] overflow-hidden border-l border-line bg-surface p-0 text-ink shadow-[-4px_0_16px_rgb(0_0_0/0.25)] backdrop:bg-[#0b0e11]/45"
    >
      <div className="flex h-full flex-col pb-[env(safe-area-inset-bottom)] pr-[env(safe-area-inset-right)] pt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-2 border-b border-line px-4 py-2">
          <h2 id={titleId} className="flex-1 text-[19px] font-bold">
            {title}
          </h2>
          <button ref={closeButton} type="button" onClick={onClose} className="-mr-2 grid size-12 place-items-center rounded-[4px] hover:bg-raised" aria-label="Close">
            <svg viewBox="0 0 20 20" className="size-5" aria-hidden="true">
              <path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </dialog>
  );
}
