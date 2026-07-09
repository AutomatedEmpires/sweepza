import { getWinnerSnapshot } from "@/lib/db/admin";

export const metadata = {
  title: "Admin Winners",
  description: "Winner post review snapshot.",
};

export const dynamic = "force-dynamic";

export default async function AdminWinnersPage() {
  const winners = await getWinnerSnapshot();

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

      <p className="mt-4 text-sm leading-relaxed text-graphite">
        A full winner post review workflow (approve / publish / reject) is coming
        next. This snapshot keeps the pending queue visible in the command
        center.
      </p>
    </section>
  );
}
