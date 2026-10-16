import { type CSSProperties, type HTMLAttributes, type ReactNode, Suspense, lazy, useEffect, useState } from "react"
import type { LiquidGlassProps } from "./index"

// The refraction engine carries ~40 KB of displacement-map data. It is only fetched when a page
// opts in AND the browser can use it, so frost-only pages never download it.
const RefractionGlass = lazy(() => import("./index"))

/**
 * Brand-tuned recipes. Tints are deliberately low-alpha so the glass reads as glass, not a coloured card.
 * `solid` is the opaque fallback used when transparency is unwanted or unsupported (see PremiumGlass).
 */
// displacementScale stays <= ~20: verified in Chromium that >= 28 on wide (about 4:1) boxes shows a dark smeared rim.
export const glassPresets = {
  /** Quantum Shadow Technologies: premium institutional. Titanium edge, Signal-blue whisper, no neon. */
  qst: {
    glass: { displacementScale: 14, blurAmount: 0.07, saturation: 130, aberrationIntensity: 1.4, elasticity: 0.1, cornerRadius: 20 },
    fallback: { background: "linear-gradient(145deg, rgba(231,234,240,0.09), rgba(111,168,255,0.05))", border: "1px solid rgba(140,148,165,0.28)", blur: 18, saturate: 130, shadow: "0 18px 50px rgba(5,6,10,0.55), inset 0 1px 0 rgba(231,234,240,0.14)", solid: "#0D0F15" },
  },
  /** Manny's Pro Cuts: clipper-guard blue with a faint comb-red edge. Bolder, more playful. */
  manny: {
    glass: { displacementScale: 20, blurAmount: 0.08, saturation: 160, aberrationIntensity: 2.2, elasticity: 0.18, cornerRadius: 28 },
    fallback: { background: "linear-gradient(145deg, rgba(80,140,255,0.14), rgba(220,50,60,0.06))", border: "1px solid rgba(255,255,255,0.22)", blur: 16, saturate: 160, shadow: "0 14px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.22)", solid: "#101a33" },
  },
  /** Commerce (Asset Ave, Dream BLVD): neutral, product-first, minimal chroma shift. */
  commerce: {
    glass: { displacementScale: 10, blurAmount: 0.06, saturation: 120, aberrationIntensity: 1, elasticity: 0.08, cornerRadius: 16 },
    fallback: { background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)", blur: 20, saturate: 120, shadow: "0 10px 30px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.25)", solid: "#1b1b1f" },
  },
} as const

export type GlassPreset = keyof typeof glassPresets

/** SSR-safe media query: false on the server and on first client render, then live. */
function useMedia(query: string): boolean {
  const [match, setMatch] = useState(false)
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return
    const mq = window.matchMedia(query)
    const update = () => setMatch(mq.matches)
    update()
    mq.addEventListener?.("change", update)
    return () => mq.removeEventListener?.("change", update)
  }, [query])
  return match
}

/** Chromium desktop-class input. Safari/Firefox do not draw SVG displacement through backdrop-filter. */
function isChromiumFinePointer(): boolean {
  try {
    const ua = navigator.userAgent
    const chromium = /Chrome\/|Chromium\/|CriOS\//.test(ua) && !/Firefox\//.test(ua)
    return chromium && window.matchMedia("(hover: hover) and (pointer: fine)").matches
  } catch {
    return false
  }
}

function supportsBackdrop(): boolean {
  try {
    return CSS.supports("backdrop-filter", "blur(1px)") || CSS.supports("-webkit-backdrop-filter", "blur(1px)")
  } catch {
    return true
  }
}

export interface PremiumGlassProps
  extends Omit<LiquidGlassProps, "children" | "style" | "cornerRadius" | "onClick" | "className">,
    Omit<HTMLAttributes<HTMLDivElement>, "children" | "style" | "onClick" | "color"> {
  children: ReactNode
  preset?: GlassPreset
  /** The host box. Size it explicitly: the glass is centred inside it. */
  width: number | string
  height: number | string
  cornerRadius?: number
  /** Extra style for the host element. */
  style?: CSSProperties
  /**
   * Opt in to real SVG refraction. Default false: every browser gets the CSS frosted glass.
   * When true it only activates on Chromium with a fine pointer, and never when the user prefers
   * reduced motion, reduced transparency or more contrast. Everywhere else it silently stays frost.
   */
  refraction?: boolean
  /** Skip capability detection when refraction is on. For demos and tests only. */
  forceRefraction?: boolean
  /**
   * 0-1 dark layer under the content (frost and solid paths). Glass is translucent, so text contrast
   * depends on what is behind it; raise this over bright imagery. Default 0.
   */
  scrim?: number
}

