# Traffic Advanced — development rules

Traffic Advanced is a map-based web app giving HGV drivers road-closure, traffic and diversion information.
This file says **how** to work on it. **What** to build: `docs/SPECIFICATION.md`. **What the data can prove**:
`docs/DATA-SOURCES.md`. Read the relevant sections of both before changing data, matching, diversion or safety code.

## Accuracy

- **Never guess a closure → diversion relationship.** If the data does not prove it, the code must not imply it.
- Every diversion carries exactly one classification: **A** official closure-specific · **B** official NH route matched
  on documented evidence · **C** calculated HGV route · **D** no reliable diversion. Definitions, required evidence
  and UI wording are in `docs/SPECIFICATION.md` §5. Use that wording exactly.
- **A false-positive match is more serious than a missed match.** When evidence is insufficient or ambiguous, the result is D.
- Matching and classification are deterministic, live in one place in `shared/`, and are covered by tests on real
  data, including tests proving that near-misses do **not** match.
- Never present a calculated route as official, and never present a car route as an HGV route.
- Show official text verbatim. Don't paraphrase, summarise or "clean up" National Highways wording.
- Matching thresholds, evidence rules, classification logic and safety wording **must not be changed silently**.
  Propose the change, show the fixture evidence, and get approval.

## HGV safety

- Always evaluate routes against the vehicle profile (height, width, weight, length).
- A known restriction that conflicts with the profile **blocks** the route with a prominent warning. It's never a subtle badge.
- Routes NH classifies **Class 2a/2b** ("not to be used by HGVs") are never presented as suitable for HGVs.
- Absence of restriction data is not proof of clearance. Say so.
- The app is for planning and information, not for interaction while driving. Safety copy (follow physical signs,
  police and National Highways instructions; signs take priority over the app) must stay visible where the spec requires it.

## Data

- **National Highways is the primary authority for V1 (England).** Other UK authorities are added later as new adapters.
- Every external source has its own adapter (`fetch → validate → normalise`) tagged with authority and source. No
  source-specific logic outside its adapter.
- Validate every upstream payload with a schema (Zod) at the boundary. Quarantine and log invalid records. Never pass them through.
- Preserve the **last known good** dataset. A failed or suspicious refresh never replaces good data.
- Never present stale or cached data as live. Every dataset and record carries its fetch time and source timestamps,
  and the UI shows "Last updated" plus delayed/stale states.
- Record every verified fact about a source (fields, limits, licence, behaviour) in `docs/DATA-SOURCES.md` with the date checked.
- Don't invent API fields, behaviours or capabilities. Verify against real responses or official documentation.
  Mark anything unverified as unverified.
- Test against **real captured data** in `fixtures/` (trimmed, keys stripped). Invented data only for edge cases real
  data lacks, and labelled as synthetic.

## Architecture

```
web/       React PWA (UI only)
worker/    Cloudflare Worker: scheduled ingest, storage, read-only /api/*
shared/    types, schemas and pure domain logic used by web and worker
fixtures/  captured real upstream data for tests
scripts/   data capture, preprocessing and analysis scripts
docs/      specification, data-source evidence, reports
```

- Pure, framework-free TypeScript in `shared/` for: closure/diversion matching, classification, HGV restriction
  checks, stale-data rules, unit conversion (m ↔ ft-in, t), and source confidence. No DOM, React or Worker APIs there.
- The frontend calls only our own `/api/*`. It never calls private or keyed upstream APIs directly.
- Keep modules small and single-purpose. Prefer clear code over clever abstractions.

## Security

- No secrets in the repository or the frontend bundle. API keys live server-side only: Wrangler secrets in production,
  git-ignored `.dev.vars` locally, GitHub Actions secrets in CI. Commit example files with placeholders only.
- Restrictive CORS (our origin only) and security headers (CSP, `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy`, HSTS) on every response.
- Validate and bound all request input. Rate-limit the public API.
- Build outbound links and deep links only from an allow-list of schemes/hosts with encoded parameters. Never from raw upstream text.
  Render upstream text as text, never as HTML.
- Location is optional. The app asks for it once on launch to set the initial map view (never when the browser already blocks it),
  and otherwise only when the user presses the location button; the browser's permission prompt decides. It stays on the device:
  never store, log or send it server-side.
- No tracking, analytics or cookies unless explicitly approved.
- Dependency auditing (`npm audit`, Dependabot) and GitHub secret scanning with push protection stay enabled.

## UI

- Mobile-first and focused on HGV drivers: clear information, minimal steps, strong contrast, large touch targets (≥ 48 px).
- Themes: dark, light and system, with no flash of the wrong theme.
- Works on phone, tablet, desktop, large touchscreen and TV. Fully keyboard and D-pad operable, with a visible focus ring
  and nothing that depends on hover alone.
- Accessibility: semantic HTML, labelled controls, WCAG 2.2 AA contrast, reduced-motion support, and never colour alone.
- Always make the following visually distinct: **traffic vs closures**; **official vs matched vs calculated** diversions;
  **fresh vs delayed vs stale/offline** data.
- Every async view has loading, empty, error, offline and stale states.
- UK conventions: en-GB dates, 24-hour times, heights in metres and feet-inches, weights in tonnes.

## Development workflow

1. Inspect the existing code and relevant docs before changing anything.
2. Use **Context7** for current library/framework/API documentation (React, Vite, TypeScript, Tailwind, MapLibre,
   TanStack Query, PWA tooling, Cloudflare Workers/Wrangler/R2, Zod, Vitest, Playwright, routing/traffic APIs).
3. Use the **frontend-design** skill for significant UI work (new screens, layout or design-system changes).
4. Test with real data. Add tests for all new logic. Data/matching changes need false-match tests too.
5. Run typecheck, lint, tests and build (`npm run check` once scaffolded) before calling work done. Report failures honestly.
6. Fix straightforward problems (type/lint errors, tests broken by your change, imports, formatting) without asking.
   Ask before changing safety or data-matching behaviour, the API contract, or adding a dependency.
7. Use **/code-review** for substantial changes. Simplify anything over-engineered.
8. Don't introduce unnecessary dependencies. Justify each one (need, size, maintenance, licence).
9. Don't remove working functionality or rewrite working code without a stated reason.
10. Check UI changes at phone, tablet and desktop sizes, in both themes, using keyboard only.

## Git and GitHub

- `main` is always deployable. Work on feature branches (`feat/`, `fix/`, `data/`, `docs/`, `chore/`) and merge via PR.
- Meaningful Conventional Commits. Never commit secrets, `.dev.vars`, build output, `node_modules` or raw data dumps.
- CI (typecheck, lint, tests, build, audit) must pass before merging or pushing to `main`.
- Use GitHub issues/PRs where they help (phase tracking, data-quality findings). No process for its own sake.
- Commit or push only when requested or as part of an explicitly approved phase.

## External references

- `HGV-Destinations-Pro` (github.com/twmiddleton21-lgtm/HGV-Destinations-Pro) may be inspected when HGV routing, UK
  address search, low-bridge data or height parsing is relevant. Reuse ideas only after review. Don't import its architecture.
- Project notes and decisions are also kept in the Obsidian vault at `D:\VAULT ONE\01 Projects\Traffic Advanced\`
  (follow the vault's CLAUDE.md). Link to the spec rather than duplicating it.
