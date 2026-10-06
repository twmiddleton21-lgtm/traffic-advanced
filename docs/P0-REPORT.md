# P0 report: data verification (working draft)

Status: **in progress**. Started 2026-10-05. This draft records findings as they're made. Final results, the
validation metrics and decisions for sign-off are added at the end of P0 (SPECIFICATION §13.1).

## Tooling (criterion 19)

| Dependency | Type | Why |
|---|---|---|
| `zod` 4.6.5 | runtime | Schema validation at every upstream boundary (spec requirement) |
| `typescript` 6.0.3 | dev | Typecheck; pinned below 6.1 because typescript-eslint 8.71 supports `<6.1` |
| `vitest` 5.0.3 | dev | Unit tests |
| `eslint` 10.12.0, `@eslint/js` 10.0.1, `typescript-eslint` 8.71.0 | dev | Lint (type-aware) |
| `@types/node` 24.19.1 | dev | Node 24 types |

No script runner: Node 24 runs the `.ts` capture scripts directly (type stripping) and loads `.dev.vars` with
`process.loadEnvFile`. No geometry library yet. Distances use a local equirectangular approximation, which is adequate
at the ≤ 1 km scales involved. Revisit if accuracy tests show otherwise. `npm audit`: 0 vulnerabilities.

## Captures (criterion 1)

| Capture | When (UTC) | Contents | Result |
|---|---|---|---|
| `2026-10-05T1140Z-open` | Mon 2026-10-05 11:40 | S2 (2,784), S3 xlsx, S4 stretches (2,862) / routes (2,326) / points (176), S5 nodes (37,918) / links (43,025) / junctions (762) / junction refs (6,948) / vehicle restrictions (18 + 18 refs) | All counts equal server `returnCountOnly` |
| `2026-10-05T1208Z-nh-api` | Mon 2026-10-05 12:08 | S1 planned: 16 pages, 59.3 MB, **1,136 situations / 7,625 records** (window 2026-10-04T12:08 → 2026-10-19T12:08). S1 unplanned: 1 page, 0.76 MB, 230 / 230 (window 10-03T12:08 → 10-05T13:08). S6 planned: 1 page, 1.5 MB, 43 / 227. S6 unplanned: 1 page, 1.2 MB, 484 / 484 | No errors, no 429s. Post-capture key scan: key not present in any saved file |

Still required: S1 + S6 on **2 more separate days (one at a weekend)**, each with same-day key-free snapshots. Captured so far: 1 of 3 days.

## Authenticated capture behaviour (S1/S6)

- Authentication with `Ocp-Apim-Subscription-Key` works for both APIs. Responses are DATEX II v3.4 JSON
  (`X-Response-MediaType: application/json`). No rate-limit headers were returned. Requests were spaced 6.5 s apart (documented limit 10/min); no 429 encountered.
- **Pagination:** the `x-next` header carries the next URL (`…&PageCursor=<n>`). 110–212 situations per page.
  **Large situations are split across pages:** 577 situations appear on 2–16 pages, each page holding a **disjoint**
  subset of the situation's records, with no record ever differing between pages. Correct handling is to union records by
  record id per situation (`shared/sources/nh-closures/merge.ts`, tested on real fixture `fixtures/s1/split-situation-pages.json`).
  Naive de-duplication by situation id would have kept 2,111 of 7,625 records.
- `situationVersionTime` can differ between page fragments of the same situation (179 cases). The merge keeps the latest.
- Publication times are UTC (`Z`). Whether the `startDateTime`/`endDateTime` *inputs* are read as UTC is still unverified.

## S1 fields (verified on the 2026-10-05 capture)

- Record type: `sitRoadOrCarriagewayOrLaneManagement` only. `roadOrCarriagewayOrLaneManagementType` (planned): `carriagewayClosures` 3,748,
  `other` 3,877. No `laneClosures` value in planned data; lane-level detail is in `lane[].lanesStatus` (`closed` 27,500, `opened` 274, `narrow` 98, …).
- `validityStatus` (planned records): `planned` 6,995 · `suspended` 508 · `active` 122. Time: `overallStartTime` / `overallEndTime` only.
- `source.sourceIdentification`: `roadworks` (all planned). `cause.causeType`: roadMaintenance 6,079 · constructionWork 1,308 · authorityOperation 238.
- NH extension flags are rare: width-restriction 23, contraflow 5, weight-restriction 2.
- **`linearElementReferenceModel` = "The Network Model"** for all 10,753 linear elements. **`linearElementIdentifier` = S5 `Link.linkid`**
  (braced, upper-case GUID): **10,639 / 10,753 (98.9%) resolve to a current S5 link**; 114 don't. For every resolved element,
  `supplementaryPositionalDescription.locationDescription` equals S5 `linkdesc` exactly, and `directionOnLinearSection` agrees with S5 `direction`.
- `linearElementType`: aCarriageway 4,788 · bCarriageway 3,765 · other 675 · a/b entry slips 822 · a/b exit slips 703. `fromPoint`/`toPoint` give `distanceAlong` (m) within the link.
- Geometry `posList` is **"lat lon" order** (EPSG::4326), the reverse of GeoJSON. Adapters must swap it.
- `generalPublicComment` is a short location line (e.g. "M53 Southbound Jct 4 to 5 Carriageway Closure"). **No S1 comment mentions a diversion (0 / 7,625).**

