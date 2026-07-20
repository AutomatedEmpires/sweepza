import { notFound } from "next/navigation";
import { SweepsNotFound } from "@/components/sweeps-not-found";

export const metadata = {
  title: "Visual review · Sweeps not-found",
  robots: { index: false },
};
export const dynamic = "force-dynamic";

// Preview of the dead-listing landing (app/sweeps/[slug]/not-found.tsx) —
// reachable deterministically here because triggering the real one needs a
// slug lookup against the database. Gated off real production like the other
// review surfaces.
export default function VisualReviewNotFoundPage() {
  if (process.env.VERCEL_ENV === "production") notFound();

  return <SweepsNotFound />;
}
