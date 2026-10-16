import { renderToString } from "react-dom/server"
import { Demo, type Variant } from "./demo"

export function render(url: string) {
  const variant = (url.replace(/^\//, "").split("?")[0] || "frost") as Variant
  return renderToString(<Demo variant={variant} />)
}
