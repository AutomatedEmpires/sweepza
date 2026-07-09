import { notFound } from "next/navigation";
import { VisualReviewBoard } from "@/components/visual-review-board";
import {
  buildFixtureListings,
  fixtureSeekerNotes,
} from "@/lib/fixtures/listings";
import type { SeekerListingActivity } from "@/lib/types/listing";

export const metadata = { title: "Visual review", robots: { index: false } };
export const dynamic = "force-dynamic";

// Deterministic design-system review surface. Available in local dev and Vercel
// Preview; blocked on real production (VERCEL_ENV === "production").
function isReviewAllowed(): boolean {
  if (process.env.VERCEL_ENV === "production") return false;
  return true;
}

export default function VisualReviewPage() {
  if (!isReviewAllowed()) notFound();

  const now = new Date();
  const listings = buildFixtureListings(now);
  const notes = fixtureSeekerNotes();

  const primary: Record<string, "won" | "entered" | "saved"> = {};
  const saved: Record<string, boolean> = {};
  const activity: Record<string, SeekerListingActivity> = {};
  const iso = (offsetMs: number) => new Date(now.getTime() + offsetMs).toISOString();

  for (const [id, note] of Object.entries(notes)) {
    if (note === "won") {
      primary[id] = "won";
      activity[id] = { enteredAt: iso(-20 * 86400000), wonAt: iso(-4 * 86400000) };
    } else if (note === "entered") {
      primary[id] = "entered";
      activity[id] = { enteredAt: iso(-2 * 86400000) };
    } else if (note === "saved") {
      primary[id] = "saved";
      saved[id] = true;
      activity[id] = { savedAt: iso(-3 * 86400000) };
    } else if (note === "again") {
      // A daily entry from yesterday → the re-entry window has re-opened.
      primary[id] = "entered";
      activity[id] = { enteredAt: iso(-1 * 86400000) };
    }
  }

  return (
    <div className="px-4 py-8 lg:mx-auto lg:max-w-6xl lg:px-8">
      <header className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ember">
          Design system · not production data
        </p>
        <h1 className="mt-1 font-display text-4xl text-ink">Visual review</h1>
        <p className="mt-2 max-w-prose text-sm text-graphite">
          Deterministic fixtures across every state, category, imagery quality,
          and title length — the honest canvas for judging the Sweepza system.
        </p>
      </header>
      <VisualReviewBoard listings={listings} snapshot={{ primary, saved, activity }} />
    </div>
  );
}
