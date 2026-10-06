# Production log

Public URL: https://traffic-advanced.twmiddleton21.workers.dev (Cloudflare Workers, workers.dev). R2 bucket: `traffic-advanced-snapshots`
(location hint weur). Worker version `ec447b2d-6e50-413c-a652-aafbb1b67115`, deployed 2026-10-06 06:41 UTC.

## Current state (recorded 2026-10-06, post-live review)

| | Live | Rollback (previous known-good) |
|---|---|---|
| Version | `20261006T065331Z-0a7fda8a1d6c` | `20261005T120826Z-0852572cf098` |
| NH data captured | 2026-10-06 06:53:31 UTC (first real live capture) | 2026-10-05 12:08:26 UTC (Day-1) |
| `publishedAt` in pointer | 2026-10-06 06:52:36 UTC (run start: see "publishedAt" below) | 2026-10-06 06:45:04 UTC |
| Closures | 738 (A 141, B 6, D 591) | 723 (A 122, B 6, D 595) |
| Junctions | 596 | 596 |
| closures.json SHA-256 | `04e4e3bf45842299c352142673b646415c962a8cb7f59fffa58d8c31d6c331ec` | `09849f7c4c5b01a97c2e77fe00517e99eadb8caf5725609f2e385c584b5b5892` |
| junctions.json SHA-256 | `e06263a3f2a7de9a137f76f96aaa2eb8cfbb3e5ed7ee5f88ee590bdde9d18643` | `12656c556c61edc89716a4233165713b813947831acbc42895f8e1982d216356` |
| provenance.json SHA-256 | `b0969643d74100cc9a48a248291d7e1368190462f10606ecca0866f255dbccaf` | `918e3fdcdd7274ce5bf2ded8d011560aeb597aead54995d2b250aaba3b75d516` |
| Rules-freeze hash | `f42c7e22e47b5642…` (both) | |
| Captures | `2026-10-06T0652Z-open`, `2026-10-06T0653Z-nh-api` | `2026-10-05T1140Z-open`, `2026-10-05T1208Z-nh-api` |

Both versions' objects are in R2 under `snapshots/<version>/`. Local copies of both pointers: `.wrangler/rollback/current-live-20261006T065331Z.json`
and `.wrangler/rollback/current-before-first-live.json` (git-ignored). **Rollback** is a deliberate manual pointer swap (the upload tool
refuses older data by design): `npx wrangler r2 object put traffic-advanced-snapshots/current.json --file .wrangler/rollback/current-before-first-live.json --content-type application/json --remote`.
Only on the owner's instruction.

## Open review items

### M57 southbound, situation 521358: B candidate pending owner review

Status: **P0 candidate pending owner review. Not a confirmed production match.** Shown as B with that note. Not suppressed or changed.

- Closure: `521358|southBound|2026-10-06T20:00:00.00Z|2026-10-07T04:00:00.00Z` (Tue 6 Oct 21:00 to Wed 7 Oct 05:00 UK time).
- NH text (verbatim): "M57 southbound Jct 6 to 4 carriageway closure".
- Closed main-carriageway links NH references in that record (all `operationalLanes: 0`): 5 Network Model links, resolved as
  "M57 southbound between J5 and J4" (3) and "M57 southbound within J4" (2). **No link between J6 and J5.**
- Other records NH filed in the same situation: J6 **entry slip** closure; J4 **exit slip** closure; lanes 2 and 3 closed at
  MP 17/0 to 16/1 and lane 3 closed at MP 13/3 to 12/4 (lane closures, not full closures).
- Matched: stretch `M57 southBound M57 J5 to M57 J4` (`d25c4d21-b8af-41ad-b9d6-79b24f2cc2fd`), route `M57/J5/J4/1`, "M57 southbound
  closure: junction 5 to 4", Class 1A, hollow triangle, 2.79 miles, no restrictions recorded. E1 to E8 all pass.
- **Why unresolved:** NH's text says the carriageway is closed from J6, but NH's own network references close the main carriageway
  only from J5 (with the J6 entry slip closed and lane closures north of J5). If the main carriageway is in fact closed J6 to J5,
  traffic can't reach J5 and a J5 to J4 diversion would not be usable. The data can't prove which reading is right.
- The red line north of J5 on the map near M58 is a different closure (situation 523136, "Switch Island to Jct 6", from 9 Oct, D).

### publishedAt preceded capturedAt (fixed for future publications; live pointer unchanged)

Cause: `scripts/lib/ingest.ts` took one timestamp at the start of the run and passed it to `publishSnapshot` as the publication time.
Fix (2026-10-06): the publication time is taken immediately before publishing, and `publishSnapshot` refuses a publication time
earlier than the capture time. Snapshot contents, version, matcher, capture and safeguards are unchanged (tested). The live pointer
keeps its old value until the next publication.

Related, **not changed**: the snapshot files' own `generatedAt` is also the run start (it's inside the published files, so changing it
alters their bytes). Proposal pending approval.
