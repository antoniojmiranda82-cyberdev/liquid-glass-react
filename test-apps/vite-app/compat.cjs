// Native Node CommonJS consumer.
const React = require("react")
const { renderToString } = require("react-dom/server")
const root = require("liquid-glass-react")
const premium = require("liquid-glass-react/premium")

const ok = (c, m) => { if (!c) { console.error("FAIL", m); process.exit(1) } console.log("PASS", m) }
ok(typeof root.default !== "undefined", "CJS root exposes default (LiquidGlass)")
ok(typeof root.PremiumGlass === "function", "CJS root exposes PremiumGlass")
ok(typeof premium.PremiumGlass === "function", "CJS subpath premium exposes PremiumGlass")
const html = renderToString(React.createElement(premium.PremiumGlass, { preset: "commerce", width: 200, height: 60 }, "hi"))
ok(html.includes("hi") && html.includes("backdrop-filter"), "CJS SSR renders frost by default")
