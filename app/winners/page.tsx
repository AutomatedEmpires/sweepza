import { WinnerCard } from "@/components/winner-card";
import Link from "next/link";
import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";
import { getPublishedWinnerPosts } from "@/lib/db/winners";

export const metadata = {
  title: "Winners",
  description: "Real Sweepza members sharing the prizes they've won.",
};
export const dynamic = "force-dynamic";

export default async function WinnersPage() {
  const authUser = await ensureCurrentAppUser();
  const clerkConfigured = isClerkConfigured();
  const { posts } = await getPublishedWinnerPosts({ limit: 20 });

  return (
    <section className="px-4 pb-8 pt-8">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-ink">Winner Wall</h1>
          <p className="text-sm text-ink/60">
            Real members, real wins. Every post is a sweep someone found and entered right here.
          </p>
        </div>
        {clerkConfigured ? (
          <Link
            href={authUser ? "/winners/new" : "/sign-in"}
            className="inline-flex shrink-0 rounded-full bg-moss px-4 py-2 text-sm font-semibold text-cream transition hover:bg-moss/90"
          >
            Share your win
          </Link>
        ) : null}
      </header>

      {posts.length > 0 ? (
        <div className="mt-6 space-y-5">
          {posts.map((post) => (
            <WinnerCard key={post.id} post={post} />
          ))}
        </div>
      ) : (
        <div className="mt-10 rounded-card border border-dashed border-sand p-8 text-center">
          <p className="text-sm font-medium text-ink">No wins posted yet</p>
          <p className="mt-1 text-sm text-ink/55">
            Be the first — when you win a sweep you found here, share it with the community.
          </p>
          {clerkConfigured ? (
            <div className="mt-4">
              <Link
                href={authUser ? "/winners/new" : "/sign-in"}
                className="inline-flex rounded-full bg-moss px-4 py-2 text-sm font-semibold text-cream transition hover:bg-moss/90"
              >
                Share your win
              </Link>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
