# Traffic Advanced brand masters

The SVGs here are the source of truth for every logo and icon in the app. Every published raster is rendered from them by
`render-icons.mjs` (run `node web/brand/render-icons.mjs` from the repository root after changing a master; it uses the Sharp
that Wrangler already installs). `web/src/brand.test.ts` checks that the outputs, the header logo and the masters agree.

The badge follows the approved concept from the owner's draft brand kit (navy shield with a gold rim, gold arc, white road with
navy centre-line dashes, a diversion loop and slip roads). The kit's own PNGs are not used: they did not match its SVGs.

## Colours

| Name | Hex |
|---|---|
| Deep navy | `#061426` |
| Secondary navy | `#102844` |
| Road gold | `#F7B928` |
| Off-white | `#F7F9FC` |

Gold text fails contrast on white (1.9:1), so on light backgrounds the wordmark is navy throughout; gold stays in the badge.

## Files

| Master | Used for |
|---|---|
| `traffic-advanced-favicon.svg` | Simplified badge for 16 and 32px (no dashes, diversion lines or text), transparent outside the shield: `web/public/favicon.svg` (a copy), `favicon-16x16.png`, `favicon-32x32.png` |
| `traffic-advanced-icon.svg` | Full badge on the rounded navy square, for 48px and larger: header logo, `pwa/icon-192.png`, `pwa/icon-512.png` |
| `traffic-advanced-icon-square.svg` | The same, full bleed: `web/public/apple-touch-icon.png` (180px; iOS rounds the corners) |
| `traffic-advanced-icon-maskable.svg` | Full bleed, badge at 82% so it stays inside the 40% safe-zone circle: `pwa/icon-maskable-512.png` |
| `traffic-advanced-banner.svg` | Splash banner: `web/public/banner.svg` (a copy) |
| `traffic-advanced-header-dark.svg`, `-light.svg` | One-line header wordmark; drawn inline by `web/src/components/BrandLogo.tsx` |

`pwa/` holds icons prepared for a web app manifest. There is no manifest yet, so they are not published.

## Wordmark lettering

"TRAFFIC ADVANCED" is set in Atkinson Hyperlegible Bold (the app's own typeface, from `@fontsource/atkinson-hyperlegible`) and
converted to paths, so it renders identically everywhere and needs no font. Atkinson Hyperlegible is licensed under the SIL Open
Font License 1.1, which allows its use in logos and artwork; no font file is redistributed here.
