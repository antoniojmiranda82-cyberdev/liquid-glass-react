# Verification results

Run: 2026-10-16, one Linux VM, Playwright 1.56.0. Package built with tsdown, packed with `npm pack`, installed from the tarball into separate apps.

| App | Stack | Entry used |
|---|---|---|
| `next-app` | Next.js 16.4.2, React 19.3.1, App Router, Server Component importing the package | `liquid-glass-react/premium` |
| `vite-app` | Vite 8.3.4, React 18.3.1, custom Node SSR server + `hydrateRoot` (StrictMode) | `liquid-glass-react` (root) |
| `smooth-app` | Vite, React 18.3.1, Lenis 1.3.27, GSAP 3.15.0 + ScrollTrigger | `liquid-glass-react` (root) |

**These are engine builds on Linux, not browsers on devices.** Firefox 142.0.1, WebKit 26.0 (the engine behind Safari, not Safari) and Chromium 141.0.7390.37. The mobile profiles are emulation. Nothing here ran on a physical phone, in Safari, or with a screen reader.

## Totals (`npm test`, exit 0, 0 failures)

| Engine | Passed | Failed | Skipped (not verified) |
|---|---|---|---|
| Chromium 141 | 90 | 0 | 0 |
| Firefox 142 | 68 | 0 | 6 |
| WebKit 26 | 72 | 0 | 4 |

Plus `run-compat.sh` (React dev mode, Lenis/GSAP): dev mode 20/20 (Chromium only); Lenis/GSAP Chromium 26/0/0, Firefox 20/0/4 skipped, WebKit 20/0/4 skipped.
Package checks: publint clean (2 optional suggestions), attw green on node16 CJS, node16 ESM and bundler for both entries, Node ESM and CJS consumers pass, `tsc --strict` passes against React 18 and React 19 types.

## What was checked

| Area | Check | Result |
|---|---|---|
| SSR hydration | Server HTML is frost with both `backdrop-filter` and `-webkit-backdrop-filter`, no hydration/console errors, 4+ variants per app, 3 engines | Pass |
| SSR hydration | **Negative control**: a deliberate server/client mismatch is detected by the same check (prod and dev) | Pass |
| Opt-in | Default stays frost; `refraction` upgrades after mount where the gate allows; touch stays frost | Pass |
| Frost rendering | Pixels behind the glass are blurred (stripe-amplitude ratio 0.01 vs 0.85 for the negative control) | Chromium only; see SKIP list |
| Accessibility | axe-core (WCAG 2.x A+AA, best-practice), frost and refraction pages, 3 engines | 0 violations |
| Accessibility | Keyboard: first Tab lands on the real `<button>`, glass host is not a tab stop | Pass, 3 engines |
| Accessibility prefs | `prefers-reduced-motion`, `prefers-contrast: more`, `forced-colors` (load + live toggle), `prefers-reduced-transparency` (Chromium CDP) give an opaque surface with no blur | Pass where the engine can emulate it; see SKIP list |
| Dynamic changes | Live toggle drops refraction to solid/frost and restores it | Pass in Chromium |
| Touch fallback | iPhone 13 profile is held by the user-agent gate; Pixel 7 profile (Chrome UA) is held by the pointer gate, and `forceRefraction` still upgrades it, proving which gate holds | Pass |
| Bundle | Frost-only page does not download the refraction engine (about 58 KB) | Pass |
| Package | publint, attw, Node ESM/CJS, `tsc --strict`, presets intact, upstream default export intact | Pass |
| Dev mode | `next dev` (React 19) and Vite dev SSR (React 18), StrictMode, 6 routes each: no console errors or React dev warnings, refraction mounts under double effects | 20/20, Chromium only |
| Lenis / GSAP | Smooth scroll + ScrollTrigger scrub with frost and refraction: glass stays blurred, no leaked listeners vs a no-glass baseline, wrapper-opacity Backdrop Root behaviour | See below |

### Scrim fix (the contrast gap in the refraction path)

`scrim` was applied on the frost path only; the refraction path ignored it. Fixed in `src/premium.tsx`; regression rows were added on a near-white backdrop with negative controls.

| Path | Backdrop | Scrim | White text contrast |
|---|---|---|---|
| Refraction (forced) | near-white | none (control) | 1.19-1.21 : 1 |
| Refraction (forced) | near-white | 0.55, before the fix | 1.19-1.20 : 1 |
| Refraction (forced) | near-white | 0.55, after the fix | 5.17-5.20 : 1 |
| Frost | near-white | 0.55 | 5.06-5.50 : 1 |
| Frost, dark backdrop | dark | none: 12.11 / 12.11 / 7.85, scrim 0.55: 16.9 / 17.0 / 14.6 | |

