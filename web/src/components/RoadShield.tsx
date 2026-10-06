/**
 * UK road number shield: motorways (and A-road motorways like A1(M)) white on blue, primary A roads yellow on green.
 */
export function RoadShield({ road, size = "md" }: { road: string; size?: "sm" | "md" | "lg" }) {
  const motorway = /^M\d/.test(road) || /\(M\)$|^A\d+M$/.test(road);
  const label = /^A\d+M$/.test(road) ? `${road.slice(0, -1)}(M)` : road;
  const sizes = { sm: "text-[13px] px-1.5 py-0.5 min-w-10", md: "text-[15px] px-2 py-0.5 min-w-12", lg: "text-[21px] px-2.5 py-1 min-w-16" };
  return (
    <span
      className={`inline-flex items-center justify-center rounded-[4px] font-bold leading-none tabular-nums ring-2 ring-inset ring-white/90 ${sizes[size]} ${
        motorway ? "bg-motorway text-white" : "bg-primary-route text-primary-text"
      }`}
      aria-label={`Road ${label}`}
    >
      {label}
    </span>
  );
}
