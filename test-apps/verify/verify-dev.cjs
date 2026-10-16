// React DEVELOPMENT-mode behaviour. The production suite (verify.cjs) cannot see what React only reports in dev builds:
// invalid DOM props, un-minified hydration diffs, key warnings, StrictMode double effects.
//   next dev (React 19.3.1, port 3102) and Vite dev SSR (React 18.3.1, port 3104); both run StrictMode.
//   BROWSERS=chromium (default). Dev warnings come from React, not the engine, so one engine is enough here.
const { launchers, createReporter, until } = require("./lib.cjs")

const APPS = { "next-dev": "http://localhost:3102", "vite-dev": "http://localhost:3104" }
const WANT = (process.env.BROWSERS || "chromium").split(",").map((s) => s.trim()).filter(Boolean)
const { results, setBrowser, rec, skip, note } = createReporter()

// Things React reports in development for a library that misuses props, lists or effects.
const DEV_WARN = /does not recognize the|Invalid DOM property|unknown prop|Each child in a list|unique "key"|not wrapped in act|Can't perform a React state update|Cannot update a component|useLayoutEffect does nothing on the server|Warning:/i
const HYDRATION_DEV = /Hydration failed|didn't match|did not match|hydration mismatch|server rendered HTML/i
const warpCount = (page) => page.evaluate(() => document.querySelectorAll(".glass__warp").length)

async function load(browser, base, route, ms = 2500) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 800 } })
  const page = await ctx.newPage()
  const logs = []
  page.on("console", (m) => ["error", "warning"].includes(m.type()) && logs.push(`${m.type()}: ${m.text()}`))
  page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`))
  await page.goto(`${base}${route}`, { waitUntil: "load", timeout: 90000 })
  await page.waitForTimeout(ms)
  return { ctx, page, logs }
}

// Dev servers compile on first request and print HMR/connection chatter; only React-level problems and real errors count.
const benign = (l) => /Failed to load resource.*404|\[vite\] (connecting|connected)|favicon|Download the React DevTools|\[HMR\]|webpack-hmr|Fast Refresh/i.test(l)

async function routes(browser, app, base) {
  for (const route of ["/", "/refract", "/force", "/scrim", "/bright-scrim-force", "/stress"]) {
    const { ctx, page, logs } = await load(browser, base, route)
    const bad = logs.filter((l) => !benign(l))
    rec(app, `dev ${route}: no console errors or React dev warnings (StrictMode on)`, bad.length === 0, bad.map((l) => l.slice(0, 200)).join(" | ") || `${logs.length} benign message(s) ignored`)
    if (route === "/force" || route === "/bright-scrim-force") {
      const ok = await until(page, () => document.querySelectorAll(".glass__warp").length > 0, undefined, 8000)
      rec(app, `dev ${route}: refraction mounts under StrictMode (effects run twice)`, ok, `warp=${await warpCount(page)}`)
    }
    if (route === "/") rec(app, "dev /: frost stays frost (no refraction elements)", (await warpCount(page)) === 0)
    await ctx.close()
  }
}

// The dev-build hydration message is long and un-minified. Seeing it proves (a) this really is a development build and
// (b) our capture would notice a real mismatch. Without it, a clean run above would mean nothing.
async function devControl(browser, app, base) {
  const { ctx, page, logs } = await load(browser, base, "/mismatch")
  const seen = logs.some((l) => HYDRATION_DEV.test(l))
  rec(app, "dev negative control: /mismatch produces React's detailed (un-minified) hydration message", seen, seen ? logs.find((l) => HYDRATION_DEV.test(l)).slice(0, 140) : `NOT seen; logs=${logs.map((l) => l.slice(0, 80)).join(" | ")}`)
  await ctx.close()
}

;(async () => {
  const versions = {}
  for (const name of WANT) {
    setBrowser(name)
    let browser
    try {
      browser = await launchers[name]()
    } catch (e) {
      rec("-", `${name}: browser launches`, false, String(e.message).split("\n")[0])
      continue
    }
    versions[name] = browser.version()
    console.log(`\n===== dev mode / ${name} ${browser.version()} =====`)
    for (const [app, base] of Object.entries(APPS)) {
      try {
        await routes(browser, app, base)
        await devControl(browser, app, base)
      } catch (e) {
        rec(app, "dev server reachable", false, `${String(e.message).split("\n")[0].slice(0, 160)} (start it with test-apps/run-compat.sh)`)
      }
    }
    await browser.close()
  }
  const fail = results.filter((x) => !x.pass)
  console.log(`\n===== summary (dev mode) =====\n${results.length - fail.length}/${results.length} passed`)
  require("fs").writeFileSync(__dirname + "/results-dev.json", JSON.stringify({ versions, results }, null, 2))
  process.exit(fail.length ? 1 : 0)
})()
