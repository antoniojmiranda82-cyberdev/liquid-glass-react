// Minimal Vite SSR server: renders with Node's native ESM resolution (the strict case for package "exports").
import { createServer } from "node:http"
import { readFileSync, existsSync } from "node:fs"
import { extname, join } from "node:path"
import { render } from "./dist/server/entry-server.js"

const template = readFileSync("dist/client/index.html", "utf8")
const types = { ".js": "text/javascript", ".css": "text/css", ".map": "application/json" }

createServer((req, res) => {
  const url = req.url ?? "/"
  const file = join("dist/client", url.split("?")[0])
  if (url.startsWith("/assets/") && existsSync(file)) {
    res.setHeader("content-type", types[extname(file)] ?? "application/octet-stream")
    return res.end(readFileSync(file))
  }
  res.setHeader("content-type", "text/html")
  res.end(template.replace("<!--app-->", render(url)))
}).listen(3103, () => console.log("vite ssr on 3103"))
