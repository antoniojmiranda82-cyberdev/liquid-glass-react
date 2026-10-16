// Cross-browser verification against the production builds of both test apps (Next on 3101, Vite SSR on 3103).
//   BROWSERS=chromium,firefox,webkit (default). A browser that fails to launch is a FAIL, never a silent skip.
//   Checks an engine cannot run (no emulation API, feature not exposed) are recorded as SKIP with the reason.
// What this is NOT: no physical device, no Safari.app / iOS Safari, no screen reader. Playwright's WebKit and Firefox
// are engine builds on Linux; mobile profiles are emulation. See RESULTS.md for the explicit list.
const { pw, fs, launchers, createReporter, until, stripeAmplitude, engineDrawsBackdropFilter } = require("./lib.cjs")
const axeSrc = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8")

const APPS = { next: "http://localhost:3101", vite: "http://localhost:3103" }
const WANT = (process.env.BROWSERS || "chromium,firefox,webkit").split(",").map((s) => s.trim()).filter(Boolean)
let B = "chromium"
const { results, setBrowser, rec, skip, note } = createReporter()

const HYDRATION = /hydrat|did not match|Minified React error #(418|419|422|423|425)|Text content does not match/i
const warpCount = (page) => page.evaluate(() => document.querySelectorAll(".glass__warp").length)
const pct = (a, p) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))]
const isChromium = () => B === "chromium"
const blurry = (s) => /blur/.test(s || "")
const hostBackdrop = (page, i = 0) =>
  page.evaluate((n) => {
    const s = getComputedStyle(document.querySelector(`[data-testid="glass-${n}"]`))
    return { bf: s.backdropFilter || "", wbf: s.webkitBackdropFilter || "" }
  }, i)

