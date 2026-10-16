// Dev-mode counterpart of server.mjs: Vite dev server in middleware mode, SSR through ssrLoadModule, React 18 DEVELOPMENT build.
// Used to see the warnings React only emits in development (invalid DOM props, hydration detail, StrictMode double effects).
import { createServer as createHttp } from "node:http"
import { readFileSync } from "node:fs"
import { createServer } from "vite"

const vite = await createServer({ server: { middlewareMode: true }, appType: "custom", logLevel: "warn" })

createHttp((req, res) => {
  vite.middlewares(req, res, async () => {
    try {
      const url = req.url ?? "/"
      const template = await vite.transformIndexHtml(url, readFileSync("index.html", "utf8"))
      const { render } = await vite.ssrLoadModule("/src/entry-server.tsx")
      res.setHeader("content-type", "text/html")
      res.end(template.replace("<!--app-->", render(url)))
    } catch (e) {
      vite.ssrFixStacktrace(e)
      res.statusCode = 500
      res.end(String(e.stack))
    }
  })
}).listen(3104, () => console.log("vite dev ssr on 3104"))
