import { useId, type ReactNode } from "react";

/** One Settings section: a heading and its content, as a labelled region so screen readers can jump between sections. */
export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="border-b border-line px-4 py-4 last:border-b-0">
      <h3 id={id} className="mb-3 text-[17px] font-bold">
        {title}
      </h3>
      {children}
    </section>
  );
}

/** A label and value pair in a status list. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-3 py-0.5 text-[14px]">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}
