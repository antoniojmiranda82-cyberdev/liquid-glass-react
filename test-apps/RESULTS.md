# Verification results

Run: 2026-10-16. Package built with tsdown, packed with `npm pack`, installed from the tarball into two separate apps.

| App | Stack | Entry used |
|---|---|---|
| `next-app` | Next.js 16.4.2, React 19.3.1, App Router, Server Component importing the package | `liquid-glass-react/premium` |
| `vite-app` | Vite 8.3.4, React 18.3.1, custom Node SSR server + `hydrateRoot` | `liquid-glass-react` (root) |

**Totals: 50/50 Chromium checks, publint clean (2 optional suggestions), attw green on all resolution modes, Node ESM + CJS + strict TS consumers pass.**

## What was checked

| Area | Check | Result |
|---|---|---|
| SSR hydration | Server HTML is frost, zero hydration/console errors, on 4 variants per app (frost, opt-in, forced, 6x stress) | Pass |
| SSR hydration | **Negative control**: a deliberate server/client mismatch IS detected by the same check | Pass (both apps) |
| Opt-in | Default stays frost; `refraction` upgrades after mount; touch device stays frost | Pass |
| Accessibility | axe-core (WCAG 2.0/2.1 A+AA, best-practice), frost and opt-in pages | 0 violations |
| Accessibility | Keyboard: first Tab lands on the real `<button>`; glass host is not a tab stop | Pass |
| Accessibility | Text contrast, white text, measured from pixels behind the text | See below |
| Reduced motion | `prefers-reduced-motion` at load suppresses forced refraction; live toggle drops and restores it | Pass |
| Reduced motion | `prefers-contrast: more`, `forced-colors`, `prefers-reduced-transparency` give an opaque surface with no blur | Pass |
| Mobile perf | iPhone 13 profile, 4x CPU throttle, 3 s scripted scroll, 6 glass elements | See below |
| Bundle | Frost-only page does not download the refraction engine (about 58 KB) in either app | Pass |
| Package | publint: no errors or warnings. attw: green for node16 CJS, node16 ESM, bundler on both entries | Pass |
| Package | Native Node ESM and CJS import, SSR render, presets intact, upstream default export intact | Pass |
| Package | `tsc --strict` consumers against React 18 and React 19 types | Pass |

### Contrast (measured, informational then gated)

White text over the deliberately bright test backdrop (gradient plus 35% white stripes):

- Without scrim: worst case 6.01 (qst), 6.29 (manny), **4.38 (commerce, below the AA 4.5:1 line)**
- With `scrim={0.55}`: 13.16, 13.43, 11.39

Glass does not guarantee contrast. This is why `scrim` exists and why the guide says to check the real backdrop.

### Mobile performance (emulated)

| Scenario | Median frame | p95 | Frames over 33 ms |
|---|---|---|---|
| 6 frost elements | 16.7 ms | 16.7-16.8 ms | 0-1 of about 180 |
| 6 refracting elements (forced) | 83-100 ms | 130-170 ms | 34-35 of about 36 |

Layout shift was 0 in every run. Refraction is roughly 5x slower under the same throttle, which is why it is opt-in and desktop-only.

## What this does NOT cover (read before trusting the green)

- **Chromium only.** No Firefox or WebKit exists in this environment. Safari and Firefox frost rendering, including `-webkit-backdrop-filter`, is unverified.
- **Mobile numbers are emulation.** Headless Chromium has no GPU and rAF pacing does not capture compositor cost. A real iPhone and a mid-range Android are still needed before claiming mobile smoothness for backdrop blur.
- **Production builds only.** React StrictMode double-effects in dev were not exercised.
- **No screen reader run** (VoiceOver, NVDA, TalkBack). Only axe and keyboard.
- **Contrast is measured on one test backdrop**, not on your real hero imagery.
- **Smooth-scroll libraries untested.** Lenis/GSAP scrubbing with backdrop-filter on top may behave differently.
- Next with React 18 was not run (Next 16 on React 19, Vite on React 18). The peer range `react >=18` is declared, not exhaustively tested.
- The upstream core component (root default export) still has `onClick` on a non-focusable div. `PremiumGlass` deliberately does not expose `onClick`.
- publint suggestions left as is: `"type"` and `"engines.node"` are not set.
