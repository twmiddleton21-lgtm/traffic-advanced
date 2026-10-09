import type { ReactNode } from "react";
import { RESTRICTIONS_DISCLAIMER, type RestrictionPointsFile, type ZonesFile } from "../../../shared/api/restrictions.ts";
import { allowedLink, formatDate, heightWordingNote, isStale, kindLabel, limitText, locationText, osmElementUrl, sourceLabel, UNRECORDED_WEIGHT_NOTE, wordingImperialHeight } from "../restrictions/describe.ts";
import { findPoint, LIST_LIMIT, pointsInView, zonesInView, type ListedPoint, type ListedZone } from "../restrictions/inView.ts";
import { RESTRICTION_MIN_ZOOM } from "../map/restrictionLayers.ts";
import type { MapViewArea } from "../map/MapView.tsx";
import { ModalDialog } from "./ModalDialog.tsx";

const link = "inline-flex min-h-12 items-center font-bold text-motorway underline decoration-2 underline-offset-2 hover:no-underline dark:text-sign";

/**
 * Restrictions in the current view, and one restriction's details. This is how keyboard and screen-reader users reach every
 * restriction (map markers are pointer targets only); tapping a marker opens the same details. The disclaimer is always shown.
 */
export function RestrictionsDialog({
  open,
  onClose,
  returnFocus,
  view,
  points,
  zones,
  selectedId,
  onSelect,
  now,
}: {
  open: boolean;
  onClose: () => void;
  returnFocus: () => HTMLElement | null | undefined;
  view: MapViewArea | null;
  points: RestrictionPointsFile[];
  zones: ZonesFile[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  now: Date;
}) {
  const selected = selectedId ? findPoint(points, selectedId) : null;
  const files = [...points, ...zones];
  const stale = files.some((f) => isStale(f.generatedAt, now));
  return (
    <ModalDialog id="restrictions-dialog" open={open} onClose={onClose} titleId="restrictions-title" title={selected ? kindLabel(selected.point) : "Restrictions in this view"} returnFocus={returnFocus}>
      <div className="space-y-3 px-4 py-4">
        <p className="rounded-[4px] border-l-4 border-sign bg-raised px-3 py-2 text-[14px] font-bold">{RESTRICTIONS_DISCLAIMER}</p>
        {stale && <p className="text-[14px] font-bold text-stale">This restriction data was downloaded more than four months ago and may be out of date.</p>}
        {selected ? (
          <>
            <button type="button" onClick={() => onSelect(null)} className="min-h-12 rounded-[4px] border border-line px-4 font-bold hover:bg-raised">
              Back to the list
            </button>
            <PointDetails item={selected} />
          </>
        ) : (
          <InViewList view={view} points={points} zones={zones} onSelect={onSelect} />
        )}
      </div>
    </ModalDialog>
  );
}

function InViewList({ view, points, zones, onSelect }: { view: MapViewArea | null; points: RestrictionPointsFile[]; zones: ZonesFile[]; onSelect: (id: string) => void }) {
  if (!view) return <p className="text-[14px]">The map is still loading.</p>;
  const listedZones = zonesInView(zones, view.bounds);
  const zoomedIn = view.zoom >= RESTRICTION_MIN_ZOOM;
  const { items, total } = zoomedIn ? pointsInView(points, view.bounds, view.centre) : { items: [], total: 0 };
  return (
    <>
      {listedZones.map((z) => (
        <ZoneDetails key={z.zone.id} item={z} />
      ))}
      {points.length > 0 && !zoomedIn && <p className="text-[14px]">Zoom in on the map to list height and weight restrictions here.</p>}
      {points.length > 0 && zoomedIn && (
        <>
          <p className="text-[14px]" role="status">
            {total === 0
              ? "No restrictions are recorded in this view. That does not mean there are none."
              : total > LIST_LIMIT
                ? `${total} recorded in this view. The ${LIST_LIMIT} nearest the centre are listed; zoom in to narrow the list.`
                : `${total} recorded in this view, nearest the centre first.`}
          </p>
          <ul className="divide-y divide-line rounded-[4px] border border-line">
            {items.map(({ point, records, source }) => (
              <li key={point.id}>
                <button type="button" onClick={() => onSelect(point.id)} className="flex min-h-12 w-full flex-col items-start px-3 py-2 text-left hover:bg-raised">
                  <span className="font-bold">
                    {kindLabel(point)}: {limitText(point)}
                  </span>
                  <span className="text-[13px]">{locationText(point)}</span>
                  {records.length > 1 && <span className="text-[13px]">{`Recorded ${records.length} times at this place (once per diversion route), shown once`}</span>}
                  <span className="text-[13px] text-muted">{source.kind === "community" ? "Community record, unverified" : `Source: ${source.authority}`}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {points.length === 0 && listedZones.length === 0 && <p className="text-[14px]">Nothing from the restriction layers you switched on is in this view.</p>}
    </>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="py-1 text-[14px]">
      <dt className="text-muted">{label}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  );
}

export function PointDetails({ item: { point: p, records, source } }: { item: ListedPoint }) {
  // When the source's own wording states the height (e.g. "14ft 0ins"), it leads, verbatim; no conversion is shown beside it.
  const worded = p.kind === "height" && p.limit.min === p.limit.max && wordingImperialHeight(p.sourceText) !== null;
  const wordingNote = heightWordingNote(p);
  const contexts = [...new Set(records.map((r) => r.context).filter((c): c is string => Boolean(c)))];
  return (
    <div className="space-y-2">
      <p className="text-[22px] font-bold">{limitText(p)}</p>
      {worded && (
        <p className="rounded-[4px] border-l-4 border-sign bg-raised px-3 py-2 text-[16px] font-bold">
          {`Wording recorded by ${source.authority}: “${p.sourceText}”`}
        </p>
      )}
      <p className={`text-[14px] font-bold ${source.kind === "community" ? "text-stale" : ""}`}>{sourceLabel(source)}</p>
      <dl className="divide-y divide-line">
        <Row label="Type">{kindLabel(p)}</Row>
        <Row label="Recorded value">{p.recorded}</Row>
        <Row label="Location">{locationText(p)}</Row>
        {p.extentMetres !== null && p.extentMetres > 0 && <Row label="Recorded along">{`About ${p.extentMetres >= 1000 ? `${(p.extentMetres / 1000).toFixed(1)} km` : `${p.extentMetres} m`} of road`}</Row>}
        {wordingNote && <Row label="Feet and inches">{wordingNote}</Row>}
        {p.sourceText && !worded && <Row label="Source wording">{`“${p.sourceText}”`}</Row>}
        {contexts.length === 1 && <Row label="Where recorded">{contexts[0]}</Row>}
        {contexts.length > 1 && (
          <Row label={`Where recorded (${records.length} records of this restriction, shown once)`}>
            <ul className="list-disc pl-5">
              {contexts.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </Row>
        )}
        {p.conditions.length > 0 && (
          <Row label="Conditions or exemptions recorded (as written, not interpreted)">
            <ul className="list-disc pl-5">
              {p.conditions.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </Row>
        )}
        {p.kind === "weight-unrecorded-type" && <Row label="What this value doesn't tell you">{UNRECORDED_WEIGHT_NOTE}</Row>}
        {p.limit.min !== p.limit.max && <Row label="Note">The source records only a height band, not the exact clearance. Check the sign on the structure.</Row>}
        <Row label="Source">{`${source.authority}: ${source.name}`}</Row>
        <Row label="Data date">
          {[p.lastEdited && `Record last edited ${formatDate(p.lastEdited)}`, source.datasetDate && `Source updated ${formatDate(source.datasetDate)}`, `Downloaded ${formatDate(source.fetchedAt)}`]
            .filter(Boolean)
            .join(". ")}
        </Row>
        {source.notes.length > 0 && (
          <Row label="Limitations">
            <ul className="list-disc pl-5">
              {source.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </Row>
        )}
        {p.osm && (
          <Row label="OpenStreetMap tags">
            <ul className="font-mono text-[13px]">
              {Object.entries(p.osm.tags).map(([k, v]) => (
                <li key={k}>{`${k}=${v}`}</li>
              ))}
            </ul>
          </Row>
        )}
        <Row label="Licence">{`${source.attribution} ${source.licence.name}.`}</Row>
      </dl>
      {p.osm && (
        <a href={osmElementUrl(p.osm.type, p.osm.id)} target="_blank" rel="noopener noreferrer" className={link}>
          {`View this record on OpenStreetMap (${p.osm.type} ${p.osm.id})`}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}
    </div>
  );
}

function ZoneDetails({ item: { zone, source } }: { item: ListedZone }) {
  return (
    <section className="space-y-1 rounded-[4px] border border-line px-3 py-2 text-[14px]" aria-label={zone.name}>
      <p className="font-bold">This view includes part of the {zone.name}</p>
      <p>{sourceLabel(source)}. TfL says:</p>
      {zone.rules.map((r) => (
        <blockquote key={r} className="border-l-2 border-line pl-2">
          {r}
        </blockquote>
      ))}
      <ul className="list-disc pl-5 text-[13px]">
        {source.notes.map((n) => (
          <li key={n}>{n}</li>
        ))}
      </ul>
      {allowedLink(zone.rulesUrl) && (
        <a href={allowedLink(zone.rulesUrl)!} target="_blank" rel="noopener noreferrer" className={link}>
          {`Check your vehicle on TfL's ${zone.id.toUpperCase()} page`}
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      )}
    </section>
  );
}