Contrast is measured from rendered pixels behind the text and only where the engine draws backdrop blur (Chromium here). Firefox on the dark backdrop measured 10.05 and on the bright one 4.94 on the frost path; with no blur drawn in that engine these describe the tint and scrim, not a real blur.

### Mobile performance: EMULATION ONLY, no physical device

All frame times come from rAF sampling in headless Chromium/WebKit on a CPU/software-rasterised VM with a 4x CPU throttle where the engine supports it. Treat them as relative numbers (blur on vs blur off), not phone frame rates.

| Scenario (6 glass elements) | Chromium iPhone 13 profile | Chromium Pixel 7 profile | WebKit iPhone 13 profile (no throttle) | Firefox 390 px touch (no throttle) |
|---|---|---|---|---|
| Frost, `/stress` | p50 66.6 ms, p95 83-100 ms | p50 50.0 ms, p95 100-117 ms | p50 91-94 ms, p95 128-130 ms | p50 16.6-16.7 ms, p95 17.2 ms (no blur drawn) |
| Same page, `backdrop-filter` removed (control) | 16.7 ms / 16.7-16.8 ms | 16.7 ms / 16.7 ms | 16-17 ms / 19-21 ms | 16.5 ms / 17.2 ms |
| Forced refraction | p50 417-433 ms, p95 550-567 ms | p50 300-500 ms, p95 750-933 ms | p50 318-381 ms, p95 805-928 ms | 16.7 ms (not drawn) |

Reading: the blur itself, not the component code, is what costs frames in a software-rasterised environment (control rows are flat). Whether a GPU-composited phone behaves differently is exactly what this does not tell you. Layout shift was 0.0000 in every Chromium run (Firefox and WebKit do not expose the API). The only perf assertion is CLS < 0.1; frame times are reported, not gated, because thresholds on a CPU-rasterised VM would be meaningless.

### Lenis / GSAP

- Glass stays blurred after Lenis + GSAP scrubbing in Chromium (pixel check), for frost and forced refraction.
- Measured **Backdrop Root** behaviour: opacity 0.9 on a *wrapper* around the glass removed the blur; the same opacity on the glass host kept it. Fade the host, not an ancestor (GLASS-GUIDE.md).
- No listener or element leak after unmount, measured against a `glass=0` baseline (GSAP registers its own window/document listeners, so the baseline is required).
- Chromium frames with 6 frost elements + Lenis + GSAP: p50 33.3 ms, p95 66.7 ms; with 6 forced refracting elements: p50 83.3 ms, p95 150 ms (informational, software-rasterised).

## SKIPPED: could not be verified in this environment

Each skip prints its reason in the run log; none is counted as a pass.

| Engine | Check | Why it cannot run here |
|---|---|---|
| Firefox, WebKit | Frost pixel blur (component, and Lenis/GSAP pixel checks) | These builds draw no `backdrop-filter` in screenshots even on a bare page (stripe amplitude 229.3 with and without the filter). A component pixel test would prove nothing. The declarations are verified present; the blur is not. |
| Firefox | `prefers-contrast: more` live toggle | `matchMedia` flips under emulation but 0 change events fire, so no page can react live. The at-load test passes instead. |
| Firefox, WebKit | `prefers-reduced-transparency` | Playwright 1.56 has no emulation for it outside Chromium CDP. |

## NOT run at all

- Physical iOS or Android devices; real Safari or iOS Safari; Firefox/Chrome on a device. GPU-composited frame budgets of backdrop blur on real phones are unmeasured.
- Screen readers (VoiceOver, NVDA, TalkBack, JAWS). axe and keyboard only. macOS Safari's "Tab to highlight" behaviour.
- Firefox and WebKit in React dev mode (dev suite is Chromium only; React's warnings come from React, not the engine).
- Contrast over your real hero photography. Measured on synthetic backdrops only.
- Next.js on React 18 (Next 16 ran on React 19, Vite on React 18). Peer range `react >=18` is declared, not exhaustively tested.
- Newer Playwright (1.64.x exists); 1.56.0 was used because the installed engine builds match it.

## Disclosures

- **Earlier numbers invalidated.** An earlier run (and the first version of this file) reported Chromium contrast figures such as 6.01 / 6.29 / 4.38 and refraction frame times of 83-100 ms. Headless Chromium does not rasterise `backdrop-filter` by default, so those did not include a real blur. They were replaced after adding the SwiftShader flags in `test-apps/verify/lib.cjs`. The numbers above are the corrected ones.
- The upstream core component (root default export) still has `onClick` on a non-focusable div. `PremiumGlass` deliberately does not expose `onClick`.
- publint suggestions left as is: `"type"` and `"engines.node"` are not set.
- A Next.js build warning ("inferred your workspace root", multiple lockfiles) appears in the test app builds. It is harmless here and can be silenced with `turbopack.root`.
- `npx playwright install firefox webkit` is required for `npm test` (Chromium alone no longer matches the default `BROWSERS`).
