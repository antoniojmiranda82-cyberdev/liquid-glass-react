// Native Node ESM (no bundler): the strictest consumer of the package "exports" map.
import { createElement } from "react"
import { renderToString } from "react-dom/server"
import LiquidGlass, { PremiumGlass as RootPremium, glassPresets } from "liquid-glass-react"
import { PremiumGlass } from "liquid-glass-react/premium"

const ok = (c, m) => { if (!c) { console.error("FAIL", m); process.exit(1) } console.log("PASS", m) }
ok(typeof LiquidGlass === "function" || typeof LiquidGlass === "object", "ESM root default export is the upstream LiquidGlass component")
ok(typeof RootPremium === "function", "ESM root also exports PremiumGlass")
ok(typeof PremiumGlass === "function", "ESM subpath liquid-glass-react/premium exports PremiumGlass")
ok(Object.keys(glassPresets).join() === "qst,manny,commerce", "presets qst, manny, commerce preserved")
const html = renderToString(createElement(PremiumGlass, { preset: "manny", width: 200, height: 60 }, "hi"))
ok(html.includes("hi") && html.includes("backdrop-filter") && !html.includes("glass__warp"), "ESM SSR renders frost by default")
const core = renderToString(createElement(LiquidGlass, null, "core"))
ok(core.includes("core"), "ESM SSR renders the upstream core component")
