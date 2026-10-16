import { hydrateRoot } from "react-dom/client"
import { Demo, type Variant } from "./demo"

const variant = (location.pathname.replace(/^\//, "") || "frost") as Variant
hydrateRoot(document.getElementById("root")!, <Demo variant={variant} />)
