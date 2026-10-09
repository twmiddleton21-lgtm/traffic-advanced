import type { RestrictionSource } from "../../../../shared/api/restrictions.ts";
import { dataOrigin, formatTime, freshnessLine, lastUpdatedLine, NOT_LIVE_TEXT, OFFICIAL_SOURCE_URL } from "../../domain/dataStatus.ts";
import { formatDateTime } from "../../domain/filters.ts";
import type { ClosuresState } from "../../hooks/useClosures.ts";
import { MAP_CREDITS } from "../../map/credits.ts";
import { allowedLink, formatDate, sourceLabel } from "../../restrictions/describe.ts";
import { SafetyNotice } from "../SafetyNotice.tsx";
import { Fact, SettingsSection } from "./SettingsSection.tsx";

const link = "inline-flex min-h-12 items-center font-bold text-motorway underline decoration-2 underline-offset-2 hover:no-underline dark:text-sign";

/** Opens in a new tab with no referrer; the URLs are fixed in the code or come from validated data files, never from upstream text. */
function External({ href, children }: { href: string; children: string }) {
  if (allowedLink(href) === null && href !== OFFICIAL_SOURCE_URL) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={link}>
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** The traffic data's own status (the same wording as the header), its sources and licences, limitations, privacy and safety. */
export function DataHelpSection({ data, now, restrictionSources }: { data: ClosuresState; now: Date; restrictionSources: RestrictionSource[] }) {
  const p = data.snapshot?.provenance;
  return (
    <>
      <SettingsSection title="Data status">
        {!p ? (
          <p className="text-[14px]">{data.loadError ? `No traffic data loaded: ${data.loadError.message}` : "Loading traffic data…"}</p>
        ) : (
          <>
            <p className="text-[14px] font-bold">{p.kind === "live" ? freshnessLine(p.capturedAt, now).text : `${NOT_LIVE_TEXT} ${lastUpdatedLine(p.capturedAt, now).warning ?? ""}`}</p>
            <dl className="mt-2">
              <Fact label="NH data from">{formatDateTime(p.capturedAt)}</Fact>
              <Fact label="Published">{data.publishedAt ? formatDateTime(data.publishedAt) : "Not confirmed this visit"}</Fact>
              <Fact label="Data version">{data.version ?? "None (development snapshot)"}</Fact>
              <Fact label="This copy">{dataOrigin(data.via)}</Fact>
              <Fact label="Last checked">{data.lastSuccessAt !== null ? formatTime(data.lastSuccessAt) : "Not this visit"}</Fact>
            </dl>
            {p.sources.length > 0 && (
              <>
                <h4 className="mt-3 font-bold">Traffic data sources</h4>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[14px]">
                  {p.sources.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </>
            )}
            {p.notes.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[13px] text-muted">
                {p.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
          </>
        )}
        <p className="text-[14px]">
          <External href={OFFICIAL_SOURCE_URL}>National Highways road closure report</External>
        </p>
      </SettingsSection>

      <SettingsSection title="Sources and licences">
        <ul className="space-y-3 text-[14px]">
          {MAP_CREDITS.map((c) => (
            <li key={c.name}>
              <p className="font-bold">{c.name}</p>
              <p>{c.text}</p>
              <External href={c.licenceUrl}>{c.licence}</External>
            </li>
          ))}
          {restrictionSources.map((s) => (
            <li key={s.id}>
              <p className="font-bold">
                Restrictions: {s.authority}, {s.name}
              </p>
              <p>{sourceLabel(s)}</p>
              <p>{s.attribution}</p>
              <p className="text-muted">
                {s.datasetDate ? `Source last updated ${formatDate(s.datasetDate)}. ` : "The source doesn't publish an update date. "}Downloaded {formatDate(s.fetchedAt)}.
              </p>
              {s.notes.length > 0 && (
                <ul className="list-disc pl-5 text-[13px]">
                  {s.notes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}
              <External href={s.licence.url}>{s.licence.name}</External>
              {s.kind === "community" && (
                <p className="text-[13px]">
                  The restriction file built from OpenStreetMap is itself available under the ODbL: it is the file the map downloads.
                </p>
              )}
            </li>
          ))}
        </ul>
      </SettingsSection>

      <SettingsSection title="Known limitations">
        <ul className="list-disc space-y-1 pl-5 text-[14px]">
          <li>{NOT_LIVE_TEXT} It covers National Highways' motorways and major A roads in England.</li>
          <li>Official diversions are shown only where National Highways data proves the link; otherwise the closure says there is no reliable diversion.</li>
          <li>The app doesn't check whether a vehicle can use a road or route. It is not a route check or satnav.</li>
          <li>Restriction data is incomplete. Community-sourced records are unverified.</li>
        </ul>
      </SettingsSection>

      <SettingsSection title="Privacy">
        <ul className="list-disc space-y-1 pl-5 text-[14px]">
          <li>No accounts, cookies, analytics or tracking.</li>
          <li>Your location stays on this device. It is used only on the map, to centre it and show where you are, and is never stored or sent to us.</li>
          <li>Your settings are saved on this device only and are never sent anywhere.</li>
          <li>Restriction data is downloaded as whole files, so no request reveals where you are looking.</li>
          <li>Map tiles come from OpenFreeMap, which sees the requests for the map areas you view, as any online map does.</li>
        </ul>
      </SettingsSection>

      <SettingsSection title="Safety">
        <SafetyNotice />
      </SettingsSection>

      <SettingsSection title="Contact">
        <p className="text-[14px]">A way to contact us will be added here.</p>
      </SettingsSection>
    </>
  );
}