## Finding 2: S1 ↔ S2 share an explicit identifier

S1 situation `idG` equals the S2 `formattedeventnumber` base (`00435300-001` → `435300`): **478 of 626** distinct S2 event bases
match an S1 situation. Of S2 occurrence rows with a match, **2,132 agree on road and time**, 120 differ in road (cross-road events,
e.g. an A21 closure under an M25 situation) and 33 have no time overlap. 499 S2 rows have no S1 situation in this capture (reason to be investigated).

**Implication for Class A:** S1 carries no diversion text, but S2's description does (e.g. "Diversion via A4174, A38 and B4469 Muller Road"),
and the two are joined by NH's own identifier, not inference. However, the S2 text describes a **works event**, which can
contain several closures (records), so it is event-level rather than closure-level. See decision D1.

## Finding 3: strict B evaluation, first pass (development data only)

Prototype: S1 planned records against S4 stretches whose routes trace cleanly in S5 (Finding 1: 819 of 2,433 stretches have a clean link set).

| Step | Records |
|---|---|
| Not `carriagewayClosures` (E1) | 3,877 |
| No main-carriageway (a/b) link (E1) | 2,290 |
| `suspended` (E2) | 268 |
| Closure link not in S5 (E5) | 23 |
| No single stretch contains all the record's links (E5) | 876 |
| Several stretches (E8) | 4 |
| **Pass E1, E2, E5, E8 (per record)** | 287 records = **30 distinct closures** (29 situations) |

E7 (closure points within 30 m of the stretch): 28 of 30 ≥ 0.9; one candidate scored **0.0** despite the network match.

**Manual review of the 30** (`fixtures/p0/dev-set-2026-10-05-candidates.json`): **11 are wrong** and would have been false positives:
- 6 slip-road, layby or access-road closures typed `carriagewayClosures` with a closed main-carriageway link at the merge:
  M53 J9 entry slip, M53 J8 entry slip, M1 J12 entry slip, A2 Singlewell exit slip, A1 Colsterworth layby, A1(M) Sprotbrough depot access;
- 1 temporary traffic lights typed `carriagewayClosures` (A35 Miles Cross);
- 2 closures extending beyond the stretch ("M1 J11A to J13" vs J11–J12; "M5 J3 to J4a" vs J3–J4), because NH splits one closure across records;
- 1 closure inside a junction ("M60 J21 between exit and entry slip roads" vs the J20–J21 route);
- 1 rejected by E7 (A64 Towthorpe–Hopgrove, 0% spatial agreement).

17 need review (mostly "both directions" closures and closures shorter than the stretch), and 2 look likely correct but need
confirmation (M53 J4–J5 southbound; A34 Milton–Chilton southbound). The labels were drafted with keyword rules and then corrected
by hand: two drafts were wrong (A27 Coldean–Falmer, M60 J21). **Keyword labelling isn't review.** The held-out set will be reviewed record by record.

**Conclusions**
- Network position (E5) alone produces dangerous false positives. **E6 must be evaluated over the whole closure** (all records of the
  situation for the same direction and occurrence window), **E1 cannot rely on the record type** (it must use main-carriageway
  links with all lanes closed across the full junction-to-junction extent), and E7 catches errors E5 misses.
- **This confirms the §5.2 evidence rules rather than changing them.** No rule or threshold has been changed. The prototype was
  incomplete, not the rules.
- Under a strict reading of E6 (bounding junctions of the closure = stretch start/end nodes), closures *shorter* than the stretch
  fail, because the official route covers the whole stretch and the signed diversion for a shorter closure may differ. See decision D2.

## S6 Speed Managed Areas (verified on the 2026-10-05 capture)

- Record type `sitSpeedManagement`. Key fields: `temporarySpeedLimit` (**km/h**: 64.3736 = 40 mph, so convert and round for display),
  `complianceOption` (mandatory | advisory), validity status/time, cause, `generalPublicComment` (planned only), location as in S1.
- **Planned** (43 situations / 227 records, source `roadworks`): 40 mph 77 · 50 mph 147 · 60 mph 3. Validity planned 178 · active 46 · suspended 3.
- **Unplanned** (484 records, source "Signs and Signals"): one record per roadside signal (`speedManagementExtensionG.signalIdentifier`,
  e.g. `M6-S5925A`, `isSignalWorking`), 15-minute validity windows, mandatory 303 / advisory 181. Values: 0 mph 335 · 40 · 50 · 60.
  The 335 zero values coincide with 335 `suspended` records. **Likely meaning "signal cleared": unverified.**
- Refresh: unplanned `situationVersionTime` up to ~20 min before capture; validity windows of 15 min suggest a short refresh cycle (to measure across captures).
- Usefulness for the Traffic state: active official variable speed limits (mandatory/advisory) are an official indicator of congestion
  or incidents on managed motorways. They're not a congestion *measurement* and must be labelled as speed limits, not "traffic".

## S1 unplanned closures (verified on the 2026-10-05 capture)

All 230 records are `laneClosures` derived from signals (comment "laneClosures", 15-min windows), with lanes marked `Open`
(meaning unclear). 223 `suspended`, 7 `active`, and one `active` record's window had already ended at capture time.
**No unplanned full closures in this capture.** The semantics are unverified, so they're not usable as "incidents" until clarified across more captures.

## Endpoint verification

