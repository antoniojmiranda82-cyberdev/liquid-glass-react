"use client"

// Negative control for the hydration test: deliberately renders different text on server and client.
export function Mismatch() {
  return <p>{typeof window === "undefined" ? "server" : "client"}</p>
}
