/** The safety notice from SPECIFICATION §9, shown on every closure's details and in Settings. Wording must not change silently. */
export function SafetyNotice() {
  return (
    <aside className="rounded-[4px] bg-raised px-4 py-3 text-[14px]" aria-label="Safety notice">
      <p className="font-bold">For planning only. Do not use while driving.</p>
      <p className="mt-1">
        Always follow road signs, police and National Highways instructions and temporary traffic management. If this app conflicts with signs on
        the road, the signs take priority.
      </p>
    </aside>
  );
}
