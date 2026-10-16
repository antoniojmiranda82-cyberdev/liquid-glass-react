import { defineConfig } from "tsdown"

export default defineConfig({
  entry: { index: "src/entry.ts", premium: "src/premium-entry.ts" },
  format: ["esm", "cjs"],
  platform: "neutral",
  target: "es2020",
  dts: true,
  clean: true,
  sourcemap: true,
  deps: { neverBundle: ["react", "react-dom", "react/jsx-runtime"] },
  outputOptions: { exports: "named" },
  // Next.js App Router: lets Server Components import this package directly.
  banner: '"use client";',
})
