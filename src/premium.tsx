import { type CSSProperties, type ReactNode, useEffect, useState } from "react"
import LiquidGlass, { type LiquidGlassProps } from "./index"

/** Brand-tuned recipes. Tints are deliberately low-alpha so the glass reads as glass, not a coloured card. */
// displacementScale stays <= ~20: verified in Chromium that >= 28 on wide (about 4:1) boxes shows a dark smeared rim.
export const glassPresets = {
  /** Quantum Shadow Technologies: premium institutional. Titanium edge, Signal-blue whisper, no neon. */
  qst: {
    glass: { displacementScale: 14, blurAmount: 0.07, saturation: 130, aberrationIntensity: 1.4, elasticity: 0.1, cornerRadius: 20 },
    fallback: { background: "linear-gradient(145deg, rgba(231,234,240,0.09), rgba(111,168,255,0.05))", border: "1px solid rgba(140,148,165,0.28)", blur: 18, saturate: 130, shadow: "0 18px 50px rgba(5,6,10,0.55), inset 0 1px 0 rgba(231,234,240,0.14)" },
  },
  /** Manny's Pro Cuts: clipper-guard blue with a faint comb-red edge. Bolder, more playful. */
  manny: {
    glass: { displacementScale: 20, blurAmount: 0.08, saturation: 160, aberrationIntensity: 2.2, elasticity: 0.18, cornerRadius: 28 },
    fallback: { background: "linear-gradient(145deg, rgba(80,140,255,0.14), rgba(220,50,60,0.06))", border: "1px solid rgba(255,255,255,0.22)", blur: 16, saturate: 160, shadow: "0 14px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.22)" },
  },
  /** Commerce (Asset Ave, Dream BLVD): neutral, product-first, minimal chroma shift. */
  commerce: {
    glass: { displacementScale: 10, blurAmount: 0.06, saturation: 120, aberrationIntensity: 1, elasticity: 0.08, cornerRadius: 16 },
    fallback: { background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", blur: 20, saturate: 120, shadow: "0 10px 30px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.25)" },
  },
} as const

export type GlassPreset = keyof typeof glassPresets

/**
 * True only where real SVG refraction renders well: Chromium, fine pointer + hover
 * (no touch), user hasn't asked for reduced transparency/motion.
 * Safari and Firefox lack displacement-through-backdrop support, so they get the CSS fallback.
 */
function canRefract(): boolean {
  try {
    if (typeof window === "undefined") return false
    const ua = navigator.userAgent
    const chromium = /Chrome\/|Chromium\/|CriOS\//.test(ua) && !/Firefox\//.test(ua)
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches
    const reduced =
      window.matchMedia("(prefers-reduced-transparency: reduce)").matches ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    return chromium && fine && !reduced
  } catch {
    return false
  }
}

export interface PremiumGlassProps extends Omit<LiquidGlassProps, "children" | "style" | "cornerRadius"> {
  children: ReactNode
  preset?: GlassPreset
  /** The host box. Size it explicitly: the glass is centred inside it. */
  width: number | string
  height: number | string
  cornerRadius?: number
  /** Extra style for the host element. */
  style?: CSSProperties
  /** Force a path: "refract" (real SVG displacement) or "frost" (CSS only). Default "auto". */
  force?: "auto" | "refract" | "frost"
}

/**
 * Production wrapper. First render (server and hydration) is always the CSS frost so markup matches;
 * after mount it upgrades to real refraction on capable browsers. The "use client" directive comes from the bundle banner.
 */
export function PremiumGlass({ preset = "qst", width, height, cornerRadius, style, force = "auto", children, padding, ...rest }: PremiumGlassProps) {
  const [refract, setRefract] = useState(false)
  useEffect(() => {
    setRefract(force === "refract" ? true : force === "frost" ? false : canRefract())
  }, [force])

  const p = glassPresets[preset]
  const radius = cornerRadius ?? p.glass.cornerRadius
  const host: CSSProperties = { position: "relative", width, height, ...style }

  if (refract) {
    return (
      <div style={host}>
        <LiquidGlass
          {...p.glass}
          {...rest}
          cornerRadius={radius}
          padding="0"
          style={{ position: "absolute", top: "50%", left: "50%" }}
        >
          {/* The core sizes itself to its content, so the content carries the host dimensions. */}
          <div style={{ width, height, display: "flex", alignItems: "center", justifyContent: "center", padding, boxSizing: "border-box" }}>
            {children}
          </div>
        </LiquidGlass>
      </div>
    )
  }

  const f = p.fallback
  return (
    <div
      style={{
        ...host,
        borderRadius: radius,
        background: f.background,
        border: f.border,
        boxShadow: f.shadow,
        backdropFilter: `blur(${f.blur}px) saturate(${f.saturate}%)`,
        WebkitBackdropFilter: `blur(${f.blur}px) saturate(${f.saturate}%)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: padding ?? 0,
        boxSizing: "border-box",
        color: "#fff",
      }}
    >
      {children}
    </div>
  )
}

export { LiquidGlass }
export type { LiquidGlassProps }
