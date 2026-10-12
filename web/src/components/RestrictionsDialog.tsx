import type { ReactNode } from "react";
import { RESTRICTIONS_DISCLAIMER, type RestrictionPointsFile, type ZonesFile } from "../../../shared/api/restrictions.ts";
import { allowedLink, formatDate, heightWordingNote, isStale, kindLabel, limitText, locationText, markerText, osmElementUrl, sourceLabel, UNRECORDED_WEIGHT_NOTE, wordingImperialHeight, ZONE_RULES_TEXT } from "../restrictions/describe.ts";
import { findPoint, findZone, LIST_LIMIT, pointsInView, type ListedPoint, type ListedZone } from "../restrictions/inView.ts";
import { RESTRICTION_OVERVIEW_ZOOM } from "../map/restrictionLayers.ts";
import type { MapViewArea } from "../map/MapView.tsx";
import { ModalDialog } from "./ModalDialog.tsx";
import { Plate } from "./RestrictionGlyphs.tsx";

const link = "inline-flex min-h-12 items-center font-bold text-motorway underline decoration-2 underline-offset-2 hover:no-underline dark:text-sign";

/** What the details dialog shows: one restriction (any of its records' ids) or one LEZ/ULEZ zone. */
export type RestrictionSelection = { kind: "point"; id: string } | { kind: "zone"; id: "lez" | "ulez" };

/**
 * One restriction's or one zone's full details, with the full disclaimer. Opened by tapping a marker on the map, or from the map
 * key: a zone's row there, or the key's keyboard list of restrictions in view (MapKey.tsx), which is how keyboard and screen-reader
 * users reach every restriction (map markers are pointer targets only).
 */
export function RestrictionsDialog({
  onClose,
  returnFocus,
  points,
  zones,
  selection,
  now,
}: {
  onClose: () => void;
  returnFocus: () => HTMLElement | null | undefined;
  points: RestrictionPointsFile[];
  zones: ZonesFile[];
  selection: RestrictionSelection | null;
  now: Date;
}) {
  const point = selection?.kind === "point" ? findPoint(points, selection.id) : null;
  const zone = selection?.kind === "zone" ? findZone(zones, selection.id) : null;
  const stale = [...points, ...zones].some((f) => isStale(f.generatedAt, now));
  const title = point ? kindLabel(point.point) : zone ? zone.zone.name : "Restriction";
  return (
    <ModalDialog id="restrictions-dialog" open={point !== null || zone !== null} onClose={onClose} titleId="restrictions-title" title={title} returnFocus={returnFocus}>
      <div className="space-y-3 px-4 py-4">
        <p className="rounded-[4px] border-l-4 border-sign bg-raised px-3 py-2 text-[14px] font-bold">{RESTRICTIONS_DISCLAIMER}</p>
        {stale && <p className="text-[14px] font-bold text-stale">{STALE_RESTRICTIONS_TEXT}</p>}
        {point && <PointDetails item={point} />}
        {zone && <ZoneDetails item={zone} />}
      </div>
    </ModalDialog>
  );
}

export const STALE_RESTRICTIONS_TEXT = "This restriction data was downloaded more than four months ago and may be out of date.";

/**
 * The restrictions in the map's current view as buttons that open their details: the keyboard and screen-reader route to every
 * restriction, inside the opened map key. Listed from the zoom the map starts drawing them at, nearest the centre first.
 */
export function InViewButtons({ view, points, onSelect }: { view: MapViewArea | null; points: RestrictionPointsFile[]; onSelect: (id: string) => void }) {
  if (points.length === 0) return null;
  if (!view) return <p>The map is still loading.</p>;
  const zoomedIn = view.zoom >= RESTRICTION_OVERVIEW_ZOOM;
  const loaded = [...new Set(points.map((f) => f.layer))].join(" and ");
  if (!zoomedIn) return <p>{`Zoom in on the map to list ${loaded} restrictions here.`}</p>;
  const { items, total } = pointsInView(points, view.bounds, view.centre);
  return (
    <>
      <p>
        {total === 0
          ? "No restrictions are recorded in this view. That does not mean there are none."
          : total > LIST_LIMIT
            ? `${total} recorded in this view. The ${LIST_LIMIT} nearest the centre are listed; zoom in to narrow the list.`
            : `${total} recorded in this view, nearest the centre first.`}
      </p>
      {items.length > 0 && (
        <ul className="divide-y divide-line rounded-[4px] border border-line">
          {items.map(({ point, records, source }) => (
            <li key={point.id}>
              <button type="button" onClick={() => onSelect(point.id)} className="flex min-h-12 w-full items-start gap-3 px-3 py-2 text-left hover:bg-raised">
                <span className="pt-0.5">
                  <Plate kind={point.kind} text={markerText(point)} community={source.kind === "community"} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="font-bold">
                    {kindLabel(point)}: {limitText(point)}
                  </span>
                  <span className="text-[13px]">{locationText(point)}</span>
                  {records.length > 1 && <span className="text-[13px]">{`Recorded ${records.length} times at this place (once per diversion route), shown once`}</span>}
                  <span className="text-[13px] text-muted">{source.kind === "community" ? "Community record, unverified" : `Source: ${source.authority}`}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
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
      <div className="flex flex-wrap items-center gap-3">
        <Plate kind={p.kind} text={markerText(p)} community={source.kind === "community"} large />
        {/* The plate is decorative (hidden from screen readers); the value in words is always given. */}
        <p className="text-[22px] font-bold">{limitText(p)}</p>
      </div>
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

export function ZoneDetails({ item: { zone, source } }: { item: ListedZone }) {
  return (
    <section className="space-y-1 text-[14px]" aria-label={zone.name}>
      <p>{sourceLabel(source)}.</p>
      {/* TfL's rule sentences stay in the data file but aren't shown: they are tfl.gov.uk website text, not TfL open data. */}
      <p>{ZONE_RULES_TEXT}</p>
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