- S1: `GET https://api.data.nationalhighways.co.uk/roads/v2.0/closures`: 401 without key (route exists). Pagination via `x-next` response header.
- S6: `GET https://api.data.nationalhighways.co.uk/sma/v1.0/speedManagedAreas`: 401 without key (route exists).
  Params `speedRestrictionType` (planned|unplanned), `startDateTime`, `endDateTime`, `modifiedSinceDateTime`, `pageCursor`.
- Date-time params are documented as `YYYY-MM-DDThh:mm:ss` with no zone. **Whether the API reads them as UTC or UK local time is unverified.** The capture uses UTC and records that assumption.

## S5 Network Model structure (key-free)

- Link `linkform`: DC dual carriageway 23,318 · SL slip 7,396 · SC single carriageway 6,809 · R roundabout 4,907 · L 507 · SR 56 · DL 30 · EA 2.
- `carriageway`: A 16,755 · B 11,579 · X 6,801 (single carriageway) · J/K/L/M slips. `directionality` 1 (one-way) 37,305 · 0 (two-way) 5,720.
- `direction` is a **per-link compass/ring label** (N, S, E, W, CW, ACW). It can differ from the overall signed direction of a road.
- Junction table: `junctionname` (e.g. "M6 J41"), `roadnumber`, `junctionnumber`; Junction_Reference maps junctions to node IDs.

## Finding 1: S4 node IDs vs current S5 (affects E5/E6)

Test: for each complete diversion route, look up `SRNStartNode` / `SRNEndNode` in the current S5 node table and trace the network path.

| Result (2,325 complete routes) | Count |
|---|---|
| Route has a start or end node **missing from current S5** | 298 routes (124 start + 223 end node references) |
| Path found on the same road whose length is within 0.8–1.25× the stretch length | 832 (≈36%) |
| Path found but the length disagrees with the stretch | 604 |
| No path on the same road between the nodes | 591 |

Observations:
- Missing nodes are consistent with S4 routes being authored against an older Network Model version (many `LastmodifiedDatetime` values are in 2024).
- Many stretches end on a node belonging to a *connecting* road at an interchange (e.g. an M62 stretch ending on M60 links).
- Matching on S5 compass `direction` is brittle. Main-carriageway code (A/B/X) is the more stable key, but 467 traced paths change carriageway (roundabouts, dual/single transitions).

