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
        <h1 className="mt-1 text-2xl font-bold text-ink">Claims</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink/65">
          Hosts requesting ownership of owner-seeded listings.
        </p>
      </header>

      <div className="mt-6 rounded-card border border-sand bg-white/80 p-5">
        <p className="text-3xl font-bold text-ink">{pending}</p>
        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-ink/55">
          Claims awaiting review
        </p>
        <p className="mt-3 text-sm leading-relaxed text-ink/65">
          A full claim approval workflow is coming next. For now this surfaces
          the count of pending listing claims so it is visible alongside the
          rest of the command center.
        </p>
      </div>
    </section>
  );
}
