# Liquid Glass: Usage and Placement Guide

## Install and use

```tsx
// Lean entry (recommended): frost-only pages never download the refraction engine.
import { PremiumGlass } from "liquid-glass-react/premium"

<PremiumGlass preset="qst" width={420} height={96} scrim={0.35}>
  <button type="button">Request access</button>
</PremiumGlass>
```

The root import (`import LiquidGlass from "liquid-glass-react"`) is unchanged from upstream and also exports `PremiumGlass`. Both entries lazy-load the engine; `/premium` simply never references the raw component.

## Defaults and opt-in

| Mode | When | Result |
|---|---|---|
| Frost (default) | Always, including server render and first paint | CSS `backdrop-filter` blur + tint |
| `refraction` (opt-in) | Chromium + fine pointer, no reduced motion/transparency/contrast | Real SVG refraction, engine fetched on demand |
| Solid | `prefers-reduced-transparency`, `prefers-contrast: more`, `forced-colors`, or no `backdrop-filter` | Opaque surface (`Canvas`/`CanvasText` in forced colours) |

`refraction` never activates on touch devices, Safari or Firefox: they stay on frost by design. The gate is two checks, a Chromium user agent and `(hover: hover) and (pointer: fine)`; a Chrome-on-Android profile is held back by the pointer check, an iPhone profile by the user-agent check. `forceRefraction` skips the capability check and exists for demos and tests only.

Firefox and WebKit have no real refraction (it relies on an SVG `feDisplacementMap` inside `backdrop-filter`, which only Chromium supports). They get CSS frost, set through both `backdrop-filter` and `-webkit-backdrop-filter`. Whether that frost actually blurs depends on the engine build and GPU; the test suite proves the declarations are present and applied, and proves the pixels only in Chromium.

## Props that matter

- `preset`: `qst` (Titanium edge, Signal-blue whisper), `manny` (clipper blue, faint comb red), `commerce` (neutral).
- `width` / `height`: host box size. The glass is centred in it.
- `scrim` (0-1): dark layer under the content, on both the frost and the refraction path (the opaque solid surface ignores it). Glass is translucent, so text contrast depends on the backdrop. On a near-white backdrop, white text on refracting glass measured 1.19:1 without a working scrim; with `scrim={0.55}` on the refraction path it measures about 5.2:1. Raise it over bright imagery and check the real backdrop.
- No `onClick`. The host is a plain container. Put a real `<button>` or `<a>` inside so keyboard and screen readers work.
- Pass `aria-label`, `role`, `data-*`, `className`, `id` straight through to the host.

## Rules that keep it premium

1. Glass needs something worth showing behind it: photography, gradients, video, a 3D scene. On a flat colour it is a grey box.
2. Refraction `displacementScale` stays at or below ~20. Verified in Chromium: 28+ on wide (about 4:1) boxes shows a dark smeared rim.
3. Refraction is expensive. In Chromium emulation (4x CPU throttle, software-rasterised backdrop blur, so a relative measure and not a phone) six forced refracting elements took a median 417-600 ms per frame in the stress scene. Use refraction on one hero element per viewport, desktop only. Backdrop blur itself is not free either: measure frost on a real phone before you stack it.
4. Glass on hero and interactive elements only: nav, primary CTA, one feature card, a modal. Never body text containers or long lists.
5. Check text contrast on the real backdrop. Use `scrim`.

## Where it fits (based on what I know of your projects; I have not seen the private repos)

| Project | Use glass on | Skip |
|---|---|---|
| QST website | Floating nav bar, hero CTA, one capabilities card over the hero imagery. `qst` preset. | Service/legal text sections |
| QST "Websites" tab (Manny's showcase) | Caption chip and "View live" button over the screenshot. | Grid of cards |
| Manny's Pro Cuts | Sticky "Book on Booksy" pill over the hero photo; hours/location chip. `manny` preset. | Service price list |
| QCore landing | Hero stat chips, floating product card over the visual. | Dense feature tables |
| Dream BLVD (Next.js 14) | Header, product quick-view overlay. `commerce`. | Product grid |
| Asset Ave (Shopify) | Use the frost CSS only in the Liquid theme (no React). | Checkout |

## Next.js notes

- Server Components can import the package directly; every bundle file carries `"use client"`.
- Put the glass above a `position: relative` image/video layer. `backdrop-filter` only sees what is painted behind it.

## Lenis / GSAP notes

- Lenis (`autoRaf: false`, driven from `gsap.ticker`) and ScrollTrigger scrubbing work with both glass paths, in StrictMode, and tear down without leaking listeners (measured against a no-glass baseline).
- **Fade the glass host, not a wrapper.** `opacity < 1` on an ancestor makes that ancestor a Backdrop Root, so the glass can no longer see the page behind it and the blur disappears while the animation runs. Measured in Chromium: wrapper at 0.9 opacity loses the blur, the same opacity on the glass host (`data-fade` on `PremiumGlass`) keeps it. Only opacity was measured here. Per the Filter Effects Level 2 spec, `filter`, `mask`, `clip-path`, `backdrop-filter`, `mix-blend-mode` and `will-change` for any of those create a Backdrop Root too; they were not tested individually, so check them if you animate an ancestor.

## Test it yourself

```bash
npx playwright install chromium firefox webkit   # once
bash test-apps/setup.sh          # build, pack, install into the Next, Vite and smooth-scroll apps
bash test-apps/run.sh            # production builds in Chromium, Firefox and WebKit engines
bash test-apps/run-compat.sh     # React dev mode (StrictMode) + Lenis/GSAP
bash test-apps/package-check.sh  # publint, attw, Node ESM/CJS, tsc
```

`npm test` runs setup, run and package-check; `npm run test:compat` runs the compat suite.

See `test-apps/RESULTS.md` for the last run and what it does not cover.
