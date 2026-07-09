import { getPendingClaimsCount } from "@/lib/db/admin";

export const metadata = {
  title: "Admin Claims",
  description: "Listing claim requests awaiting admin review.",
};

export const dynamic = "force-dynamic";

export default async function AdminClaimsPage() {
  const pending = await getPendingClaimsCount();

  return (
    <section className="px-5 pb-10 pt-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ember">
          Admin
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold text-ink">
          Claims
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-graphite">
          Hosts requesting ownership of owner-seeded listings.
        </p>
      </header>

      <div className="mt-6 rounded-card border border-line bg-surface p-5 shadow-e1">
        <p
          className={`font-display nums text-3xl font-bold ${pending > 0 ? "text-ember" : "text-ink"}`}
        >
          {pending}
        </p>
        <p className="mt-1 text-xs font-medium uppercase tracking-wide text-graphite">
          Claims awaiting review
        </p>
        <p className="mt-3 text-sm leading-relaxed text-graphite">
          A full claim approval workflow is coming next. For now this surfaces
          the count of pending listing claims so it is visible alongside the
          rest of the command center.
        </p>
      </div>
    </section>
  );
}
