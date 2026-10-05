# Traffic Advanced — development rules

Map-based web app showing road closures, live traffic and HGV diversion information for professional
drivers. **What** we build is in `docs/SPECIFICATION.md`; **what the data can and cannot prove** is in
`docs/DATA-SOURCES.md`. Read both before changing data, matching or diversion code. This file is **how** we work.

## 1. Accuracy and HGV safety come first

Wrong diversion information can put an HGV under a low bridge. Feature count, polish and speed all rank below accuracy.

- **Never infer a relationship the data does not state.** If a source doesn't prove that a diversion
  belongs to a closure, the code must not present it as if it does.
- Every diversion shown must carry exactly one classification from `docs/SPECIFICATION.md` §5:
  **A** official closure-specific · **B** official NH route, matched on evidence · **C** calculated HGV
  route · **D** no reliable diversion. The classification is computed in one place (`shared/diversion/classify.ts`),
  is part of the API contract, and is rendered with the exact wording from the spec. Never restyle C to look like A/B.
- Matching rules are deterministic, documented and covered by tests, including **false-match tests**
  (cases that must *not* match). Changing a threshold needs a fixture showing why.
- Never route, or suggest a route, through a known restriction that conflicts with the user's vehicle
  profile. Conflicts are shown as a blocking, high-contrast warning, never a subtle badge.
- Never present a car route as an HGV route.
- Never present cached data as live. Every dataset carries `fetchedAt` / `sourceUpdatedAt`; the UI always
  shows "Last updated" and flags staleness using the thresholds in the spec.
- Show official text (e.g. National Highways diversion descriptions) **verbatim**. Don't paraphrase or summarise it.
- Keep data sources visually and semantically separate: NH closure/incident, planned roadworks, live
  traffic, official diversion, calculated route. Never merge them into one ambiguous "traffic" status.

## 2. Evidence-based development

- Don't assume an API field, behaviour, limit or licence term exists. Verify it against the real
  response, official docs or the licence text, then record it in `docs/DATA-SOURCES.md` with the date checked.
- When something can't be verified, say so in code comments/docs and design for the uncertainty. Don't paper over it.
- **Use Context7** (`resolve-library-id` → `query-docs`) before writing code against React, Vite, TypeScript,
  Tailwind, MapLibre, TanStack Query, vite-plugin-pwa/Workbox, Cloudflare Workers/Wrangler/KV/R2, Zod,
  Vitest, Playwright, or any routing/traffic API. Prefer current docs over memory, even for familiar APIs.
- Test data code against **real recorded responses** (fixtures in `fixtures/`, captured by a script and
  stripped of keys), not invented payloads. Invented data is only for edge cases real data doesn't cover, and is labelled as such.
- When upstream formats change, update fixtures and tests first, then the parser.

## 3. Architecture rules

- Layout: `web/` (React PWA), `worker/` (Cloudflare Worker: scheduled ingest + read API), `shared/`
  (types, Zod schemas, pure domain logic used by both), `fixtures/`, `scripts/`, `docs/`.
- Each upstream source is an **adapter** behind a common interface (`fetch → validate → normalise`),
  tagged with authority/region (`nh-england` today; Scotland/Wales/NI later). Don't special-case a
  source outside its adapter.
- Domain logic (matching, classification, restriction checks, time/stale rules, unit conversion) is pure
  TypeScript in `shared/`, with no DOM, React or Worker APIs, and is fully unit-tested.
- The frontend talks only to our own `/api/*`. It never calls keyed upstream APIs directly.
- Validate every upstream payload and every API response with Zod at the boundary. Reject or quarantine
  invalid records. Never let them silently through.
- Keep the last known good dataset. A failed or invalid refresh must never replace good data with nothing.

## 4. Security and privacy

- **No secrets in the repo or the frontend bundle.** Keys live in Wrangler secrets (`wrangler secret put`)
  and GitHub Actions secrets; local dev uses `.dev.vars` (git-ignored). Add an example file with placeholders only.
