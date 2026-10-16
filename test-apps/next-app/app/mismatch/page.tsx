import { Mismatch } from "./client"

export const dynamic = "force-dynamic"

export default function Page() {
  return (
    <main>
      <h1>Hydration negative control</h1>
      <Mismatch />
    </main>
  )
}
