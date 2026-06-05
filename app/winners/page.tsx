import { WinnerCard } from "@/components/winner-card";
import { getPublishedWinnerWall } from "@/lib/db/winners";

export const metadata = {
  title: "Winners",
  description: "Real Sweepza members sharing the prizes they've won.",
};
export const dynamic = "force-dynamic";

export default async function WinnersPage() {
  const items = await getPublishedWinnerWall();

  return (
    <section className="px-4 pb-8 pt-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-ink">Winner Wall</h1>
        <p className="text-sm text-ink/60">
          Real members, real wins. Every post is a sweep someone found and entered right here.
        </p>
      </header>

      {items.length > 0 ? (
        <div className="mt-6 space-y-5">
          {items.map(({ post, listing }) => (
            <WinnerCard
              key={post.id}
              post={post}
              listing={listing}
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
