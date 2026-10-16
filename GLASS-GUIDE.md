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

`refraction` never activates on touch devices, Safari or Firefox: they stay on frost by design. `forceRefraction` skips the capability check and exists for demos and tests only.

## Props that matter

- `preset`: `qst` (Titanium edge, Signal-blue whisper), `manny` (clipper blue, faint comb red), `commerce` (neutral).
- `width` / `height`: host box size. The glass is centred in it.
- `scrim` (0-1): dark layer under the content. Glass is translucent, so text contrast depends on the backdrop. Measured on a deliberately bright test backdrop, white text over unscrimmed glass reached 4.38:1 (commerce), below AA. With `scrim={0.55}` the worst case was 11.39:1. Raise it over bright imagery.
- No `onClick`. The host is a plain container. Put a real `<button>` or `<a>` inside so keyboard and screen readers work.
- Pass `aria-label`, `role`, `data-*`, `className`, `id` straight through to the host.

## Rules that keep it premium

1. Glass needs something worth showing behind it: photography, gradients, video, a 3D scene. On a flat colour it is a grey box.
2. Refraction `displacementScale` stays at or below ~20. Verified in Chromium: 28+ on wide (about 4:1) boxes shows a dark smeared rim.
3. Refraction is expensive. In emulation (iPhone 13 profile, 4x CPU throttle) six refracting elements dropped to roughly 12 fps (median frame 83-100 ms) while six frost elements held 60 fps. Use refraction on one hero element per viewport, desktop only.
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

## Test it yourself

```bash
bash test-apps/setup.sh          # build, pack, install into the Next and Vite apps
bash test-apps/run.sh            # 50 Chromium checks against production builds
bash test-apps/package-check.sh  # publint, attw, Node ESM/CJS, tsc
```

See `test-apps/RESULTS.md` for the last run and what it does not cover.
