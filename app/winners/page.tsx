import { WinnerCard } from "@/components/winner-card";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";
import { getPublishedWinnerPosts } from "@/lib/db/winners";
import { withPublicFallback } from "@/lib/db/resilient";
import { APP_NAME } from "@/lib/site";

const WINNERS_DESCRIPTION =
  "Community-submitted prize wins reviewed by Sweepza before publication.";

export const metadata = {
  title: "Winners",
  description: WINNERS_DESCRIPTION,
  alternates: { canonical: "/winners" },
  openGraph: {
    title: "Winner Wall",
    description: WINNERS_DESCRIPTION,
    url: "/winners",
    type: "website",
    siteName: APP_NAME,
  },
};
export const dynamic = "force-dynamic";

export default async function WinnersPage() {
  const authUser = await ensureCurrentAppUser();
  const clerkConfigured = isClerkConfigured();
  // The wall's designed empty state ("no wins shared yet") doubles as the
  // degraded state when the data layer is unreachable.
  const { posts } = await withPublicFallback(
    getPublishedWinnerPosts({ limit: 20 }),
    { posts: [], nextCursor: null },
    "winner_wall",
  );

  return (
    <section className="px-4 pb-8 pt-8 lg:mx-auto lg:max-w-5xl lg:px-8">
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="font-display text-[26px] leading-none text-ink">
            Winner Wall
          </h1>
          <p className="text-sm text-graphite">
            Community-submitted wins reviewed by Sweepza before publication.
            A verified badge appears only when supporting evidence was checked.
          </p>
        </div>
        {clerkConfigured ? (
          <Link
            href={authUser ? "/winners/new" : "/sign-in"}
            className="min-h-11 inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-ember/90"
          >
            Share your win <Icon name="share" size={15} />
          </Link>
        ) : null}
      </header>

      {posts.length > 0 ? (
        <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {posts.map((post) => (
            <WinnerCard
              key={post.id}
              post={post}
              isAuthenticated={Boolean(authUser)}
            />
          ))}
        </div>
      ) : (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-14 text-center shadow-e1">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-gold/10 text-gold">
            <Icon name="trophy" size={26} />
          </div>
          <p className="font-display text-[20px] leading-none text-ink">
            Be the first winner
          </p>
          <p className="max-w-[40ch] text-sm leading-relaxed text-graphite">
            No wins posted yet — when you win a sweep you found here, share it
            with the community.
          </p>
          {clerkConfigured ? (
            <Link
              href={authUser ? "/winners/new" : "/sign-in"}
              className="min-h-11 mt-2 inline-flex items-center gap-1.5 rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-ember/90"
            >
              Share your win <Icon name="share" size={15} />
            </Link>
          ) : null}
        </div>
      )}
    </section>
  );
}
