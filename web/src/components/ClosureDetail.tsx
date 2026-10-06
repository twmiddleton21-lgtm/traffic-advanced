import type { ReactNode } from "react";
import type { ClosuresSnapshot, OfficialRoute, TrafficClosure } from "../../../shared/api/closures.ts";
import { confirmedJunctions, directionLabel, formatDateTime, formatWindow } from "../domain/filters.ts";
import { classificationMeaning, formatRestriction } from "../domain/units.ts";
import { DiversionBadge } from "./DiversionBadge.tsx";
import { HgvStatus } from "./HgvStatus.tsx";
import { RoadShield } from "./RoadShield.tsx";
import { SignageSymbol } from "./SignageSymbol.tsx";

interface Props {
  closure: TrafficClosure;
  provenance: ClosuresSnapshot["provenance"];
  onClose: () => void;
}

const SOURCE: Record<TrafficClosure["source"], string> = {
  "nh-s1": "National Highways Road and Lane Closures",
  "nh-s2": "National Highways Public Scheduled Road Closures",
};

export function ClosureDetail({ closure: c, provenance, onClose }: Props) {
  const junctions = confirmedJunctions(c);
  return (
    <article className="flex h-full flex-col" aria-labelledby="closure-title">
      <header className="flex items-start gap-3 border-b border-line px-5 py-4">
        <RoadShield road={c.road} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 id="closure-title" className="text-[21px] font-bold leading-tight">
            {directionLabel(c.direction)} closure
          </h2>
          <p className="text-muted">{formatWindow(c.window)}</p>
        </div>
        <button type="button" onClick={onClose} className="min-h-12 rounded-[4px] border border-line px-3.5 font-bold hover:bg-raised lg:min-h-0 lg:px-2.5 lg:py-1" aria-label="Close details">
          Close
        </button>
      </header>

      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
        <div className="flex flex-wrap gap-2">
          {c.classes.map((cls) => (
            <DiversionBadge key={cls} cls={cls} variant="full" />
          ))}
        </div>

        <Warnings closure={c} />

        <Section title="Closure">
          <Facts>
            <Fact label="Road">{c.roads.length > 1 ? `${c.roads.join(" continuing onto ")}` : c.road}</Fact>
            <Fact label="Direction">{directionLabel(c.direction)}</Fact>
            <Fact label="Junctions">
              {junctions ? `${junctions.from} to ${junctions.to}` : <Unavailable>Not determined by the matcher</Unavailable>}
            </Fact>
            <Fact label="When">{formatWindow(c.window)}</Fact>
            <Fact label="Type">{c.fullCarriagewayClosure ? "Full carriageway closure" : "Not a full carriageway closure, per NH's description"}</Fact>
          </Facts>
          {c.nhText.length > 0 && (
            <div className="mt-3">
              <p className="mb-1 text-[13px] text-muted">National Highways description</p>
              {c.nhText.map((t) => (
                <blockquote key={t} className="border-l-4 border-line pl-3">
                  {t}
                </blockquote>
              ))}
            </div>
          )}
          <details className="mt-3">
            <summary className="cursor-pointer text-[14px] font-bold">Closed sections ({c.closedSections.length})</summary>
            <ul className="mt-2 space-y-1 text-[14px] text-muted">
              {c.closedSections.map((s) => (
                <li key={s.description}>
                  {s.description}
                  {s.links > 1 ? ` (${s.links} links)` : ""}
                </li>
              ))}
            </ul>
          </details>
        </Section>

        <Section title="Diversion">
          {c.officialText && <OfficialText text={c.officialText} />}
          {c.matchedRoute && <MatchedRoute route={c.matchedRoute} />}
          {c.noReliableDiversion && (
            <div className="space-y-2">
              <p className="font-bold">{c.noReliableDiversion.label}</p>
              <p>{c.noReliableDiversion.reason}</p>
              <p className="text-[14px] text-muted">First failing check: {c.noReliableDiversion.failedEvidence}</p>
              {c.noReliableDiversion.genericNote && (
                <p className="text-[14px]">
                  <span className="text-muted">National Highways note: </span>“{c.noReliableDiversion.genericNote}”
                </p>
              )}
              <p className="text-[14px]">Follow signed diversions and official instructions.</p>
            </div>
          )}
        </Section>

        <Section title="HGV information">
          {c.matchedRoute ? (
            <p className="text-[14px] text-muted">Shown for each official route above.</p>
          ) : (
            <Unavailable>No official route was matched, so there is no route-specific HGV information.</Unavailable>
          )}
        </Section>

        <Section title="Data">
          <Facts>
            <Fact label="Source">{SOURCE[c.source]}</Fact>
            <Fact label="NH data from">{formatDateTime(provenance.capturedAt)}</Fact>
            <Fact label="Data status">{provenance.kind === "live" ? "Live" : `${provenance.label}, not live`}</Fact>
            <Fact label="NH reference">Situation {c.situationId}</Fact>
          </Facts>
        </Section>

        <SafetyNotice />
      </div>
    </article>
  );
}

