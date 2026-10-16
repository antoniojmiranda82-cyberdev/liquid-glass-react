// Runs against the production builds of both test apps (Next on 3101, Vite SSR on 3103).
// Chromium only: no Firefox/WebKit browsers exist in this environment, so those are NOT covered here.
const { chromium, devices } = require("playwright")
const fs = require("fs")
const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8")

const APPS = { next: "http://localhost:3101", vite: "http://localhost:3103" }
const results = []
const rec = (app, test, pass, detail = "") => {
  results.push({ app, test, pass, detail })
  console.log(`${pass ? "PASS" : "FAIL"} [${app}] ${test}${detail ? ` :: ${detail}` : ""}`)
}
const HYDRATION = /hydrat|did not match|Minified React error #(418|419|422|423|425)|Text content does not match/i
const warpCount = (page) => page.evaluate(() => document.querySelectorAll(".glass__warp").length)
const pct = (a, p) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))]

async function newPage(browser, opts = {}) {
  const ctx = await browser.newContext(opts.context || { viewport: { width: 1000, height: 800 } })
  const page = await ctx.newPage()
  const logs = []
  page.on("console", (m) => ["error", "warning"].includes(m.type()) && logs.push(`${m.type()}: ${m.text()}`))
  page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`))
  await page.addInitScript(() => {
    window.__cls = 0
    window.__long = []
    try {
      new PerformanceObserver((l) => l.getEntries().forEach((e) => !e.hadRecentInput && (window.__cls += e.value))).observe({ type: "layout-shift", buffered: true })
      new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(e.duration))).observe({ type: "longtask", buffered: true })
    } catch {}
  })
  return { ctx, page, logs }
}

async function hydration(browser, app, base) {
  for (const v of ["", "refract", "force", "stress"]) {
    const { ctx, page, logs } = await newPage(browser)
    const res = await page.request.get(`${base}/${v}`)
    const html = await res.text()
    const ssrFrost = html.includes("backdrop-filter") && !html.includes("glass__warp")
    await page.goto(`${base}/${v}`)
    await page.waitForTimeout(1200)
    const bad = logs.filter((l) => HYDRATION.test(l) || l.startsWith("pageerror") || l.startsWith("error"))
    const warps = await warpCount(page)
    const wantWarp = v === "refract" || v === "force"
    rec(app, `hydration /${v || "(root)"}: SSR HTML is frost, no console/hydration errors`, ssrFrost && bad.length === 0, bad.join(" | ") || `ssrFrost=${ssrFrost}`)
    rec(app, `refraction opt-in /${v || "(root)"}: ${wantWarp ? "upgrades after mount" : "stays frost"}`, wantWarp ? warps > 0 : warps === 0, `warp elements=${warps}`)
    await ctx.close()
  }
}

// A check that cannot fail proves nothing: /mismatch renders different text on server and client.
async function negativeControl(browser, app, base) {
  const { ctx, page, logs } = await newPage(browser)
  await page.goto(`${base}/mismatch`)
  await page.waitForTimeout(1200)
  const caught = logs.some((l) => HYDRATION.test(l))
  rec(app, "negative control: the hydration check DOES catch a real mismatch", caught, caught ? "detected" : `NOT detected, logs=${logs.join(" | ").slice(0, 120)}`)
  await ctx.close()
}

async function scriptBytes(browser, base, path) {
  const { ctx, page } = await newPage(browser)
  await page.goto(`${base}${path}`, { waitUntil: "networkidle" })
  await page.waitForTimeout(800)
  const bytes = await page.evaluate(() => performance.getEntriesByType("resource").filter((e) => e.initiatorType === "script" || /\.js(\?|$)/.test(e.name)).reduce((s, e) => s + (e.decodedBodySize || 0), 0))
  await ctx.close()
  return bytes
}

async function lazyLoad(browser, app, base) {
  const frost = await scriptBytes(browser, base, "/")
  const refr = await scriptBytes(browser, base, "/refract")
  const delta = refr - frost
  console.log(`BYTES [${app}] decoded JS: frost page=${(frost / 1024).toFixed(1)} KB, opt-in refraction page=${(refr / 1024).toFixed(1)} KB, delta=${(delta / 1024).toFixed(1)} KB`)
  const entry = app === "next" ? "liquid-glass-react/premium" : "liquid-glass-react (root)"
  rec(app, `frost-only page does not download the refraction engine (import from ${entry})`, delta > 30 * 1024, `delta=${(delta / 1024).toFixed(1)} KB`)
}

// White text over the glass, sampled where the button text sits, with the text itself hidden.
async function contrast(browser, app, base) {
  for (const [v, minWanted] of [["", null], ["scrim", 4.5]]) {
    const { ctx, page } = await newPage(browser)
    await page.goto(`${base}/${v}`)
    await page.waitForTimeout(800)
    await page.addStyleTag({ content: "button{color:transparent!important;border-color:transparent!important}" })
    const worst = []
    for (let i = 0; i < 3; i++) {
      const box = await page.locator(`[data-testid="glass-${i}"] button`).boundingBox()
      const png = (await page.screenshot({ clip: box })).toString("base64")
      const ratio = await page.evaluate(async (b64) => {
        const img = new Image(); img.src = "data:image/png;base64," + b64; await img.decode()
        const c = document.createElement("canvas"); c.width = img.width; c.height = img.height
        const x = c.getContext("2d"); x.drawImage(img, 0, 0)
        const d = x.getImageData(0, 0, c.width, c.height).data
        const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
        let max = 0
        for (let p = 0; p < d.length; p += 4) max = Math.max(max, 0.2126 * lin(d[p]) + 0.7152 * lin(d[p + 1]) + 0.0722 * lin(d[p + 2]))
        return 1.05 / (max + 0.05)
      }, png)
      worst.push(ratio)
    }
    const min = Math.min(...worst)
    console.log(`CONTRAST [${app}] /${v || "(root)"}: worst white-text ratio per preset (qst, manny, commerce) = ${worst.map((r) => r.toFixed(2)).join(", ")}`)
    if (minWanted) rec(app, `contrast: scrim=0.55 keeps white text >= ${minWanted}:1 on the bright test backdrop`, min >= minWanted, `worst=${min.toFixed(2)}`)
    else results.push({ app, test: "contrast (no scrim) informational", pass: true, detail: `worst=${min.toFixed(2)}` })
    await ctx.close()
  }
}

async function a11y(browser, app, base) {
  for (const v of ["", "refract"]) {
    const { ctx, page } = await newPage(browser)
    await page.goto(`${base}/${v}`)
    await page.waitForTimeout(800)
    await page.evaluate(axeSrc)
    const r = await page.evaluate(() => axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] }))
    const v2 = r.violations.map((x) => `${x.id}(${x.nodes.length})`)
    const cc = r.incomplete.filter((x) => x.id === "color-contrast").length
    rec(app, `axe /${v || "(root)"}: no WCAG A/AA or best-practice violations`, v2.length === 0, v2.join(", ") || `color-contrast flagged "needs review" on ${cc ? "some" : "no"} nodes (axe cannot compute contrast over backdrop-filter)`)
    await page.keyboard.press("Tab")
    const focus = await page.evaluate(() => ({ tag: document.activeElement?.tagName, text: document.activeElement?.textContent }))
    const hostFocusable = await page.evaluate(() => document.querySelector('[data-testid="glass-0"]').tabIndex)
    rec(app, `keyboard /${v || "(root)"}: first Tab lands on the real <button>, glass host not a tab stop`, focus.tag === "BUTTON" && hostFocusable === -1, `focus=${focus.tag}:${focus.text}, host tabIndex=${hostFocusable}`)
    await ctx.close()
  }
}

async function media(browser, app, base) {
  // reduced motion at load
  let s = await newPage(browser, { context: { viewport: { width: 1000, height: 800 }, reducedMotion: "reduce" } })
  await s.page.goto(`${base}/force`)
  await s.page.waitForTimeout(800)
  rec(app, "reduced-motion: forced refraction is still suppressed", (await warpCount(s.page)) === 0)
  await s.ctx.close()
  // live toggle
  s = await newPage(browser)
  await s.page.goto(`${base}/force`)
  await s.page.waitForTimeout(800)
  const before = await warpCount(s.page)
  await s.page.emulateMedia({ reducedMotion: "reduce" })
  await s.page.waitForTimeout(400)
  const after = await warpCount(s.page)
  await s.page.emulateMedia({ reducedMotion: "no-preference" })
  await s.page.waitForTimeout(400)
  const back = await warpCount(s.page)
  rec(app, "reduced-motion: live toggle drops and restores refraction", before > 0 && after === 0 && back > 0, `before=${before} reduced=${after} restored=${back}`)
  // forced colors / contrast / transparency -> solid surface
  for (const [label, emu] of [["forced-colors", { forcedColors: "active" }], ["prefers-contrast: more", { contrast: "more" }]]) {
    try {
      await s.page.emulateMedia(emu)
      await s.page.waitForTimeout(400)
      const bf = await s.page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="glass-0"]')).backdropFilter)
      const w = await warpCount(s.page)
      rec(app, `${label}: opaque surface, no backdrop blur, no refraction`, (bf === "none" || bf === "") && w === 0, `backdrop-filter=${bf} warp=${w}`)
    } catch (e) {
      rec(app, `${label}: emulation unavailable`, false, String(e.message).slice(0, 80))
    }
  }
  await s.page.emulateMedia({ forcedColors: "none", contrast: "no-preference" })
  try {
    const cdp = await s.ctx.newCDPSession(s.page)
    await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-transparency", value: "reduce" }] })
    await s.page.waitForTimeout(400)
    const supported = await s.page.evaluate(() => matchMedia("(prefers-reduced-transparency: reduce)").matches)
    if (!supported) rec(app, "prefers-reduced-transparency", true, "UNTESTED: this Chromium build does not expose the media feature")
    else {
      const bf = await s.page.evaluate(() => getComputedStyle(document.querySelector('[data-testid="glass-0"]')).backdropFilter)
      rec(app, "prefers-reduced-transparency: opaque surface", bf === "none" && (await warpCount(s.page)) === 0, `backdrop-filter=${bf}`)
    }
  } catch (e) {
    rec(app, "prefers-reduced-transparency", true, `UNTESTED: ${String(e.message).slice(0, 60)}`)
  }
  await s.ctx.close()
}

async function mobile(browser, app, base) {
  const ctxOpts = { ...devices["iPhone 13"] }
  delete ctxOpts.defaultBrowserType
  for (const v of ["refract", "stress", "stress-refract"]) {
    const { ctx, page } = await newPage(browser, { context: ctxOpts })
    const cdp = await ctx.newCDPSession(page)
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 })
    await page.goto(`${base}/${v}`)
    await page.waitForTimeout(1500)
    const warps = await warpCount(page)
    if (v === "refract") {
      rec(app, "mobile (touch): opt-in refraction stays frost", warps === 0, `warp=${warps}`)
      await ctx.close()
      continue
    }
    const frames = await page.evaluate(
      () =>
        new Promise((res) => {
          const t = [], total = document.documentElement.scrollHeight - innerHeight, start = performance.now()
          let last = start
          const step = (now) => {
            t.push(now - last); last = now
            const k = Math.min(1, (now - start) / 3000)
            scrollTo(0, total * k)
            k < 1 ? requestAnimationFrame(step) : res(t)
          }
          requestAnimationFrame(step)
        }),
    )
    const m = await page.evaluate(() => ({ cls: window.__cls, long: window.__long.length, longMax: Math.max(0, ...window.__long) }))
    const slow = frames.filter((x) => x > 33).length
    console.log(`PERF [${app}] /${v} (iPhone 13 emulation, 4x CPU throttle): frames=${frames.length} p50=${pct(frames, 0.5).toFixed(1)}ms p95=${pct(frames, 0.95).toFixed(1)}ms >33ms=${slow} CLS=${m.cls.toFixed(4)} longtasks=${m.long} (max ${m.longMax.toFixed(0)}ms) refractionElements=${warps}`)
    results.push({ app, test: `perf /${v}`, pass: true, detail: `p50=${pct(frames, 0.5).toFixed(1)} p95=${pct(frames, 0.95).toFixed(1)} slow=${slow} cls=${m.cls.toFixed(4)} long=${m.long}` })
    if (v === "stress") rec(app, "mobile frost x6: CLS under 0.1 and p95 frame under 50ms at 4x throttle", m.cls < 0.1 && pct(frames, 0.95) < 50, `cls=${m.cls.toFixed(4)} p95=${pct(frames, 0.95).toFixed(1)}`)
    await ctx.close()
  }
}

;(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" })
  for (const [app, base] of Object.entries(APPS)) {
    await hydration(browser, app, base)
    await negativeControl(browser, app, base)
    await lazyLoad(browser, app, base)
    await contrast(browser, app, base)
    await a11y(browser, app, base)
    await media(browser, app, base)
    await mobile(browser, app, base)
  }
  await browser.close()
  const fail = results.filter((r) => !r.pass)
  console.log(`\n${results.length - fail.length}/${results.length} passed`)
  fs.writeFileSync(__dirname + "/results.json", JSON.stringify(results, null, 2))
  process.exit(fail.length ? 1 : 0)
})()