**Implication (provisional):** E5/E6 as currently written ("closure links lie on the path between the route's start and end
nodes") can only be evaluated for part of S4. Routes whose nodes are missing, or whose path can't be traced, can't reach B
under E5 and fall to D, unless a different, equally strong, documented network relationship is established. Next steps:
1. Derive each stretch's S5 link set from its geometry (S4 says the stretches are "connected to the Network Model") and measure how cleanly that works.
2. ~~Inspect S1 link identifiers~~ Done: see S1 fields and Finding 3.
3. Only then propose any amendment to E5/E6, with fixtures, for your sign-off. **No evidence rule has been changed.**

## Round 2 (2026-10-05, after decisions D1 and D2 were approved)

### Strict matcher (shared/, pure TypeScript)

| Module | Role |
|---|---|
| `shared/sources/nh-closures/normalise.ts` | S1 records → typed closures (lat/lon swap, per-element lanes-open by carriageway kind) |
| `shared/sources/nh-arcgis/normalise.ts` | S2/S4/S5 adapters (Zod), GUID/road normalisation, route limits, restriction points |
| `shared/network/graph.ts` | S5 through-link graph per road, junction-node membership, directed shortest path |
| `shared/diversion/stretch-index.ts` | Each stretch's ordered link path from its complete routes; unusable stretches recorded with a reason |
| `shared/diversion/closure-groups.ts` | **Whole closures**: records of a situation with overlapping windows, split by direction, **not** by road |
| `shared/diversion/evaluate-b.ts` | E1–E8 in order. The first failure gives D with its reason. Route HGV status |
| `shared/diversion/evaluate-a.ts` | A via NH's shared event id + specific diversion text (decision D1) |
| `shared/diversion/classify.ts` | A and B as separate claims, D fallback. **C is never produced** |
| `shared/diversion/rules.ts` | Every threshold and text rule in one file; P0-provisional values marked |

Day-1 result under strict rules (`npm run matcher:run`): 724 closure-directions (corrected from 757, which was the count before cross-road grouping), **D 593 · A 122 · B 9** (B = **3 distinct closures**:
M53 J4–J5 southbound, M65 J7–J8 eastbound, M54 J1 to M6 J10A eastbound). D causes: E5 324 · E1 223 · E3 137 · E6 31.
**This is development data only, not a success rate.** Usable stretch paths: 560 of 2,862 stretches.

### New false positives found and fixed during this round

1. **Cross-road closures (A42).** The first strict run gave B for "A42 northbound Jct 11 to Jct 13" (matched M42 J10–J11) and
   "A42 northbound Jct 13 to M1 Jct 23a" (matched M1 J23A–J24). NH closes the M42 → A42 continuation as one closure, and my grouping
   split by road, so an M42-only fragment fitted a stretch. **Fix:** closures are grouped by situation + overlapping window + direction
   across roads. A closure on more than one road is D (E6: not confined to one stretch). Both cases are now regression tests.
2. **HGV suitability from classification alone was unsafe.** In S4, **46 Class 1A/1B routes have a height limit under 4.95 m** (as low as 3.6 m),
   **74 have a weight limit under 44 t**, and **5 are described as "Non HGV" / "Cars only"** while classified Class 1A
   (e.g. `M6/J27/J26/1` "Route 1 - Non HGV Route", 3.6 m). **Fix:** routes now carry an HGV status that can never say "suitable":
   `not-suitable` (2a/2b, unknown class, or NH text says not for HGVs), `check-vehicle` (restrictions recorded: route limits and
   restriction points, all listed) or `no-restrictions-recorded` (with the "not a guarantee" caveat). See decision D5.

### Regression and test coverage

- **Real-data regression suite** (`fixtures/matcher/`, 15 cases, 6.7 MB): all **13 known false positives are D** (12 rejection cases: the
  M53 J8 and J9 slips share one situation and one case), with the evidence that rejects them recorded: E1 text disqualifier 7 cases ·
  E1 no closure statement 2 · E6 2 · E5 1. Plus 3 positive cases. Fixtures are trimmed real
  data, and each extraction is **parity-checked** against the full-data run (same groups, same outcome and evidence), so tests can't pass on a convenient subset.
- **Positive fixtures:** the 3 B closures are **reviewer-checked** (NH's own text names exactly the stretch's junctions, an independent check
  not used by the matcher) and **pending your confirmation**. No match is treated as confirmed until you do.
- **Synthetic unit tests** (labelled) for every rule branch, including ones the real data doesn't exercise: E8 competition, Class 2a, a missing
  network link, an unusable stretch, a closure shorter than its stretch at either end, and HGV status cases built from real NH descriptions.
- **Mutation check:** removing the E1 text disqualifiers fails 6 tests (5 synthetic plus the A1(M) Sprotbrough depot case). Among real cases,
  only that one depends solely on the text gate: the others are also rejected structurally.
- Totals: **7 test files, 71 tests, all passing.** Typecheck and lint clean.
- The earlier dev-set "review" candidates (17) and "likely" candidates (2) are all D under strict rules except M53 J4–J5. **A34 Milton–Chilton
  is now D (E5)** because its stretch's network path can't be established. That's a safe miss.

### Investigations

- **S4 licence: verified** from the item's own terms: Open Government Licence, with the attribution "Data derived from Ordnance Survey Highway
  Network, Subject to Crown copyright and database rights 2024. Ordnance Survey Licence: AC0000827444."
- **S4 route numbers:** numbers 1–6 are used (1: 2,016 · 2: 243 · 3: 37 · 4: 17 · 5: 7 · 6: 3). Within a stretch, routes differ in purpose:
  "Sub-Diversion", "Route 1 - Non HGV Route" vs "Route 2 - HGV route", or routes for traffic joining from a side road (A627(M) "A664-M62").
  **The number doesn't mean "primary" in any consistent way.** All routes of a matched stretch are shown with NH's description verbatim.
- **S1/S6 input times are UTC (verified).** A query for 19:30–19:35 on 6 Oct returned exactly the 577 records predicted by the UTC reading,
  against 179 predicted by the UK-time reading. All 113 differing ids are explained by the next finding.
- **S1 record ids are not stable between fetches.** Within ~40 minutes, 113 of 577 records were re-issued with new ids. All 113 had the same
  situation, window, location, version and creation time. The id's middle number is a timestamp. Production must key records by situation +
  window + location, not by record id. A page sequence fetched while ids change could carry one record twice under two ids. Merging remains
  correct for matching (duplicate links), but conflict detection can't see it.
- **499 S2 rows (148 events) without an S1 situation:** all overlap the S1 window, so timing isn't the cause. Some exist in S1 under a different
  situation id (S2 "Swakeleys" `443735` ↔ S1 `443983`). Others are absent from S1 entirely (S2 A30 Crooked Billet; A1(M) J42). **S1 is
  not a complete list of planned closures.** See decision D3.
- **Untraced S4 routes:** of 592 routes with no same-road path, allowing paths across roads and slips gives a length-agreeing path for only 149.
  129 have no path at all, and the rest disagree on length. Recovering cross-road stretches would need an E5/E6 extension (not made).
- **Still open (need later captures):** S6 zero-speed meaning and consistency, unplanned S1 semantics, whether S1 omissions persist.

### Capture days 2 and 3

These are future dates and can't be captured today. `npm run capture:day` now runs both captures in one go (key-free + keyed, same day,
same manifest timestamps). Planned: one weekday and **Saturday 10 October 2026**, then held-out evaluation with frozen rules.

### Decisions needed (round 2)

- **D3: S2-only closures.** S1 omits some closures that S2 lists. Recommendation: show S2-only closures on the map (official NH records)
  as D for B (no network IDs), and allow A when the S2 record's own text is specific, since that text is the closure's own official record.
  Needs your approval because §5.3 currently requires the S1 link.
- **D4: E1 text gate.** Approve the P0 tightening: NH's own text can disqualify (never qualify) a closure: slip, layby, access road, depot,
  services, traffic lights, lane-only, hard shoulder, link and narrow-lane wording, plus a required closure statement.
- **D5: HGV status.** Approve replacing any "suitable" label with the three cautious statuses above, and treating NH "Non HGV" / "Cars only"
  text as overriding a Class 1a/1b classification.
- **D6: fixture size.** The real-data regression fixtures total 6.7 MB. Options: commit as-is; compress (gzip, about 85% smaller); or Git LFS.
  Recommendation: commit gzipped fixtures.

