// Lenis 1.3.27 + GSAP 3.15.0 (ScrollTrigger) with PremiumGlass, wired the way both libraries' docs recommend:
// gsap.ticker drives lenis.raf, lenis.on("scroll", ScrollTrigger.update), StrictMode on.
//   prod  = vite preview of the production build (3105)     dev = vite dev server, React DEVELOPMENT build (3106)
//   BROWSERS=chromium,firefox,webkit (default). Pixel checks run only where the engine draws backdrop-filter (probe).
const { launchers, createReporter, until, stripeAmplitude, engineDrawsBackdropFilter } = require("./lib.cjs")

const APPS = { prod: "http://localhost:3105", dev: "http://localhost:3106" }
const WANT = (process.env.BROWSERS || "chromium,firefox,webkit").split(",").map((s) => s.trim()).filter(Boolean)
let B = "chromium"
const { results, setBrowser, rec, skip, note } = createReporter()
const isChromium = () => B === "chromium"
const warpCount = (page) => page.evaluate(() => document.querySelectorAll(".glass__warp").length)
const benign = (l) => /Failed to load resource.*404|\[vite\] (connecting|connected)|favicon|Download the React DevTools/i.test(l)
const pct = (a, p) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))]

async function open(browser, base, query) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 } })
  const page = await ctx.newPage()
  const logs = []
  page.on("console", (m) => ["error", "warning"].includes(m.type()) && logs.push(`${m.type()}: ${m.text()}`))
  page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`))
  // Active-listener ledger: which listeners are still registered on MediaQueryList / window / document.
  await page.addInitScript(() => {
    const reg = new WeakMap()
    const active = new Map()
    window.__listeners = () => Object.fromEntries([...active].filter(([, v]) => v > 0))
    const kind = (t) => (t instanceof MediaQueryList ? "MediaQueryList" : t === window ? "window" : t === document ? "document" : null)
    const bump = (t, type, d) => {
      const k = kind(t)
      if (!k) return
      active.set(`${k}:${type}`, (active.get(`${k}:${type}`) || 0) + d)
    }
    const add = EventTarget.prototype.addEventListener
    const remove = EventTarget.prototype.removeEventListener
    EventTarget.prototype.addEventListener = function (type, fn, opts) {
      if (fn) {
        const cap = typeof opts === "boolean" ? opts : !!(opts && opts.capture)
        let m = reg.get(this)
        if (!m) reg.set(this, (m = new Map()))
        const id = `${type}|${cap}`
        let s = m.get(id)
        if (!s) m.set(id, (s = new Set()))
        if (!s.has(fn)) {
          s.add(fn)
          bump(this, type, 1)
        }
      }
      return add.apply(this, arguments)
    }
    EventTarget.prototype.removeEventListener = function (type, fn, opts) {
      const cap = typeof opts === "boolean" ? opts : !!(opts && opts.capture)
      const s = reg.get(this)?.get(`${type}|${cap}`)
      if (fn && s && s.delete(fn)) bump(this, type, -1)
      return remove.apply(this, arguments)
    }
  })
  await page.goto(`${base}/?${query}`, { waitUntil: "load", timeout: 60000 })
  const ready = await until(page, () => window.__ready === true, undefined, 15000)
  await page.waitForTimeout(600)
  return { ctx, page, logs, ready }
}

// Real wheel input: Lenis intercepts it and glides; returns scrollY at the moment input stops and after it settles.
async function wheelScroll(page, total = 1500, steps = 10) {
  await page.mouse.move(500, 400)
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, total / steps)
    await page.waitForTimeout(40)
  }
  const atEnd = await page.evaluate(() => scrollY)
  await page.waitForTimeout(1800)
  const settled = await page.evaluate(() => scrollY)
  return { atEnd, settled }
}

async function smoothScroll(browser, app, base) {
  const { ctx, page, logs, ready } = await open(browser, base, "mode=frost&fade=host")
  rec(app, "lenis+gsap mount under StrictMode without errors", ready && logs.filter((l) => !benign(l)).length === 0, logs.filter((l) => !benign(l)).map((l) => l.slice(0, 160)).join(" | ") || "clean")
  const hasLenis = await page.evaluate(() => document.documentElement.classList.contains("lenis"))
  const opBefore = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="glass-"]')].map((e) => +getComputedStyle(e).opacity))
  rec(app, "gsap ScrollTrigger is really driving the cards (below-fold cards start faded)", opBefore[5] < 0.5 && opBefore[0] > 0.9, `opacity per card=${opBefore.map((o) => o.toFixed(2)).join(",")}`)
  const { atEnd, settled } = await wheelScroll(page)
  rec(app, "lenis is really smoothing: scroll keeps gliding after the wheel stops", hasLenis && settled - atEnd > 60, `html.lenis=${hasLenis} scrollY at last wheel=${Math.round(atEnd)} settled=${Math.round(settled)} glide=${Math.round(settled - atEnd)}px`)
  const state = await page.evaluate(() => ({
    hosts: document.querySelectorAll('[data-testid^="glass-"]').length,
    ops: [...document.querySelectorAll('[data-testid^="glass-"]')].map((e) => +getComputedStyle(e).opacity),
    bf: getComputedStyle(document.querySelector('[data-testid="glass-0"]')).backdropFilter || getComputedStyle(document.querySelector('[data-testid="glass-0"]')).webkitBackdropFilter,
  }))
  rec(app, "after Lenis scroll the glass cards are intact and GSAP has revealed the visible ones", state.hosts === 6 && state.ops[2] > 0.9 && /blur/.test(state.bf || ""), `hosts=${state.hosts} opacity=${state.ops.map((o) => o.toFixed(2)).join(",")} backdrop-filter=${state.bf}`)
  const errs = logs.filter((l) => !benign(l))
  rec(app, "no console errors or warnings during Lenis+GSAP scrolling", errs.length === 0, errs.map((l) => l.slice(0, 160)).join(" | ") || "clean")

  const probe = await engineDrawsBackdropFilter(browser, B)
  if (!probe.draws) skip(app, "glass is still blurred after Lenis+GSAP finished (pixel check)", `${B} does not draw backdrop-filter in screenshots here (bare-page probe ${probe.withFilter.toFixed(0)} vs ${probe.without.toFixed(0)})`)
  else {
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(1500)
    await page.addStyleTag({ content: "button{visibility:hidden!important}" })
    const box = await page.locator('[data-testid="glass-0"]').boundingBox()
    const y = box.y + box.height / 2 - 10
    const aOut = await stripeAmplitude(page, { x: 100, y, width: 80, height: 20 })
    const aIn = await stripeAmplitude(page, { x: box.x + box.width / 2 - 40, y, width: 80, height: 20 })
    rec(app, "glass is still blurred after Lenis+GSAP finished (pixel check, host faded by GSAP)", aIn < aOut * 0.5, `amplitude inside=${aIn.toFixed(1)} outside=${aOut.toFixed(1)} ratio=${(aIn / aOut).toFixed(2)}`)
  }
  await ctx.close()
}

// GSAP fades are usually put on a section wrapper. A wrapper with opacity < 1 is a Backdrop Root: the glass inside can only blur
// what is inside that wrapper, so the blur disappears while the fade runs. Fading the glass host itself keeps it.
async function backdropRoot(browser, app, base) {
  const probe = await engineDrawsBackdropFilter(browser, B)
  if (!probe.draws) return skip(app, "GSAP opacity on host vs wrapper: blur kept or lost", `${B} does not draw backdrop-filter in screenshots here`)
  const { ctx, page } = await open(browser, base, "mode=frost&fade=none&lenis=0")
  await page.addStyleTag({ content: "button{visibility:hidden!important}" })
  const box = await page.locator('[data-testid="glass-0"]').boundingBox()
  const y = box.y + box.height / 2 - 10
  const measure = async () => {
    const out = await stripeAmplitude(page, { x: 100, y, width: 80, height: 20 })
    const inn = await stripeAmplitude(page, { x: box.x + box.width / 2 - 40, y, width: 80, height: 20 })
    return inn / out
  }
  const rest = await measure()
  // Opacity 0.9, not 0.5: at 0.5 the glass is half-transparent and honestly shows half of the sharp backdrop, which muddies the
  // comparison. At 0.9 a surviving blur stays near the resting ratio (~0.1) and a lost blur jumps to ~1 (the sharp stripes).
  await page.evaluate(() => (document.querySelector('[data-testid="glass-0"]').style.opacity = "0.9"))
  await page.waitForTimeout(300)
  const host = await measure()
  await page.evaluate(() => {
    const h = document.querySelector('[data-testid="glass-0"]')
    h.style.opacity = ""
    h.parentElement.style.opacity = "0.9"
  })
  await page.waitForTimeout(300)
  const wrapper = await measure()
  rec(app, "opacity 0.9 on the glass HOST keeps the blur (ratio < 0.3)", rest < 0.3 && host < 0.3, `ratio at rest=${rest.toFixed(2)}, host opacity .9=${host.toFixed(2)}`)
  rec(app, "opacity 0.9 on a WRAPPER loses the blur (documented limitation: ratio > 0.7)", wrapper > 0.7, `ratio with wrapper opacity .9=${wrapper.toFixed(2)}`)
  await ctx.close()
}

async function refractionWithSmoothScroll(browser, app, base) {
  const { ctx, page, logs, ready } = await open(browser, base, "mode=force&fade=host")
  const before = await warpCount(page)
  const { settled } = await wheelScroll(page, 2400, 12)
  const after = await warpCount(page)
  const errs = logs.filter((l) => !benign(l))
  rec(app, "refraction path survives Lenis+GSAP scrolling (elements stay mounted, no errors)", ready && before === 6 && after === 6 && errs.length === 0 && settled > 500, `warp before=${before} after=${after} scrollY=${Math.round(settled)} errors=${errs.length}${errs.length ? ": " + errs[0].slice(0, 120) : ""}`)
  await ctx.close()
}

// Frame cost of the wheel glide, informational: frost vs refraction vs no glass. CPU-rasterized VM, not a device.
async function frames(browser, app, base) {
  if (!isChromium()) return
  for (const [label, q] of [["frost x6 + lenis + gsap", "mode=frost&fade=host"], ["refraction x6 + lenis + gsap", "mode=force&fade=host"]]) {
    const { ctx, page } = await open(browser, base, q)
    // Sample rAF intervals for 2.4s while real wheel input keeps Lenis gliding.
    const sampling = page.evaluate(
      () =>
        new Promise((res) => {
          const t = []
          const start = performance.now()
          let last = start
          const step = (now) => {
            t.push(now - last)
            last = now
            now - start < 2400 ? requestAnimationFrame(step) : res(t)
          }
          requestAnimationFrame(step)
        }),
    )
    await page.mouse.move(500, 400)
    for (let i = 0; i < 20; i++) {
      await page.mouse.wheel(0, 120)
      await page.waitForTimeout(60)
    }
    const samples = await sampling
    const y = await page.evaluate(() => scrollY)
    await ctx.close()
    const slow = samples.filter((x) => x > 33).length
    console.log(`PERF [${B}/${app}] ${label}: frames=${samples.length} p50=${pct(samples, 0.5).toFixed(1)}ms p95=${pct(samples, 0.95).toFixed(1)}ms >33ms=${slow} scrollY=${Math.round(y)} (desktop viewport, CPU-rasterized VM)`)
    note(app, `frames ${label}`, `frames=${samples.length} p50=${pct(samples, 0.5).toFixed(1)} p95=${pct(samples, 0.95).toFixed(1)} slow=${slow} scrollY=${Math.round(y)}`)
  }
}

// StrictMode runs every effect twice in dev. A leak shows up as listeners that outlive the component.
async function leaks(browser, app, base) {
  // Baseline: the same page with no glass. GSAP's ScrollTrigger registers window/document pointer, touch and scroll listeners
  // when the plugin loads and keeps them for the page's lifetime, so only the DIFFERENCE against this baseline is the glass.
  const base0 = await open(browser, base, "mode=frost&fade=none&lenis=0&glass=0")
  await base0.page.evaluate(() => window.__unmount())
  await base0.page.waitForTimeout(500)
  const baseline = await base0.page.evaluate(() => window.__listeners())
  await base0.ctx.close()
  for (const [label, q, expectMql] of [["frost", "mode=frost&fade=none&lenis=0", 24], ["refraction", "mode=force&fade=none&lenis=0", 24]]) {
    const { ctx, page, ready } = await open(browser, base, q)
    if (label === "refraction") await until(page, () => document.querySelectorAll(".glass__warp").length > 0, undefined, 8000)
    const mounted = await page.evaluate(() => window.__listeners())
    await page.evaluate(() => window.__unmount())
    await page.waitForTimeout(500)
    const gone = await page.evaluate(() => window.__listeners())
    const mql = mounted["MediaQueryList:change"] || 0
    rec(app, `StrictMode ${label}: media-query listeners = 6 components x 4 queries (no double registration)`, ready && mql === expectMql, `MediaQueryList:change mounted=${mql}, expected ${expectMql}`)
    const extra = Object.entries(gone).filter(([k, v]) => v > (baseline[k] || 0))
    rec(app, `StrictMode ${label}: after unmount the glass leaves no listener behind (vs a no-glass baseline)`, extra.length === 0, extra.length ? extra.map(([k, v]) => `${k}=${v} (baseline ${baseline[k] || 0})`).join(", ") : `identical to baseline: ${Object.keys(baseline).length} listener kinds, all from GSAP`)
    await ctx.close()
  }
}

;(async () => {
  const versions = {}
  for (const name of WANT) {
    B = name
    setBrowser(name)
    let browser
    try {
      browser = await launchers[name]()
    } catch (e) {
      rec("-", `${name}: browser launches`, false, String(e.message).split("\n")[0])
      continue
    }
    versions[name] = browser.version()
    console.log(`\n===== lenis+gsap / ${name} ${browser.version()} =====`)
    for (const [app, base] of Object.entries(APPS)) {
      try {
        await smoothScroll(browser, app, base)
        await backdropRoot(browser, app, base)
        await refractionWithSmoothScroll(browser, app, base)
        await frames(browser, app, base)
        await leaks(browser, app, base)
      } catch (e) {
        rec(app, "smooth-app reachable", false, `${String(e.message).split("\n")[0].slice(0, 160)} (start it with test-apps/run-compat.sh)`)
      }
    }
    await browser.close()
  }
  const fail = results.filter((x) => !x.pass)
  console.log("\n===== summary (lenis + gsap) =====")
  for (const name of WANT) {
    const r = results.filter((x) => x.browser === name && !x.info)
    console.log(`${name.padEnd(9)} ${versions[name] || "not launched"}: ${r.filter((x) => x.pass && !x.skipped).length} passed, ${r.filter((x) => !x.pass).length} failed, ${r.filter((x) => x.skipped).length} skipped`)
  }
  require("fs").writeFileSync(__dirname + "/results-smooth.json", JSON.stringify({ versions, results }, null, 2))
  process.exit(fail.length ? 1 : 0)
})()
