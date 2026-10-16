import { StrictMode } from "react"
import { hydrateRoot } from "react-dom/client"
import { Demo, type Variant } from "./demo"

const variant = (location.pathname.replace(/^\//, "") || "frost") as Variant
// StrictMode: in development React mounts, unmounts and re-mounts every effect once; it is inert in the production build.
hydrateRoot(
  document.getElementById("root")!,
  <StrictMode>
    <Demo variant={variant} />
  </StrictMode>,
)