## Round 3 (2026-10-05, after decisions D3–D6 were approved)

### Decisions implemented
- **D3** `shared/diversion/s2-only.ts`: S2-only events carry source `nh-s2`. They're A only from their own specific text (`basis:
  "own-s2-record"`), **never B** (`classify()` throws if an `nh-s2` closure is ever marked B), otherwise D, with `closureCount` so the UI can
  say an event covers several closures. Real data: **148 S2-only events → A 22, D 126**; 75 events cover more than one closure.
- **D4** text gate retained unchanged with its regression tests. **D5** HGV statuses unchanged (three values, no "suitable").
- **D6** regression fixtures gzip-compressed: **6.7 MB → 1.2 MB** (no Git LFS).
- Every B result now carries a `trace` (E1 statements, E5 path positions, E6 junctions, E8 candidate counts) so evidence is reviewable from the matcher's own output.

### The three B candidates (matcher accepts; NOT confirmed production matches)

Source: capture `2026-10-05T1208Z-nh-api` + `2026-10-05T1140Z-open`; identical result on the second capture (`T1300Z`/`T1259Z`).

| | M53 J4–J5 southbound | M65 J7–J8 eastbound | M54 J1 to M6 J10A eastbound |
|---|---|---|---|
| S1 situation | 491297 (5 nightly closures) | 520677 (1) | 515870 (3 nightly closures) |
| **E1** NH statement | "M53 Southbound Jct 4 to 5 Carriageway Closure" · main carriageway 0 lanes open · no disqualifying text | "M65 Eastbound Jct 7 to 8 Carriageway Closure" · same | "M54 eastbound Jct 1 to M6 Jct 10A carriageway closure" · same |
| **E5** network position | 11 closed links at path positions 0–10 of 12 | 7 closed links at positions 2–8 of 10 | 9 closed links at positions 6–14 of 15 |
| **E6** junction extent | stretch M53 J4 → M53 J5; closure bounded by M53 J4 → M53 J5 ✓ | stretch M65 J7 → M65 J8; closure bounded by M65 J7 → M65 J8 ✓ | path M54 **J2** → M6 J10A; closure bounded by M54 **J2** → M6 J10A (passes as coded) |
| **E7** spatial | 100% of closure points within 30 m | 100% | 100% |
| **E8** uniqueness | 4 stretches same road+direction → 1 contains all links → 1 passes | 7 → 1 → 1 | 4 → 1 → 1 |
| Matched stretch / route | S4 "M53 J4 → M53 J5" · `M53/J4/J5/1` Class 1A | "M65 J7 → M65 J8" · `M65/J7/J8/1` Class 1A | "M54 J1 → M6 J10A" · `M54/J1/M6/J10A/2` Class 1A |
| HGV status | **no-restrictions-recorded** ("does not guarantee there are none") | **no-restrictions-recorded** | **no-restrictions-recorded** |
| Stretch labels vs path-end junctions | agree | agree | **DISAGREE**: label J1, route path starts at J2 |
| Reviewer view | candidate, pending your review | candidate, pending your review | **evidence conflict: reviewer recommends D** (decision D7) |

**M54 conflict, in detail** (`node scripts/analysis/inspect-stretch-path.ts <open> M54/J1/M6/J10A/2`): the route path runs M54 J2 (nodes 0, 5)
→ J1 (nodes 7, 10) → M6 J10A (node 15). The closure's closed links start on link 6 ("between J2 and J1"), before the J1 exit, so
structurally the closure is bounded by J2, and route 2 also starts at J2. But NH's closure text and the S4 stretch label both say J1.
**Root cause:** `SRNStartNode`/`SRNEndNode` are where the *diversion route* leaves and rejoins the SRN, which is not always the closed
stretch's labelled junction. E6 compares the closure against the route path ends, so it can't see the label conflict.

**M54, further evidence (2026-10-05 13:10 UTC):** the only closed element on "M54 eastbound between J2 and J1" covers **1,315–1,370 m of a
1,368 m link**, i.e. the last ~55 m ending exactly at the J1 exit node, in all three nightly records. Measured precisely, the closure starts
**at J1**, consistent with NH's text. The matcher puts the boundary at J2 only because E6 currently treats a partly closed link as closed from its
start node. With position-precise extents the closure is J1 → M6 J10A against a route path J2 → M6 J10A, so E6 would fail and the result
would be D. **M54 passes for the wrong reason.** See decision D9.

Other NH evidence reviewed for the three candidates (S4 route records, `2026-10-05T1259Z-open`):

| Route | NH description (verbatim) | Signage | Length / est. time | Toll / CAZ | Limits / restriction points | Routes on stretch | Last modified |
|---|---|---|---|---|---|---|---|
| `M53/J4/J5/1` | "M53 Southbound Closure: Junction 4 to 5" | Diamond, hollow | 7.06 mi / 15 | none / none | none / none | 1 | 2024-11-21 (v17) |
| `M65/J7/J8/1` | "M65 eastbound between J6 and J7 - M65 eastbound within J8" | Triangle, solid | 5.1 mi / 11 | none / none | none / none | 1 | 2025-02-07 (v24) |
| `M54/J1/M6/J10A/2` | "M54 Junction 1 to M6 Junction 10A Closure - For M54 East Traffic" | Circle, hollow | 10.73 mi / 22 | none / none | none / none | 1 (route 2 only) | 2024-09-03 (v12) |

The M65 stretch description begins "between J6 and J7", which is where the J7 exit diverges. The closure's closed links run from within J7
to within J8, and the junction walk gives J7 → J8, so I see no conflict there, but it's flagged for your review.

### Proposed decision D9 (not implemented; needs your approval)
Make E6 position-precise: use S1 `fromPoint`/`toPoint` `distanceAlong` (against the link's true geometric length, not `SHAPE__Length`, which
is in Web Mercator units) so a partly closed link is bounded where the closure actually starts and ends. This implements the existing E6
wording more exactly rather than changing the rule, but it changes outcomes, so it needs your approval. Expected effect on day 1: M54 → D. The
other B candidates and the 13 known false positives need re-checking after the change.

### Proposed decision D7 (not implemented; needs your approval)
Add a stretch-index consistency check: a stretch is usable for B only if its own labels (`JunctionNumberFrom/To`) agree with the S5
junctions at its route path's ends. Measured over the 560 usable stretches: **256 agree · 46 disagree · 258 have labels that aren't a
road + junction number** (e.g. "A4130", "WEEFORD ISLAND").
- **Strict option** (recommended): usable only when labels are comparable *and* agree. Drops 304 stretches, mostly A-roads.
- **Lenient option:** drop only the 46 disagreeing stretches.
Either option makes M54 D, leaving 2 B candidates on day 1.

### Investigations completed this round

**S6 zero-speed semantics:** across two captures, **0 mph ↔ `suspended` exactly** (335/335, then 337/337), and `isSignalWorking` is true
for all 484 signals. Interpretation: 0 = no speed restriction currently set. That's consistent but not documented by NH, so the app should show
nothing for these rather than "0 mph". **Every `active` record's 15-minute window had already ended at capture time** (149/149 and
147/147), so for S6 the validity window can't be used to decide whether a limit is in force; status plus our own fetch time must be used.
The signal population is stable (~484, one record and one stable situation id per signal). In 52 minutes: 300 stayed cleared, 84 stayed set,
26 cleared, 19 newly set, 9 changed speed.

**Unplanned S1 semantics:** situation ids are roadside signal ids (`signs/M1-S3010A`, same scheme as S6), source "Signs and Signals",
15-minute windows. **Every record (230 and 231) reports 0 lanes restricted with all lanes "Open"**, including those `active`. These are
signal lane-status reports. **No unplanned closure appeared in either capture**, so what a real signal-set lane closure looks like is
still unobserved. Until then, unplanned S1 records must not be shown as closures or incidents.

**Record-id churn (larger than first measured):** between 12:08 and 13:00, **1,594 of 7,645 record ids (21%) changed** with identical
situation, window and location. Genuinely new content: 12 records; removed: 2. Production must key on content, not record ids.

**S1/S2/S3 completeness:**
- S2-only events: the same 148 in both captures (persistent, not a timing gap).
- S3 (closure report, no coordinates) vs S1, Tuesday 6 Oct: 281 S3 rows; 166 have identical location text in S1. Of the rest, some are
  S1/S2 wording differences, some are in S2 but not S1 (A1 Wansford–Wothorpe; A1(M) J56 Barton), and **some are in S3 only**
  (A1 Harlaxton; A1 Blagdon), which can't be mapped because S3 has no coordinates. See decision D8.

**S4 non-tracing routes (no rule changed):** of the 2,325 complete routes, 832 trace with agreeing length on their own road; 592 have no
same-road path (allowing other roads and slips recovers an agreeing-length path for only 149; 129 have no path at all); 604 trace but
disagree on length; 298 reference nodes missing from current S5. Root causes seen: route nodes from older Network Model versions;
diversion start/end on connecting roads at interchanges; route nodes outside the closed stretch (the M54 case). None of this justifies
weakening E5/E6. Recovering any of it would need new, explicit evidence rules.

**Threshold distributions (criterion 9):** for 1,436 traced routes, path ÷ stretch length has p25 1.004, p50 1.137, p75 2.45;
529 fall within 0.95–1.05. Geometry agreement within 30 m is bimodal (p25 0.38, p50 0.82, p75 0.997). 450 pass both provisional checks,
and 382 inside the length band fail the 0.95 agreement check, so agreement is the effective filter. The provisional values sit at the
edges of the natural clusters; they're **not changed**. The E7 threshold can't be calibrated until the held-out set exists (too few candidates reach E7 today).

**S1/S6 refresh:** S6 changes within minutes (above). S1: 12 new and 2 removed records in 52 minutes, alongside the id churn.

### Capture days 2 and 3 and the held-out evaluation: NOT YET DONE
Today is 2026-10-05. The two required extra days (one weekday, plus **Saturday 2026-10-10**) are in the future and haven't been captured.
The second capture today (`T1259Z`/`T1300Z`) is same-day refresh evidence only, **not** one of the three days. Steps on each day:
`npm run capture:day`. Then build the held-out set from day 3 with the rules frozen as they stand after D7 is decided.

### Decisions needed (round 3)
- **D7:** stretch label consistency check: strict (recommended), lenient, or none.
- **D8:** S3-only closures (no coordinates). Recommendation: don't put them on the map; list them under the road in text with "location
  not mapped" and their verbatim NH text, classified D (or A if the text is specific? recommendation: D only, because S3 has no IDs to tie the text to an event).

## Round 4 (2026-10-05, after decisions D7 and D9 were approved)

### Correction to round 3
Round 3 said "measured precisely, the closure starts at J1" and that D9 would make M54 D. **Both were wrong.** NH marks 1,315–1,370 m of
the 1,368 m "M54 eastbound between J2 and J1" link closed with 0 lanes open, so the closed section begins ~53 m *before* the J1 node.
Junction nodes sit only at link ends, so even position-precise the junction before the closure is J2. M54 becomes D because of **D7**.

### Implemented
- **D9 position-precise E6** (`evaluate-b.ts` `junctionExtent`): S1 `fromPoint`/`toPoint` `distanceAlong` per closed link (unioned per closure),
  converted to the path's direction of travel (two-way links traversed against digitisation are reversed), compared with the link's geometric
  length. A closed section within **10 m** of a link end counts as reaching that end's node. 10 m = p99 of the measured overshoot of NH
  end positions past our computed lengths (32,632 elements: p95 +5.2 m, p99 +9.0 m, max +21.8 m). Marked P0-PROVISIONAL in `rules.ts`.
  B results now record where the closure starts and ends within its first and last links.
- **D7 stretch-label consistency** (`stretch-labels.ts`, applied in `buildStretchIndex`): labels must reconcile with the S5 junctions at the
  route path's ends, or the stretch can't establish B (`labels-disagree-with-path` / `labels-not-reconcilable`). No inference or repair;
  S4 data untouched; Class A unaffected; no new way to qualify.
- **Data-handling fix found during this round:** S4 has 2,862 stretch rows but 2,433 GUIDs (319 split stretches with identical attributes,
  1 with conflicting labels). The index used to keep only the last row, so geometry was partial and a split stretch could appear twice as
  a candidate (a spurious E8). Rows are now merged by GUID, and conflicting rows make the stretch ineligible. Both effects of the old bug pushed
  toward D. The fix changed **no** day-1 closure outcome.

### Results
- All 13 known false positives: **still D**. Synthetic E6 tests: all pass, plus new D9 (endpoint snapping at either end, M54 pattern,
  reversed two-way link), D7 and multi-row cases. **9 test files, 99 tests.** Typecheck and lint clean. Fixtures re-extracted with parity
  re-verified (1.1 MB gzipped).

Day-1 (`2026-10-05T1208Z-nh-api`), 724 closure-directions (corrected from 757; see round 2):

| Run | A | B | D | D by first failing evidence | Stretches able to establish B |
|---|---|---|---|---|---|
| Before D7/D9 | 122 | 9 | 593 | E5 324 · E1 223 · E3 137 · E6 31 | 560 |
| D9 only (attribution run) | 122 | 9 | 593 | unchanged | 560 |
| D7 + D9 + row merge (final) | 122 | **6** | 596 | E3 316 · E1 223 · E5 160 · E6 19 | 242 |

- **D9 alone changed 0 outcomes on day 1.** No closure starts or ends within 10 m of a junction node.
- **D7 changed 184 closure-directions:** **3 B → D (M54, nights of 14, 15 and 16 Oct)**; 181 D → D with a different first failing item
  (169 E5→E3, 10 E6→E3, 2 E6→E5). **No D → B.** A outcomes and S2-only results unchanged.
- Stretch eligibility (final, 2,433 stretches): 242 usable for B · labels not reconcilable 253 · labels disagree 46 · row conflict 1 · plus
  the earlier causes (no same-road path 554, length 429, geometry 398, missing route node 275, no complete route 217, routes disagree 18).

### Remaining B candidates (2 closures; still candidates, not confirmed)
**M53 J4–J5 southbound** (`491297`, 5 nights): unchanged by D7/D9. Labels "M53 J4"/"M53 J5" reconcile with the path ends.

**M65 J7–J8 eastbound** (`520677`): the S4 description "M65 eastbound between J6 and J7 - M65 eastbound within J8" was checked against S5,
S4 geometry and the position-precise S1 extent:
- S5 path: J7 spans nodes 0–4 (node 0 = J7 exit diverge, node 4 = J7 entry merge); J8 spans nodes 7–10 (7 = exit, 10 = entry). The
  main-carriageway link that starts at the J7 exit diverge is named "M65 eastbound between J6 and J7" in S5.
- S4 geometry: 2 rows. The main row runs from **exactly** the J7 exit-diverge node to **exactly** the J8 entry-merge node (0.0 m at both ends)
  = the route's SRNStartNode/SRNEndNode. The second row (384 m) is the J8 exit slip. The description is the first and last link names of
  this geometry, so it is consistent, not a discrepancy.
- S1 closure (position-precise): starts 89 m into a "within J7" link (after the J7 exit, before the J7 entry) and ends 70 m into a "within
  J8" link (after the J8 exit, before the J8 entry). So traffic leaves at J7 and rejoins at J8. The J7 entry slip and J8 exit slip are closed the
  same night, as that extent requires.
- **Conclusion: consistent.** No conflict found. It remains a candidate for your review.

## Round 5 (2026-10-05): rules frozen; held-out tooling built

- **Freeze:** `fixtures/p0/rules-freeze.json` holds SHA-256 fingerprints of the 13 classification files. `rules-freeze.test.ts` fails on any
  change (verified with a one-line tamper). Re-freezing needs owner approval: `node scripts/p0/freeze-rules.ts "<reason>"`.
- **Shared pipeline:** `scripts/lib/matcher-pipeline.ts` is used by `run-matcher.ts` and both held-out tools. Day-1 totals are unchanged:
  724 closure-directions · A 122 · B 6 · D 596 · 242 B-eligible stretches.
- **`npm run heldout:build -- <open> <nh-api>`** checks the freeze, runs the frozen matcher, selects every B plus seeded, stratified D items
  (passed E1, not seen in the development captures) up to 100, and writes three files to `evaluation/heldout/<capture>/`:
  a **blind** `worksheet.json` (closure facts, closed links, linked S2 text, all candidate official stretches on that road and direction, no
  matcher output), `matcher-outcomes.json` (kept separate) and `selection.json` (provenance, freeze hash, seed, population, shortfall).
  It refuses development-day captures except with `--dry-run`, which writes only to the git-ignored capture folder, and it never overwrites a worksheet.
- **`npm run heldout:evaluate -- <dir>`** refuses unless the freeze hash matches the one recorded at build time, every item is reviewed, and every
  owner-sample, "unsure" or disputed item has the owner's review (the owner's answer wins). It scores TP/FP/FN/TN, gives exact one-sided 95%
  upper bounds, and writes `report.json` / `report.md`.
- **Dry runs on Day-1 (development data, not evidence):** population 501 eligible (6 B, 495 D), 100 selected, owner sample 26. Guards verified:
  real build on development data refused; dry-run evaluation without `--dry-run` refused; unreviewed and unresolved-"unsure" sets refused
  (exit 1); freeze-hash mismatch refused. A scratch copy with deliberately synthetic reviews exercised the scoring path (1 planted FP, 2 FN, 1 dispute: all reported correctly).
- **Divergence protection (added after review):** `summariseRun`, `describeBResults` and `describeDReasons` live in the shared pipeline, so
  analysis and held-out runs report from one implementation. `scripts/lib/pipeline-equivalence.test.ts` checks:
  (1) statically, that both scripts use only the shared pipeline, call no matcher internals, and that the evaluator never runs the matcher;
  (2) on `fixtures/p0/mini-capture` (real Day-1 data, 4 situations, 319 KB gzipped, parity with the full run verified at extraction), that the pipeline
  reproduces the verified outcomes; (3) end to end, that `run-matcher.ts` and `heldout-build.ts` executed on the same capture produce identical
  summaries, B evidence and D reasons; (4) that capture pinning detects a changed file. Mutation checks: diverging totals in the build script and a
  direct matcher call each fail a test. Held-out sets now record a SHA-256 of every capture file (the evaluator re-verifies them) and are labelled
  `held-out`. Dry runs are labelled `development-dry-run (NOT held-out evidence)`. Day-1 dry run: A 122 · B 6 · D 596 · 242 B-eligible stretches,
  identical to `run-matcher.ts`. **12 test files, 128 tests.**
- **Statistical limitation (to be stated in the final report):** the overall bound uses all reviewed items (0 FP in 100 gives ≤ 3.0%), but
  confidence about B results specifically depends on how many B predictions exist. 0 FP among 2 B gives ≤ 77.6%; 6 B ≤ 39.3%; 30 B ≤ 9.5%;
  100 B ≤ 3.0%. With the current conservative rules, the held-out set will contain only a few B, so "zero false positives" will be
  necessary but weak evidence about B specifically.

## Do the A/B/D evidence rules remain valid?

**Yes, unchanged.** The day-1 evidence supports every §5.2 item: E1 (record type alone is unsafe), E5 (98.9% of S1 links resolve,
so the network evidence exists), E6 (needed to stop partial and over-long matches), E7 (caught a network-only error) and E8. D stays
the default for everything that doesn't pass. Nothing was weakened. Two interpretation questions need your decision before rules are frozen:

- **D1: Class A source and scope.** S1 has no diversion text. The only closure-specific official text is in S2, joined to S1 by
  NH's shared event identifier. That text describes a works *event*, which may contain several closures. Options:
  (a) show it as A, labelled "Official diversion information for this roadworks event", on every closure of that event;
  (b) show it as A only when the event has a single closure, otherwise as a verbatim NH note with class D;
  (c) don't use it for A. *Recommendation: (a). It's NH's own statement, joined by NH's own ID, and the wording says exactly what it covers.*
- **D2: closures shorter than the official stretch.** Under strict E6, a closure between two intermediate junctions inside a longer
  stretch (e.g. Marcham–Abingdon inside A4130–A420) fails, because the official route serves the whole stretch and the signed diversion
  for the shorter closure may differ. *Recommendation: keep strict E6 (these closures are D).* A looser rule would need its own evidence and your sign-off.

## Next steps
1. Implement the matcher in `shared/` (TypeScript) with whole-closure E1/E6 (all records of a situation per direction and occurrence),
   per-direction splitting, E7 threshold measurement, and real-fixture false-match tests for every rejected case above.
2. Investigate the 1,513 S4 routes without a clean network path (missing nodes, cross-road end nodes, carriageway changes), so a stretch's link set can be established another way where NH data supports it.
3. Captures on 2 more days, including a weekend (earliest Sat 2026-10-10), to build the held-out set.
4. Verify: input time zone for S1/S6 parameters; meaning of S6 zero values; unplanned S1 semantics; S4 licence; route-number meaning; why 499 S2 rows lack an S1 situation.