- The Worker exposes read-only endpoints. Validate and bound all query params; apply rate limiting; send
  restrictive CORS (our origin only) and security headers (CSP, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`).
- Render all upstream text as text. No `dangerouslySetInnerHTML`, no HTML from feeds.
- Outbound links/deep links are built from an allow-list of schemes/hosts with encoded parameters. Never
  build URLs from raw upstream strings.
- Location is opt-in, one-shot (`getCurrentPosition`, never `watchPosition`), requested only from a user
  action with an explanation first, and never stored server-side or logged.
- No analytics/trackers without explicit approval. No cookies needed.
- Dependencies: justify each one (size, maintenance, licence), pin via the lockfile, run `npm audit` in CI,
  and keep Dependabot on. Prefer platform APIs and small libraries.
- Don't claim ISO certification. Follow the practices (least privilege, secret rotation, audit trail of data refreshes).

## 5. UI rules

- Mobile-first (design at 360–390 px, then tablet, desktop, large touchscreen, TV). No horizontal page scroll.
- Touch targets ≥ 48 px. Primary actions reachable one-handed. Large, high-contrast text; map labels readable in sunlight and at night.
- Themes: system / light / dark, with no flash of the wrong theme. Map style follows the theme.
- Fully keyboard and D-pad operable (TV remotes send arrow keys/Enter/Back): logical focus order, a visible
  focus ring, nothing that relies on hover only.
- Accessibility: semantic HTML, labelled controls, WCAG 2.2 AA contrast, `prefers-reduced-motion`
  respected. Information is never conveyed by colour alone (closures and classifications have icon + text).
- Every async view has designed loading, empty, error, offline and stale states.
- UK conventions: `en-GB` dates, 24-hour times, heights in metres **and** feet-inches, weights in tonnes.
- Use the **`frontend-design` skill** for significant UI work (new screens, layout/design-system changes). Small tweaks don't need it.
- Safety copy from the spec (don't use while driving; physical signs take priority) must not be removed or hidden.

## 6. Code conventions

- TypeScript strict; no `any` (use `unknown` + narrowing); no unexplained `!`.
- React function components + hooks; server state via TanStack Query; no global state library unless justified.
- Files: `PascalCase.tsx` components, `camelCase.ts` modules, tests co-located as `*.test.ts(x)`.
- Comments explain *why* (especially data quirks, with a link to the evidence). No commented-out code, no `console.log` in commits.
- Don't add a dependency, remove working functionality, or rewrite working code without a stated reason.
  Prefer small, reviewable changes.

## 7. Commands

Defined once the project is scaffolded (P1). Required scripts: `dev`, `build`, `preview`, `typecheck`,
`lint`, `format`, `test`, `test:e2e`, `fixtures:capture`, and **`check`** (typecheck + lint + test + build),
which must pass before any commit. Update this section when the scripts exist.

## 8. Working loop

1. Understand the goal and read the relevant spec section before coding.
2. After each change run the narrowest relevant tests, then `npm run check` before calling it done.
   Report failures with their output. Don't hide or skip them.
3. **Fix straightforward problems yourself** (type/lint errors, failing tests caused by your change,
   imports, formatting). **Ask first** before changing matching thresholds, diversion classification,
   safety wording, data-retention behaviour, the API contract, or adding a dependency.
4. New logic needs tests. Data/matching changes need real-fixture tests **and** false-match tests.
5. Check UI changes at phone, tablet and desktop widths, in both themes, with keyboard only.
6. **Review your own diff before committing** (`git diff --staged`): correctness, accuracy wording,
   secrets, leftover debugging, unrelated changes, missing tests. Use `/code-review` for substantial changes
   and simplify anything over-built.

## 9. Git and GitHub

- `main` is always deployable and protected. Work on short-lived branches (`feat/…`, `fix/…`, `data/…`,
  `docs/…`, `chore/…`) and merge by PR once CI passes.
- Conventional Commits, small and meaningful. Never commit secrets, `.dev.vars`, build output, `node_modules`
  or large raw datasets (fixtures are trimmed samples).
- Don't push failing code. CI (typecheck, lint, tests, build, `npm audit`) must be green.
- GitHub issues: one per phase/feature with acceptance criteria, plus issues for data-quality findings.
  Don't create process for its own sake.
- Commit or push only when asked or as part of an agreed phase.

## 10. Documentation

- Spec changes go in `docs/SPECIFICATION.md`; data findings (with date and evidence) in `docs/DATA-SOURCES.md`.
- Long-term notes and decisions also live in the Obsidian vault at `D:\VAULT ONE\01 Projects\Traffic Advanced\`
  (follow the vault's own CLAUDE.md). Don't duplicate the spec there. Link to it.