function Warnings({ closure: c }: { closure: TrafficClosure }) {
  const items: string[] = [];
  if (c.reviewNote) items.push(c.reviewNote);
  if (c.roads.length > 1) items.push(`This closure continues from ${c.roads[0]} onto ${c.roads.slice(1).join(", ")}.`);
  if (!c.fullCarriagewayClosure) items.push("NH describes this as works other than a full carriageway closure (for example a layby or slip road).");
  if (items.length === 0) return null;
  return (
    <ul className="space-y-1.5 rounded-[4px] border border-sign px-3 py-2.5" aria-label="Warnings">
      {items.map((w) => (
        <li key={w} className="flex gap-2">
          <span aria-hidden="true">⚠</span>
          <span>{w}</span>
        </li>
      ))}
    </ul>
  );
}

function OfficialText({ text }: { text: NonNullable<TrafficClosure["officialText"]> }) {
  return (
    <div className="mb-4 rounded-[4px] bg-sign px-4 py-3 text-[#14191e]">
      <p className="text-[13px] font-bold">{text.label}</p>
      {text.statements.map((s) => (
        <p key={s} className="mt-1 text-[17px] font-bold leading-snug">
          {s}
        </p>
      ))}
      <p className="mt-2 text-[13px]">
        National Highways text for roadworks event {text.eventNumber}. It may cover more than one closure in that event.
      </p>
    </div>
  );
}

function MatchedRoute({ route }: { route: NonNullable<TrafficClosure["matchedRoute"]> }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="font-bold">{route.label}</p>
        <p className="text-[14px] text-muted">{route.confidence}</p>
        <p className="mt-2">
          Official stretch: <strong>{route.stretch.label}</strong>
        </p>
        <p className="mt-2 text-[14px]">Pre-agreed emergency diversion route. The signed route on the day may differ: follow road signs.</p>
        <p className="text-[14px]">Emergency diversion routes are not designed for abnormal loads.</p>
      </div>
      {route.routes.map((r) => (
        <RouteCard key={r.routeId} route={r} />
      ))}
      <details>
        <summary className="cursor-pointer text-[14px] font-bold">Why this route is shown (evidence E1 to E8)</summary>
        <ol className="mt-2 space-y-1.5 text-[14px]">
          {route.evidence.map((e) => (
            <li key={e.id} className="grid grid-cols-[2.5rem_1fr] gap-2">
              <span className="font-bold">{e.id}</span>
              <span>{e.detail}</span>
            </li>
          ))}
        </ol>
      </details>
    </div>
  );
}

function RouteCard({ route: r }: { route: OfficialRoute }) {
  return (
    <section className="space-y-3 rounded-[4px] border border-line p-3" aria-label={`Route ${r.routeId}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SignageSymbol value={r.signageSymbol} />
        <HgvStatus status={r.hgvStatus} />
      </div>
      <p className="text-[14px]">“{r.description.trim()}”</p>
      <Facts>
        <Fact label="Route">{r.routeId}</Fact>
        <Fact label="Classification">{classificationMeaning(r.classification)}</Fact>
        <Fact label="Length">{r.lengthMiles !== null ? `${r.lengthMiles} miles` : <Unavailable>Not recorded</Unavailable>}</Fact>
        <Fact label="NH time estimate">
          {r.estimatedTravelTime !== null ? `${r.estimatedTravelTime} (unit not stated by NH)` : <Unavailable>Not recorded</Unavailable>}
        </Fact>
        <Fact label="Restrictions">
          {r.restrictions.length > 0 ? (
            <ul>
              {r.restrictions.map((x, i) => (
                <li key={i}>{formatRestriction(x)}</li>
              ))}
            </ul>
          ) : (
            "None recorded by National Highways"
          )}
        </Fact>
      </Facts>
      <ul className="space-y-1 text-[14px]">
        {r.hgvReasons.map((reason) => (
          <li key={reason}>{reason}</li>
        ))}
      </ul>
    </section>
  );
}

function SafetyNotice() {
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[17px] font-bold">{title}</h3>
      {children}
    </section>
  );
}

function Facts({ children }: { children: ReactNode }) {
  return <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-1.5">{children}</dl>;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted">{label}</dt>
      <dd>{children}</dd>
    </>
  );
}

function Unavailable({ children }: { children: ReactNode }) {
  return <span className="italic text-muted">{children}</span>;
}
