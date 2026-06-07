import { WinnerCard } from "@/components/winner-card";
import { getPublishedWinnerPosts } from "@/lib/db/winners";
import { getPublicListings } from "@/lib/db/listings";

export const metadata = {
  title: "Winners",
  description: "Real Sweepza members sharing the prizes they've won.",
};

export default async function WinnersPage() {
  const [{ posts }] = await Promise.all([
    getPublishedWinnerPosts({ limit: 20 }),
  ]);

  // WinnerCard expects a Listing. Fetch the attached listings via existing DB layer.
  // (Small N+1 avoided by the adapter above, but this keeps changes minimal).
  const listings = await getPublicListings({ limit: 50 });
  const listingsBySlug = new Map(listings.map((l) => [l.slug, l]));

  return (
    <section className="px-4 pb-8 pt-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-ink">Winner Wall</h1>
        <p className="text-sm text-ink/60">
          Real members, real wins. Every post is a sweep someone found and entered right here.
        </p>
      </header>

      {posts.length > 0 ? (
        <div className="mt-6 space-y-5">
          {posts.map((post) => (
            <WinnerCard
              key={post.id}
              post={post}
              listing={listingsBySlug.get(post.listingSlug)}
            />
          ))}
        </div>
      ) : (
        <div className="mt-10 rounded-card border border-dashed border-sand p-8 text-center">
          <p className="text-sm font-medium text-ink">No wins posted yet</p>
          <p className="mt-1 text-sm text-ink/55">
            Be the first — when you win a sweep you found here, share it with the community.
          </p>
        </div>
      )}
    </section>
  );
}
