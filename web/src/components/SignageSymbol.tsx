/**
 * The diversion signage symbol NH records for a route ("Triangle - Solid", "Diamond - Hollow", …), drawn as on the
 * yellow roadside signs drivers follow. Unknown values are shown as text, never guessed.
 */
export function SignageSymbol({ value }: { value: string | null }) {
  if (!value) return <span className="text-muted">Not recorded</span>;
  const match = /^(Triangle|Square|Circle|Diamond) - (Solid|Hollow)$/.exec(value);
  const shape = match?.[1];
  const fill = match?.[2];
  if (!shape || !fill) return <span>{value}</span>;
  const solid = fill === "Solid";
  const common = { fill: solid ? "#14191e" : "none", stroke: "#14191e", strokeWidth: 3 };
  const glyph =
    shape === "Triangle" ? (
      <polygon points="12,3 21,20 3,20" {...common} strokeLinejoin="round" />
    ) : shape === "Square" ? (
      <rect x="4" y="4" width="16" height="16" {...common} />
    ) : shape === "Circle" ? (
      <circle cx="12" cy="12" r="8" {...common} />
    ) : (
      <polygon points="12,2 22,12 12,22 2,12" {...common} strokeLinejoin="round" />
    );
  return (
    <span className="inline-flex items-center gap-2">
      <span className="grid size-8 place-items-center rounded-[3px] bg-sign" aria-hidden="true">
        <svg viewBox="0 0 24 24" className="size-6">
          {glyph}
        </svg>
      </span>
      <span>
        {fill} {shape.toLowerCase()}
      </span>
    </span>
  );
}
