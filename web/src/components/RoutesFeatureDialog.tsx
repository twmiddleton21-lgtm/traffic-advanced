import { ROUTES_OSM_CAVEAT, type RoutesPoint, type RoutesSection } from "../../../shared/api/routes-layers.ts";
import { allowedLink, formatDate } from "../restrictions/describe.ts";
import { compassName, directionText, isRoutesDataStale, osmLink, routesKindLabel, routesLocationText, routesMarkerText, routesValueText, sectionTitle, STALE_ROUTES_TEXT } from "../routemap/describe.ts";
import type { RoutesListed } from "../routemap/inView.ts";
import { ModalDialog } from "./ModalDialog.tsx";
import { ROUTES_SCOPE_TEXT } from "./RoutesMapControls.tsx";
import { CameraGlyph, RoutesSymbol, SectionGlyph } from "./RoutesGlyphs.tsx";

const link = "inline-flex min-h-12 items-center font-bold text-motorway underline decoration-2 underline-offset-2 hover:no-underline dark:text-sign";

const ENFORCEMENT_TEXT = { maxspeed: "speed", average_speed: "average speed", traffic_signals: "red light" } as const;

/**
 * One Routes record's details: what OpenStreetMap contributors have mapped, as mapped. Opened by tapping a marker or section on the
 * map, or from the map key's keyboard list. The community-data caveat and the Routes scope note are always shown.
 */
export function RoutesFeatureDialog({
  record,
  dataAsOf,
  now,
  onClose,
  returnFocus,
}: {
  record: RoutesListed | null;
  dataAsOf: string | null;
  now: Date;
  onClose: () => void;
  returnFocus: () => HTMLElement | null | undefined;
}) {
  const title = record ? (record.kind === "point" ? routesKindLabel(record.point) : sectionTitle(record.section)) : "Map layer details";
  return (
    <ModalDialog id="routes-feature-dialog" open={record !== null} onClose={onClose} titleId="routes-feature-title" title={title} returnFocus={returnFocus}>
      <div className="space-y-3 px-4 py-4 text-[15px]">
        <p className="rounded-[4px] border-l-4 border-sign bg-raised px-3 py-2 text-[14px] font-bold">{ROUTES_OSM_CAVEAT}</p>
        {dataAsOf && isRoutesDataStale(dataAsOf, now) && <p className="text-[14px] font-bold text-stale">{STALE_ROUTES_TEXT}</p>}
        {record?.kind === "point" && <PointDetails point={record.point} />}
        {record?.kind === "section" && <SectionDetails section={record.section} />}
        {record && <Elements refs={record.kind === "point" ? record.point.osm : record.section.osm} />}
        <p className="text-[14px] text-muted">
          Source: © OpenStreetMap contributors, Open Database License (ODbL) 1.0.{dataAsOf ? ` OpenStreetMap data to ${formatDate(dataAsOf)}.` : ""}
        </p>
        <p className="text-[14px] font-bold">{ROUTES_SCOPE_TEXT}</p>
      </div>
    </ModalDialog>
  );
}

function PointDetails({ point: p }: { point: RoutesPoint }) {
  const camera = p.kind === "speed-camera" || p.kind === "red-light-camera";
  return (
    <>
      <p className="flex items-center gap-2 text-[17px] font-bold">
        {camera ? <CameraGlyph redLight={p.kind === "red-light-camera"} /> : <RoutesSymbol kind={p.kind} text={routesMarkerText(p)} />}
        <span>{routesValueText(p)}</span>
      </p>
      {p.conditionalOnly && <p className="font-bold">This applies only under the conditions mapped below. They aren&apos;t checked against today&apos;s date, time or your vehicle.</p>}
      {p.conditions.length > 0 && (
        <div>
          <p className="font-bold">Conditions and exemptions, as mapped</p>
          <ul className="list-disc pl-5">
            {p.conditions.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
          {!p.conditionalOnly && <p className="text-[14px]">They aren&apos;t checked against today&apos;s date, time or your vehicle. Follow the signs.</p>}
        </div>
      )}
      {p.kind === "weight-goods" && <p className="text-[14px]">A lorry (goods vehicle) weight limit as mapped. Check the sign for exemptions such as access or loading.</p>}
      {p.physical && <p className="text-[14px]">A measured clearance as mapped, not a signed limit.</p>}
      {camera && (
        <>
          {directionText(p).map((d) => (
            <p key={d}>{d}</p>
          ))}
          {p.partOf.length > 0 && <p>{`Mapped as part of ${p.partOf.map((e) => `a ${ENFORCEMENT_TEXT[e]} enforcement`).join(" and ")}.`}</p>}
        </>
      )}
      {p.recorded.length > 0 && (
        <div>
          <p className="font-bold">Mapped as</p>
          <ul className="list-disc pl-5 font-mono text-[14px]">
            {p.recorded.map((r) => (
              <li key={`${r.key}=${r.value}`}>{`${r.key} = ${r.value}`}</li>
            ))}
          </ul>
        </div>
      )}
      <p>
        <span className="font-bold">Where: </span>
        {routesLocationText(p)}
        {p.approximate && p.extentMetres !== null ? `, along about ${formatLength(p.extentMetres)} of road` : ""}
      </p>
      {p.lastEdited && <p className="text-[14px] text-muted">Last edited in OpenStreetMap {formatDate(p.lastEdited)}.</p>}
    </>
  );
}

function SectionDetails({ section: s }: { section: RoutesSection }) {
  return (
    <>
      <p className="flex items-center gap-2 text-[17px] font-bold">
        <SectionGlyph />
        <span>{s.value ? `Speed limit as mapped: ${s.value.amount} mph. This is the road's mapped limit, not a lorry limit.` : "Speed limit: not mapped in mph."}</span>
      </p>
      <p>{`Checks traffic heading ${compassName(s.travelBearing)}, over about ${formatLength(s.lengthMetres)} between the mapped start and end points.`}</p>
      {s.recorded.length > 0 && (
        <p className="font-mono text-[14px]">
          {s.recorded.map((r) => `${r.key} = ${r.value}`).join("; ")}
        </p>
      )}
      <p>
        <span className="font-bold">Where: </span>
        {routesLocationText(s)}
      </p>
      {s.lastEdited && <p className="text-[14px] text-muted">Last edited in OpenStreetMap {formatDate(s.lastEdited)}.</p>}
    </>
  );
}

function Elements({ refs }: { refs: RoutesPoint["osm"] }) {
  const shown = refs.slice(0, 6);
  return (
    <div>
      <p className="font-bold">On OpenStreetMap</p>
      <ul>
        {shown.map((r) => {
          const href = allowedLink(osmLink(r));
          return href ? (
            <li key={`${r.type}/${r.id}`}>
              <a href={href} target="_blank" rel="noopener noreferrer" className={link}>
                {`${r.type} ${r.id}`}
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </li>
          ) : null;
        })}
      </ul>
      {refs.length > shown.length && <p className="text-[14px]">{`And ${refs.length - shown.length} more.`}</p>}
    </div>
  );
}

const formatLength = (metres: number) => (metres >= 1000 ? `${(metres / 1000).toFixed(1)} km` : `${Math.round(metres)} m`);
