import { PremiumGlass, type GlassPreset } from "liquid-glass-react"

const bg = "linear-gradient(120deg,#05060A,#232834 40%,#6FA8FF 70%,#B79C62)"
const stripes = "repeating-linear-gradient(90deg,rgba(255,255,255,.35) 0 2px,transparent 2px 40px)"

export type Variant = "frost" | "refract" | "force" | "stress" | "stress-refract" | "scrim" | "mismatch"

const presets: GlassPreset[] = ["qst", "manny", "commerce"]

export function Demo({ variant }: { variant: Variant }) {
  const refraction = variant === "refract" || variant === "force" || variant === "stress-refract"
  const forceRefraction = variant === "force" || variant === "stress-refract"
  const count = variant.startsWith("stress") ? 6 : 3
  return (
    <main style={{ position: "relative", minHeight: "200vh", background: bg, fontFamily: "system-ui, sans-serif", overflow: "hidden" }}>
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, backgroundImage: stripes }} />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: 48, paddingTop: 80 }}>
        <h1 style={{ color: "#fff", margin: 0, fontSize: 28 }}>Glass test: {variant}</h1>
        {/* Negative control for the hydration test: deliberately renders different text on server and client. */}
        {variant === "mismatch" && <p style={{ color: "#fff", margin: 0 }}>{typeof window === "undefined" ? "server" : "client"}</p>}
        {Array.from({ length: count }, (_, i) => (
          <PremiumGlass
            key={i}
            preset={presets[i % presets.length]}
            width={320}
            height={88}
            refraction={refraction}
            forceRefraction={forceRefraction}
            scrim={variant === "scrim" ? 0.55 : 0}
            data-testid={`glass-${i}`}
            aria-label={`Glass card ${i + 1}`}
            role="group"
          >
            <button type="button" style={{ font: "600 16px system-ui", color: "#fff", background: "transparent", border: "1px solid rgba(255,255,255,.5)", borderRadius: 999, padding: "10px 20px", cursor: "pointer" }}>
              Book now {i + 1}
            </button>
          </PremiumGlass>
        ))}
        <a href="#top" style={{ color: "#fff", font: "500 16px system-ui", textDecoration: "underline" }}>Back to top</a>
      </div>
    </main>
  )
}