/**
 * Production wrapper.
 * - Default: CSS frosted glass, identical on server and client (no hydration mismatch).
 * - `refraction`: upgrades to real refraction after mount on capable browsers.
 * - Falls back to an opaque surface when the user asks for reduced transparency, more contrast or
 *   forced colours, or when backdrop-filter is unsupported, so text stays readable.
 *
 * Interactive content must be a real <button>/<a> child. The host is a plain container and is
 * deliberately not clickable itself (no onClick), so keyboard and screen-reader semantics stay intact.
 * The "use client" directive comes from the bundle banner.
 */
export function PremiumGlass({
  preset = "qst",
  width,
  height,
  cornerRadius,
  style,
  refraction = false,
  forceRefraction = false,
  scrim = 0,
  children,
  padding,
  displacementScale,
  blurAmount,
  saturation,
  aberrationIntensity,
  elasticity,
  mouseContainer,
  globalMousePos,
  mouseOffset,
  overLight,
  mode,
  ...hostProps
}: PremiumGlassProps) {
  const reducedMotion = useMedia("(prefers-reduced-motion: reduce)")
  const reducedTransparency = useMedia("(prefers-reduced-transparency: reduce)")
  const moreContrast = useMedia("(prefers-contrast: more)")
  const forcedColors = useMedia("(forced-colors: active)")
  const [capable, setCapable] = useState(false)
  const [backdropOk, setBackdropOk] = useState(true)
  useEffect(() => {
    setCapable(refraction && (forceRefraction || isChromiumFinePointer()))
    setBackdropOk(supportsBackdrop())
  }, [refraction, forceRefraction])

  const p = glassPresets[preset]
  const f = p.fallback
  const radius = cornerRadius ?? p.glass.cornerRadius
  const solid = reducedTransparency || moreContrast || forcedColors || !backdropOk
  const host: CSSProperties = { position: "relative", width, height, ...style }

  const frostSurface: CSSProperties = {
    ...host,
    borderRadius: radius,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: padding ?? 0,
    boxSizing: "border-box",
    ...(solid
      ? forcedColors
        ? { background: "Canvas", color: "CanvasText", border: "1px solid CanvasText" }
        : { background: f.solid, border: f.border.replace(/rgba\([^)]*\)/, "rgba(255,255,255,0.45)"), boxShadow: f.shadow, color: "#fff" }
      : {
          background: scrim > 0 ? `linear-gradient(rgba(5,6,10,${scrim}),rgba(5,6,10,${scrim})), ${f.background}` : f.background,
          border: f.border,
          boxShadow: f.shadow,
          backdropFilter: `blur(${f.blur}px) saturate(${f.saturate}%)`,
          WebkitBackdropFilter: `blur(${f.blur}px) saturate(${f.saturate}%)`,
          color: "#fff",
        }),
  }
  const frost = (
    <div {...hostProps} style={frostSurface}>
      {children}
    </div>
  )

  if (capable && !solid && !reducedMotion) {
    return (
      <Suspense fallback={frost}>
        <div {...hostProps} style={host}>
          <RefractionGlass
            {...p.glass}
            {...(displacementScale !== undefined && { displacementScale })}
            {...(blurAmount !== undefined && { blurAmount })}
            {...(saturation !== undefined && { saturation })}
            {...(aberrationIntensity !== undefined && { aberrationIntensity })}
            {...(elasticity !== undefined && { elasticity })}
            {...(mouseContainer !== undefined && { mouseContainer })}
            {...(globalMousePos !== undefined && { globalMousePos })}
            {...(mouseOffset !== undefined && { mouseOffset })}
            {...(overLight !== undefined && { overLight })}
            {...(mode !== undefined && { mode })}
            cornerRadius={radius}
            padding="0"
            style={{ position: "absolute", top: "50%", left: "50%" }}
          >
            {/* The core sizes itself to its content, so the content carries the host dimensions. */}
            <div style={{ width, height, display: "flex", alignItems: "center", justifyContent: "center", padding, boxSizing: "border-box" }}>
              {children}
            </div>
          </RefractionGlass>
        </div>
      </Suspense>
    )
  }

  return frost
}