async function newPage(browser, opts = {}) {
  const ctx = await browser.newContext(opts.context || { viewport: { width: 1000, height: 800 } })
  const page = await ctx.newPage()
  const logs = []
  page.on("console", (m) => ["error", "warning"].includes(m.type()) && logs.push(`${m.type()}: ${m.text()}`))
  page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`))
  await page.addInitScript(() => {
    window.__cls = 0
    window.__long = []
    window.__clsOk = false
    window.__longOk = false
    try {
      const types = PerformanceObserver.supportedEntryTypes || []
      if (types.includes("layout-shift")) {
        window.__clsOk = true
        new PerformanceObserver((l) => l.getEntries().forEach((e) => !e.hadRecentInput && (window.__cls += e.value))).observe({ type: "layout-shift", buffered: true })
      }
      if (types.includes("longtask")) {
        window.__longOk = true
        new PerformanceObserver((l) => l.getEntries().forEach((e) => window.__long.push(e.duration))).observe({ type: "longtask", buffered: true })
      }
    } catch {}
  })
  return { ctx, page, logs }
}

async function hydration(browser, app, base) {
  for (const v of ["", "refract", "force", "stress"]) {
    const { ctx, page, logs } = await newPage(browser)
    const res = await page.request.get(`${base}/${v}`)
    const html = await res.text()
    const ssrFrost = html.includes("backdrop-filter") && html.includes("-webkit-backdrop-filter") && !html.includes("glass__warp")
    await page.goto(`${base}/${v}`)
    await page.waitForTimeout(1200)
    const bad = logs.filter((l) => HYDRATION.test(l) || l.startsWith("pageerror") || l.startsWith("error"))
    const warps = await warpCount(page)
    // "refract" is capability-gated to Chromium + fine pointer; "force" bypasses the gate (tests only).
    const wantWarp = v === "force" || (v === "refract" && isChromium())
    rec(app, `hydration /${v || "(root)"}: SSR HTML is frost with prefixed + unprefixed backdrop-filter, no console/hydration errors`, ssrFrost && bad.length === 0, bad.join(" | ") || `ssrFrost=${ssrFrost}`)
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
  const entry = app === "next" ? "liquid-glass-react/premium" : "liquid-glass-react (root)"
  const frost = await scriptBytes(browser, base, "/")
  // Chromium downloads the engine on opt-in; Firefox/WebKit never pass the capability gate, so use /force to measure it.
  const refr = await scriptBytes(browser, base, isChromium() ? "/refract" : "/force")
  const delta = refr - frost
  console.log(`BYTES [${B}/${app}] decoded JS: frost page=${(frost / 1024).toFixed(1)} KB, refraction page=${(refr / 1024).toFixed(1)} KB, delta=${(delta / 1024).toFixed(1)} KB`)
  rec(app, `frost-only page does not download the refraction engine (import from ${entry})`, delta > 30 * 1024, `delta=${(delta / 1024).toFixed(1)} KB`)
  if (!isChromium()) {
    const gated = await scriptBytes(browser, base, "/refract")
    rec(app, "non-Chromium: opt-in refraction never downloads the engine (capability gate)", gated - frost < 5 * 1024, `delta=${((gated - frost) / 1024).toFixed(1)} KB`)
  }
}

// Frost rendering: computed style AND measured pixels, with a negative control so the pixel check can fail.
async function frostRendering(browser, app, base) {
  const { ctx, page } = await newPage(browser)
  await page.goto(`${base}/`)
  await page.waitForTimeout(800)
  const cs = await hostBackdrop(page)
  rec(app, "frost: computed backdrop-filter applied (unprefixed or -webkit- alias)", blurry(cs.bf) || blurry(cs.wbf), `backdropFilter="${cs.bf}" webkitBackdropFilter="${cs.wbf}"`)
  const probe = await engineDrawsBackdropFilter(browser, B)
  const probeTxt = `bare-page probe: stripe amplitude ${probe.withFilter.toFixed(1)} with filter vs ${probe.without.toFixed(1)} without`
  if (isChromium()) rec(app, "engine probe: this browser draws backdrop-filter into screenshots (precondition for the pixel check)", probe.draws, probeTxt)
  if (!probe.draws) {
    skip(app, "frost: pixels behind the glass are actually blurred", `this ${B} build does not draw backdrop-filter in screenshots even on a bare page (${probeTxt}); a component pixel test would prove nothing here`)
    await ctx.close()
    return
  }
  await page.addStyleTag({ content: "button{visibility:hidden!important}" })
  const box = await page.locator('[data-testid="glass-0"]').boundingBox()
  const y = box.y + box.height / 2 - 10
  const inside = { x: box.x + box.width / 2 - 40, y, width: 80, height: 20 }
  const outside = { x: 100, y, width: 80, height: 20 }
  const aOut = await stripeAmplitude(page, outside)
  const aIn = await stripeAmplitude(page, inside)
  rec(app, "frost: pixels behind the glass are actually blurred (stripe amplitude inside < 50% of outside)", aIn < aOut * 0.5, `amplitude inside=${aIn.toFixed(1)} outside=${aOut.toFixed(1)} ratio=${(aIn / aOut).toFixed(2)}`)
  await page.addStyleTag({ content: "*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}" })
  await page.waitForTimeout(300)
  const aOff = await stripeAmplitude(page, inside)
  rec(app, "negative control: with backdrop-filter removed the stripes come back (ratio > 0.7)", aOff > aOut * 0.7, `amplitude inside(no filter)=${aOff.toFixed(1)} outside=${aOut.toFixed(1)} ratio=${(aOff / aOut).toFixed(2)}`)
  await ctx.close()
}

// White text over the glass, sampled where the button text sits, with the text itself hidden.
async function contrast(browser, app, base) {
  // kind: info = measured only; ok = must reach 4.5:1; low = negative control, must stay under 4.5:1 or the "ok" twin proves nothing.
  // The refraction rows are Chromium-only: it is the only engine where that path is reachable in production and draws the effect.
  const rows = [["", "info"], ["scrim", "ok"], ["bright", "low"], ["bright-scrim", "ok"], ["bright-force", "low"], ["bright-scrim-force", "ok"]]
  for (const [v, kind] of rows) {
    const refractionRow = v.endsWith("force")
    if (refractionRow && !isChromium()) {
      note(app, `contrast /${v} (refraction path, not reachable or drawn in ${B})`, "not asserted")
      continue
    }
    const { ctx, page } = await newPage(browser)
    await page.goto(`${base}/${v}`)
    await page.waitForTimeout(1000)
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
    const warps = await warpCount(page)
    console.log(`CONTRAST [${B}/${app}] /${v || "(root)"}: worst white-text ratio per preset (qst, manny, commerce) = ${worst.map((r) => r.toFixed(2)).join(", ")} (refraction elements=${warps})`)
    const path = refractionRow ? "refraction path" : "frost path"
    if (refractionRow && warps === 0) rec(app, `contrast: /${v} really rendered the refraction path`, false, "no .glass__warp, this would measure the frost path")
    else if (kind === "ok") rec(app, `contrast: /${v} (${path}, scrim 0.55) keeps white text >= 4.5:1`, min >= 4.5, `worst=${min.toFixed(2)}`)
    else if (kind === "low") rec(app, `negative control: /${v} (${path}, no scrim) is below 4.5:1, so the scrim test can fail`, min < 4.5, `worst=${min.toFixed(2)}`)
    else note(app, `contrast /${v || "(root)"} informational`, `worst=${min.toFixed(2)}`)
    await ctx.close()
  }
}

const focusInfo = (page) =>
  page.evaluate(() => {
    const e = document.activeElement
    const s = e ? getComputedStyle(e) : null
    return { tag: e?.tagName, text: (e?.textContent || "").trim(), outline: s ? `${s.outlineStyle} ${s.outlineWidth}` : "", ring: !!s && s.outlineStyle !== "none" && s.outlineWidth !== "0px" }
  })

async function a11y(browser, app, base) {
  for (const v of ["", "refract", "force"]) {
    const { ctx, page } = await newPage(browser)
    await page.goto(`${base}/${v}`)
    await page.waitForTimeout(800)
    await page.evaluate(axeSrc)
    const r = await page.evaluate(() => axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] }))
    const v2 = r.violations.map((x) => `${x.id}(${x.nodes.length})`)
    const cc = r.incomplete.filter((x) => x.id === "color-contrast").length
    rec(app, `axe /${v || "(root)"}: no WCAG A/AA or best-practice violations`, v2.length === 0, v2.join(", ") || `color-contrast flagged "needs review" on ${cc ? "some" : "no"} nodes (axe cannot compute contrast over backdrop-filter)`)

    const order = []
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Tab")
      order.push(await focusInfo(page))
    }
    const hostTab = await page.evaluate(() => [...document.querySelectorAll('[data-testid^="glass-"]')].map((h) => h.tabIndex))
    const want = ["Book now 1", "Book now 2", "Book now 3", "Back to top"]
    const orderOk = order.every((o, i) => o.text === want[i])
    rec(app, `keyboard /${v || "(root)"}: Tab order is button 1, 2, 3, then the link; glass hosts are not tab stops`, orderOk && hostTab.every((t) => t === -1), `order=${order.map((o) => `${o.tag}:${o.text}`).join(" > ")} hostTabIndex=${hostTab.join(",")}`)
    rec(app, `keyboard /${v || "(root)"}: every focused control shows a visible focus indicator`, order.every((o) => o.ring), order.map((o) => o.outline).join(" | "))
    await page.keyboard.press("Shift+Tab")
    const back = await focusInfo(page)
    rec(app, `keyboard /${v || "(root)"}: Shift+Tab walks back (no focus trap)`, back.text === "Book now 3", `focus=${back.tag}:${back.text}`)
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
  await until(s.page, () => document.querySelectorAll(".glass__warp").length === 0)
  const after = await warpCount(s.page)
  await s.page.emulateMedia({ reducedMotion: "no-preference" })
  await until(s.page, () => document.querySelectorAll(".glass__warp").length > 0)
  const back = await warpCount(s.page)
  rec(app, "reduced-motion: live toggle drops and restores refraction", before > 0 && after === 0 && back > 0, `before=${before} reduced=${after} restored=${back}`)
  // forced colors / contrast -> solid surface, then live restore
  const cases = [
    ["forced-colors", { forcedColors: "active" }, { forcedColors: "none" }, "(forced-colors: active)"],
    ["prefers-contrast: more", { contrast: "more" }, { contrast: "no-preference" }, "(prefers-contrast: more)"],
  ]
  for (const [label, on, off, probe] of cases) {
    try {
      // Count native "change" events so an engine that flips matchMedia without notifying is told apart from a component bug.
      await s.page.evaluate((q) => { window.__mq = 0; const m = matchMedia(q); window.__mqList = m; m.addEventListener("change", () => window.__mq++) }, probe)
      await s.page.emulateMedia(on)
      // Event delivery waits for a rendering update; a refraction page under software rendering can take well over 400ms.
      await until(s.page, () => window.__mq > 0)
      const applied = await s.page.evaluate((q) => matchMedia(q).matches, probe)
      const fired = await s.page.evaluate(() => window.__mq)
      if (!applied) {
        skip(app, `${label}: opaque surface (live)`, `${B} accepted the emulation call but matchMedia("${probe}") is false, so the state could not be reached`)
        continue
      }
      if (fired === 0) {
        skip(app, `${label}: opaque surface (live toggle)`, `${B} flipped matchMedia("${probe}") to true but dispatched 0 change events, so no page can react live under this emulation; covered by the at-load test instead`)
        await s.page.emulateMedia(off)
        await s.page.waitForTimeout(300)
        continue
      }
      await until(s.page, () => document.querySelectorAll(".glass__warp").length === 0)
      const { bf, wbf } = await hostBackdrop(s.page)
      const w = await warpCount(s.page)
      rec(app, `${label}: opaque surface, no backdrop blur, no refraction`, (bf === "none" || bf === "") && (wbf === "none" || wbf === "") && w === 0, `backdrop-filter=${bf || "-"} webkit=${wbf || "-"} warp=${w} changeEvents=${fired}`)
      await s.page.emulateMedia(off)
      await until(s.page, () => document.querySelectorAll(".glass__warp").length > 0)
      const w2 = await warpCount(s.page)
      rec(app, `${label}: live restore brings refraction back`, w2 > 0, `warp=${w2}`)
    } catch (e) {
      skip(app, `${label}: opaque surface`, `emulation API threw: ${String(e.message).split("\n")[0].slice(0, 90)}`)
    }
  }
  // reduced transparency: only Chromium exposes an emulation hook (CDP); the media feature itself is probed everywhere
  if (isChromium()) {
    try {
      const cdp = await s.ctx.newCDPSession(s.page)
      await cdp.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-reduced-transparency", value: "reduce" }] })
      const supported = await s.page.evaluate(() => matchMedia("(prefers-reduced-transparency: reduce)").matches)
      if (supported) await until(s.page, () => document.querySelectorAll(".glass__warp").length === 0)
      if (!supported) skip(app, "prefers-reduced-transparency", "this Chromium build does not expose the media feature")
      else {
        const { bf } = await hostBackdrop(s.page)
        rec(app, "prefers-reduced-transparency: opaque surface", bf === "none" && (await warpCount(s.page)) === 0, `backdrop-filter=${bf}`)
      }
    } catch (e) {
      skip(app, "prefers-reduced-transparency", String(e.message).slice(0, 60))
    }
  } else {
    const matches = await s.page.evaluate(() => matchMedia("(prefers-reduced-transparency: reduce)").matches)
    skip(app, "prefers-reduced-transparency: opaque surface", `Playwright has no emulation for this feature outside Chromium CDP; native value here is matches=${matches}`)
  }
  await s.ctx.close()
}

// State present before React mounts: no reliance on change events. SSR renders frost, the client must switch to solid after mount.
async function mediaAtLoad(browser, app, base) {
  for (const [label, ctxOpt, probe] of [
    ["forced-colors: active", { forcedColors: "active" }, "(forced-colors: active)"],
    ["prefers-contrast: more", { contrast: "more" }, "(prefers-contrast: more)"],
  ]) {
    let s
    try {
      s = await newPage(browser, { context: { viewport: { width: 1000, height: 800 }, ...ctxOpt } })
    } catch (e) {
      skip(app, `${label} at load: opaque surface`, `context option rejected: ${String(e.message).split("\n")[0].slice(0, 80)}`)
      continue
    }
    await s.page.goto(`${base}/force`)
    await s.page.waitForTimeout(1000)
    const applied = await s.page.evaluate((q) => matchMedia(q).matches, probe)
    if (!applied) skip(app, `${label} at load: opaque surface`, `${B} did not apply the context option (matchMedia false)`)
    else {
      const { bf, wbf } = await hostBackdrop(s.page)
      const w = await warpCount(s.page)
      const bad = s.logs.filter((l) => HYDRATION.test(l))
      rec(app, `${label} at load: solid surface, no blur, no refraction, no hydration error`, (bf === "none" || bf === "") && (wbf === "none" || wbf === "") && w === 0 && bad.length === 0, `backdrop-filter=${bf || "-"} warp=${w} hydrationErrors=${bad.length}`)
    }
    await s.ctx.close()
  }
}

function mobileProfiles() {
  const strip = (d) => { const o = { ...d }; delete o.defaultBrowserType; return o }
  const iphone = strip(pw.devices["iPhone 13"])
  const pixel = strip(pw.devices["Pixel 7"])
  if (isChromium()) return [["iPhone 13 profile (Chromium emulation, 4x CPU throttle)", iphone, 4], ["Pixel 7 profile (Chromium emulation, 4x CPU throttle)", pixel, 4]]
  if (B === "webkit") return [["iPhone 13 profile (WebKit engine emulation, NO throttle)", iphone, 1]]
  return [["390x664 touch viewport (Firefox, NO throttle; Firefox has no isMobile)", { viewport: { width: 390, height: 664 }, hasTouch: true, deviceScaleFactor: 3 }, 1]]
}

async function mobile(browser, app, base) {
  for (const [label, ctxOpts, rate] of mobileProfiles()) {
    // Which gate holds this back? Report both, so a pass is not credited to the wrong mechanism.
    {
      const { ctx, page } = await newPage(browser, { context: ctxOpts })
      await page.goto(`${base}/refract`)
      await page.waitForTimeout(1500)
      const warps = await warpCount(page)
      const g = await page.evaluate(() => ({ chromiumUA: /Chrome\/|Chromium\/|CriOS\//.test(navigator.userAgent) && !/Firefox\//.test(navigator.userAgent), fine: matchMedia("(hover: hover) and (pointer: fine)").matches, touch: navigator.maxTouchPoints }))
      const gate = !g.chromiumUA ? "UA gate (not a Chromium UA)" : !g.fine ? "pointer gate (coarse / no hover)" : "NONE"
      rec(app, `touch fallback [${label}]: opt-in refraction stays frost`, warps === 0, `warp=${warps}; chromiumUA=${g.chromiumUA} finePointer=${g.fine} maxTouchPoints=${g.touch}; held by ${gate}`)
      await ctx.close()
    }
    if (isChromium() && label.startsWith("Pixel")) {
      const { ctx, page } = await newPage(browser, { context: ctxOpts })
      await page.goto(`${base}/force`)
      await page.waitForTimeout(1500)
      const warps = await warpCount(page)
      rec(app, `touch fallback [${label}]: forceRefraction still upgrades, so the gate above is what holds it back`, warps > 0, `warp=${warps}`)
      await ctx.close()
    }
    // "no-blur" is the control: the same six cards with backdrop-filter removed, so the cost attributable to the blur is visible.
    for (const [v, control] of [["stress", false], ["stress", true], ["stress-refract", false]]) {
      const tag = control ? `${v} (control: backdrop-filter removed)` : v
      const { ctx, page } = await newPage(browser, { context: ctxOpts })
      if (rate > 1) {
        const cdp = await ctx.newCDPSession(page)
        await cdp.send("Emulation.setCPUThrottlingRate", { rate })
      }
      await page.goto(`${base}/${v}`)
      await page.waitForTimeout(1500)
      if (control) {
        await page.addStyleTag({ content: "*{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}" })
        await page.waitForTimeout(500)
      }
      const warps = await warpCount(page)
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
      const m = await page.evaluate(() => ({ cls: window.__cls, clsOk: window.__clsOk, long: window.__long.length, longOk: window.__longOk, longMax: Math.max(0, ...window.__long) }))
      const slow = frames.filter((x) => x > 33).length
      const clsTxt = m.clsOk ? m.cls.toFixed(4) : "n/a (engine lacks layout-shift API)"
      const longTxt = m.longOk ? `${m.long} (max ${m.longMax.toFixed(0)}ms)` : "n/a (engine lacks longtask API)"
      console.log(`PERF [${B}/${app}] /${tag} [${label}]: frames=${frames.length} p50=${pct(frames, 0.5).toFixed(1)}ms p95=${pct(frames, 0.95).toFixed(1)}ms >33ms=${slow} CLS=${clsTxt} longtasks=${longTxt} refractionElements=${warps}`)
      note(app, `perf /${tag} [${label}]`, `frames=${frames.length} p50=${pct(frames, 0.5).toFixed(1)} p95=${pct(frames, 0.95).toFixed(1)} slow=${slow} cls=${clsTxt} long=${longTxt} warp=${warps}`)
      // Frame times are MEASUREMENTS, not pass/fail: this VM rasterizes in software (SwiftShader / no GPU), so they cannot show
      // whether a phone GPU holds 60 fps. Only layout stability is environment-independent enough to assert.
      if (v === "stress" && !control && m.clsOk) rec(app, `mobile frost x6 [${label}]: CLS under 0.1`, m.cls < 0.1, `cls=${clsTxt}`)
      await ctx.close()
    }
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
      rec("-", `${name}: browser launches`, false, `${String(e.message).split("\n")[0]} (install with: npx playwright install ${name})`)
      continue
    }
    versions[name] = browser.version()
    console.log(`\n===== ${name} ${browser.version()} =====`)
    for (const [app, base] of Object.entries(APPS)) {
      await hydration(browser, app, base)
      await negativeControl(browser, app, base)
      await lazyLoad(browser, app, base)
      await frostRendering(browser, app, base)
      await contrast(browser, app, base)
      await a11y(browser, app, base)
      await media(browser, app, base)
      await mediaAtLoad(browser, app, base)
      await mobile(browser, app, base)
    }
    await browser.close()
  }
  console.log("\n===== summary =====")
  for (const name of WANT) {
    const r = results.filter((x) => x.browser === name && !x.info)
    const f = r.filter((x) => !x.pass).length
    const k = r.filter((x) => x.skipped).length
    console.log(`${name.padEnd(9)} ${versions[name] || "not launched"}: ${r.length - f - k} passed, ${f} failed, ${k} skipped (of ${r.length})`)
  }
  const skipped = results.filter((x) => x.skipped)
  if (skipped.length) console.log("\nSKIPPED (not verified):\n" + [...new Set(skipped.map((x) => `  [${x.browser}] ${x.test} :: ${x.detail}`))].join("\n"))
  const fail = results.filter((x) => !x.pass)
  fs.writeFileSync(__dirname + "/results.json", JSON.stringify({ versions, results }, null, 2))
  process.exit(fail.length ? 1 : 0)
})()
