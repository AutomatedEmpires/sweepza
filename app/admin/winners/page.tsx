import { getWinnerSnapshot } from "@/lib/db/admin";
import { AdminWinnerQueue } from "@/components/admin-winner-queue";
import { listPendingWinnerPostsForModeration } from "@/lib/db/winners";

export const metadata = {
  title: "Admin Winners",
  description: "Winner post review snapshot.",
};

export const dynamic = "force-dynamic";

export default async function AdminWinnersPage() {
  const [winners, pendingPosts] = await Promise.all([
    getWinnerSnapshot(),
    listPendingWinnerPostsForModeration(),
  ]);

  return (
    <section className="px-5 pb-10 pt-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ember">
          Admin
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold text-ink">
          Winners
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-graphite">
          Winner wall submissions awaiting an editorial decision.
        </p>
      </header>

      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-card border border-line bg-surface p-5 shadow-e1">
          <p className="font-display nums text-3xl font-bold text-ember">
            {winners.pending_winner_posts}
          </p>
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-graphite">
            Pending review
          </p>
        </div>
        <div className="rounded-card border border-line bg-surface p-5 shadow-e1">
          <p className="font-display nums text-3xl font-bold text-ink">
            {winners.published_winner_posts}
          </p>
          <p className="mt-1 text-xs font-medium uppercase tracking-wide text-graphite">
            Published
          </p>
        </div>
      </div>

      <AdminWinnerQueue items={pendingPosts} />
    </section>
  );
}
