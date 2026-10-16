# Liquid Glass: Usage and Placement Guide

## Install and use
```tsx
import { PremiumGlass } from "liquid-glass-react"   // package name unchanged until you publish

<PremiumGlass preset="qst" width={420} height={96}>Request access</PremiumGlass>
```
- Works in Next.js App Router (bundle ships `"use client"`), Vite and plain React. No Tailwind needed.
- Server render and first paint are always the CSS frost. After mount, Chromium desktop upgrades to real refraction. Safari, Firefox, touch devices and users with reduced motion/transparency keep the frost. This is by design: those browsers can't draw the displacement.
- `width`/`height` size the host box; the glass is centred in it. `force="frost" | "refract"` overrides detection.
- Presets: `qst` (Titanium edge, Signal-blue whisper), `manny` (clipper blue, faint comb red), `commerce` (neutral, product-first).

## Rules that keep it premium
1. Glass needs something worth refracting behind it: photography, gradients, video, a 3D scene. On a flat colour it is just a grey box. Do not use it there.
2. Keep `displacementScale` at or below ~20. Verified in Chromium: 28+ on wide boxes shows a dark smeared rim.
3. Max 2-3 refracting elements per viewport. Each one runs an SVG filter over the backdrop every frame.
4. Glass on interactive/hero elements only: nav, primary CTA, one feature card, a modal. Never body text containers or long lists.
5. Text on glass: white, 16px+, and check contrast against the brightest area behind it.

## Where it fits (based on projects I know about; I have not seen the private repos)
| Project | Use glass on | Skip |
|---|---|---|
| QST website | Floating nav bar, hero CTA, one "capabilities" card over the hero imagery. `qst` preset. | Service/legal text sections |
| QST "Websites" tab (Manny's showcase) | Device-frame caption chip and the "View live" button over the screenshot. | Grid of cards |
| Manny's Pro Cuts | Sticky "Book on Booksy" pill over hero photo; hours/location chip. `manny` preset. | Service price list |
| QCore landing | Hero stat chips, floating product card over the visual. | Dense feature tables |
| Dream BLVD (Next.js 14) | Header, product quick-view overlay. `commerce`. | Product grid |
| Asset Ave (Shopify) | Needs a theme-level approach: use the frost CSS only (Liquid theme, no React). | Anything in the checkout |

## Next.js notes
- Import from a client component or directly; the banner handles it.
- Put the glass above a `position: relative` image/video layer; `backdrop-filter` only sees what is painted behind it.
