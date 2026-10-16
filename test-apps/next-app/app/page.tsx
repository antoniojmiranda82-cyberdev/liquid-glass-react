import { Demo } from "../demo"

// Server Component importing the package directly: proves the "use client" banner works.
export default function Page() {
  return <Demo variant="frost" />
}
