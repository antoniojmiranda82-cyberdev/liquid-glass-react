import { StrictMode, useEffect, useRef } from "react"
import { createRoot } from "react-dom/client"
import Lenis from "lenis"
import { gsap } from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"
import { PremiumGlass, type GlassPreset } from "liquid-glass-react"

gsap.registerPlugin(ScrollTrigger)

// ?mode=frost|force   which glass path to render (force = refraction, gate bypassed)
// ?fade=host|parent|none   which element GSAP fades/translates: the glass host itself, or a wrapper around it
// ?lenis=1|0           smooth scroll on/off (0 = control: native scrolling)
const q = new URLSearchParams(location.search)
const mode = q.get("mode") ?? "frost"
const fade = q.get("fade") ?? "host"
const useLenis = q.get("lenis") !== "0"
// ?glass=0 renders the same page with no glass at all: the baseline for what Lenis/GSAP themselves leave registered.
const cards = q.get("glass") === "0" ? 0 : 6

const bg = "linear-gradient(120deg,#05060A,#232834 40%,#6FA8FF 70%,#B79C62)"
const stripes = "repeating-linear-gradient(90deg,rgba(255,255,255,.35) 0 2px,transparent 2px 40px)"
const presets: GlassPreset[] = ["qst", "manny", "commerce"]
const w = window as unknown as Record<string, unknown>

function App() {
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const lenis = useLenis ? new Lenis({ lerp: 0.1, autoRaf: false }) : null
    const tick = (t: number) => lenis?.raf(t * 1000)
    if (lenis) {
      lenis.on("scroll", ScrollTrigger.update)
      gsap.ticker.add(tick)
      gsap.ticker.lagSmoothing(0)
    }
    const ctx = gsap.context(() => {
      if (fade === "none") return
      gsap.utils.toArray<HTMLElement>("[data-fade]").forEach((el) => {
        gsap.fromTo(el, { y: 60, opacity: 0.2 }, { y: 0, opacity: 1, ease: "none", scrollTrigger: { trigger: el, start: "top 95%", end: "top 55%", scrub: true } })
      })
    }, root)
    w.__lenis = lenis
    w.__ready = true
    return () => {
      ctx.revert()
      if (lenis) {
        gsap.ticker.remove(tick)
        lenis.destroy()
      }
      ScrollTrigger.getAll().forEach((s) => s.kill())
      w.__ready = false
    }
  }, [])

  return (
    <main ref={root} style={{ position: "relative", minHeight: "420vh", background: bg, fontFamily: "system-ui, sans-serif" }}>
      <div aria-hidden="true" style={{ position: "absolute", inset: 0, backgroundImage: stripes }} />
      <div style={{ position: "relative", display: "flex", flexDirection: "column", alignItems: "center", gap: "55vh", paddingTop: "30vh" }}>
        {Array.from({ length: cards }, (_, i) => {
          const glass = (
            <PremiumGlass
              preset={presets[i % presets.length]}
              width={320}
              height={88}
              refraction={mode === "force"}
              forceRefraction={mode === "force"}
              data-testid={`glass-${i}`}
              {...(fade === "host" ? { "data-fade": "" } : {})}
            >
              <button type="button" style={{ font: "600 16px system-ui", color: "#fff", background: "transparent", border: "1px solid rgba(255,255,255,.5)", borderRadius: 999, padding: "10px 20px" }}>
                Book now {i + 1}
              </button>
            </PremiumGlass>
          )
          return fade === "parent" ? (
            <div key={i} data-testid={`wrap-${i}`} data-fade="">
              {glass}
            </div>
          ) : (
            <div key={i}>{glass}</div>
          )
        })}
      </div>
    </main>
  )
}

const rootEl = createRoot(document.getElementById("root")!)
w.__unmount = () => rootEl.unmount()
rootEl.render(
  <StrictMode>
    <App />
  </StrictMode>,
)
