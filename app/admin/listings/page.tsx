import Link from "next/link";
import { AdminListingImportForm } from "@/components/admin-listing-import-form";
import { AdminReviewQueue } from "@/components/admin-review-queue";
import { getActiveCategories, getActiveTags } from "@/lib/db/dictionaries";
import { getHostReviewQueue } from "@/lib/db/listing-review";

export const metadata = {
  title: "Admin Listings",
  description: "Import new listings and review host submissions in one place.",
};

export const dynamic = "force-dynamic";

type Tab = "import" | "review";

function parseTab(value: string | undefined): Tab {
  return value === "review" ? "review" : "import";
}

const TABS: { id: Tab; label: string }[] = [
  { id: "import", label: "Import" },
  { id: "review", label: "Review Queue" },
];

export default async function AdminListingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const active = parseTab(tab);

  return (
    <section className="px-5 pb-10 pt-8">
      <header>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ember">
          Admin
        </p>
        <h1 className="mt-1 text-2xl font-bold text-ink">Listings</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink/65">
          Manually import canonical listings or work the host submission review
          queue.
        </p>
      </header>

      <div className="mt-4 flex flex-wrap gap-2">
        {TABS.map((item) => {
          const isActive = item.id === active;
          return (
            <Link
              key={item.id}
              href={`/admin/listings?tab=${item.id}`}
              className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                isActive
                  ? "bg-ink text-cream"
                  : "border border-sand text-ink/70 hover:bg-ink/5"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="mt-5">
        {active === "review" ? (
          <AdminReviewQueue listings={await getHostReviewQueue()} />
        ) : (
          <ImportTab />
        )}
      </div>
    </section>
  );
}

async function ImportTab() {
  const [categories, tags] = await Promise.all([
    getActiveCategories(),
    getActiveTags(),
  ]);
  return <AdminListingImportForm categories={categories} tags={tags} />;
}
