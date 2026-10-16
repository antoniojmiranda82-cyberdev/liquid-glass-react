// Shared by verify.cjs, verify-dev.cjs and verify-smooth.cjs.
const pw = require("playwright")
const fs = require("fs")

const CHROMIUM_PATH = process.env.CHROMIUM_PATH || "/opt/pw-browsers/chromium"

// Headless Chromium's default software path does NOT rasterize backdrop-filter (plain filter:blur works, backdrop blur leaves a hard
// edge hard: measured 255 -> 28 across one pixel). On Linux these flags route it through SwiftShader so the blur is really drawn,
// which the pixel checks, the contrast samples and the frame-time numbers all depend on. Other platforms use their normal GPU path.
const CHROMIUM_ARGS = process.platform === "linux" ? ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--enable-gpu-rasterization"] : []

const launchers = {
  chromium: () => pw.chromium.launch({ args: CHROMIUM_ARGS, ...(fs.existsSync(CHROMIUM_PATH) ? { executablePath: CHROMIUM_PATH } : {}) }),
  firefox: () => pw.firefox.launch(),
  webkit: () => pw.webkit.launch(),
}

function createReporter() {
  const results = []
  let browser = "chromium"
  return {
    results,
    setBrowser: (b) => (browser = b),
    rec(app, test, pass, detail = "") {
      results.push({ browser, app, test, pass, detail })
      console.log(`${pass ? "PASS" : "FAIL"} [${browser}/${app}] ${test}${detail ? ` :: ${detail}` : ""}`)
    },
    skip(app, test, why) {
      results.push({ browser, app, test, pass: true, skipped: true, detail: why })
      console.log(`SKIP [${browser}/${app}] ${test} :: ${why}`)
    },
    note(app, test, detail) {
      results.push({ browser, app, test, pass: true, info: true, detail })
    },
  }
}

// Wait for a condition (up to 4s) instead of sleeping a fixed time; returns whether it became true.
const until = (page, fn, arg, ms = 4000) => page.waitForFunction(fn, arg, { timeout: ms }).then(() => true, () => false)

// Stripe amplitude of a screenshot clip: stripes are 2px lines every 40px, so a real blur flattens the column profile.
async function stripeAmplitude(page, clip) {
  const png = (await page.screenshot({ clip })).toString("base64")
  return page.evaluate(async (b64) => {
    const img = new Image()
    img.src = "data:image/png;base64," + b64
    await img.decode()
    const c = document.createElement("canvas")
    c.width = img.width
    c.height = img.height
    const x = c.getContext("2d")
    x.drawImage(img, 0, 0)
    const d = x.getImageData(0, 0, c.width, c.height).data
    const prof = new Array(c.width).fill(0)
    for (let r = 0; r < c.height; r++)
      for (let i = 0; i < c.width; i++) {
        const p = (r * c.width + i) * 4
        prof[i] += (0.2126 * d[p] + 0.7152 * d[p + 1] + 0.0722 * d[p + 2]) / c.height
      }
    return Math.max(...prof) - Math.min(...prof)
  }, png)
}

// Does THIS engine build draw backdrop-filter into screenshots at all? Bare page, no library code. Cached per browser name.
const probeCache = {}
async function engineDrawsBackdropFilter(browser, name) {
  if (probeCache[name]) return probeCache[name]
  const page = await browser.newPage({ viewport: { width: 600, height: 300 } })
  await page.setContent(`<body style="margin:0"><div style="position:absolute;inset:0;background:repeating-linear-gradient(90deg,rgba(255,255,255,.9) 0 2px,#101a33 2px 40px)"></div>
    <div id=g style="position:absolute;left:100px;top:60px;width:320px;height:120px;backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)"></div></body>`)
  await page.waitForTimeout(300)
  const clip = { x: 220, y: 100, width: 80, height: 20 }
  const withFilter = await stripeAmplitude(page, clip)
  await page.addStyleTag({ content: "#g{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}" })
  await page.waitForTimeout(200)
  const without = await stripeAmplitude(page, clip)
  await page.close()
  probeCache[name] = { draws: withFilter < without * 0.5, withFilter, without }
  return probeCache[name]
}

module.exports = { pw, fs, launchers, createReporter, until, stripeAmplitude, engineDrawsBackdropFilter }
