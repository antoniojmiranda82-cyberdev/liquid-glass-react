import { Demo, type Variant } from "../../demo"

export const dynamic = "force-dynamic"

export default async function Page({ params }: { params: Promise<{ variant: string }> }) {
  const { variant } = await params
  return <Demo variant={variant as Variant} />
}
