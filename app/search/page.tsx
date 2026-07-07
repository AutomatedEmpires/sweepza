import { redirect } from "next/navigation";

// Legacy route — search is a dimension of Discover, not a separate surface.
export default async function SearchPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string | string[] }>;
}) {
  const params = await searchParams;
  const q = typeof params?.q === "string" ? params.q.trim() : "";
  redirect(q ? `/discover?q=${encodeURIComponent(q)}` : "/discover");
}
