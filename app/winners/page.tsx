import { WinnerCard } from "@/components/winner-card";
import Link from "next/link";
import { Icon } from "@/components/icon";
import { ensureCurrentAppUser, isClerkConfigured } from "@/lib/auth";
import { getPublishedWinnerPosts } from "@/lib/db/winners";
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
  const clerkConfigured = isClerkConfigured();
  // Authentication and the public moderated feed are independent reads. A
  // failed winner read intentionally reaches app/winners/error.tsx; presenting
  // a database failure as an empty community wall would be misleading.
  const [authUser, { posts }] = await Promise.all([
    ensureCurrentAppUser(),
    getPublishedWinnerPosts({ limit: 20 }),
  ]);

  return (
    <section className="px-4 pb-10 pt-7 sm:pt-9 lg:mx-auto lg:max-w-6xl lg:px-8">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-ember">
            Community stories
          </p>
          <h1 className="mt-1 font-display text-[32px] leading-none text-ink sm:text-[38px]">
            Winner Wall
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-graphite sm:text-base">
            Members share wins they attribute to Sweepza listings. Every visible
            story passed publication review, but remains member-reported unless
            its evidence badge says otherwise.
          </p>
        </div>
        {clerkConfigured ? (
          <Link
            href={authUser ? "/winners/new" : "/sign-in"}
            className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-1.5 rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-ember/90 sm:w-auto"
          >
            Share your win <Icon name="share" size={15} />
          </Link>
        ) : null}
      </header>

      <section
        aria-labelledby="winner-wall-trust"
        className="mt-6 overflow-hidden rounded-card border border-line bg-surface shadow-e1"
      >
        <h2 id="winner-wall-trust" className="sr-only">
          How Winner Wall trust labels work
        </h2>
        <div className="grid sm:grid-cols-3">
          {[
            {
              icon: "profile" as const,
              title: "Member-reported",
              body: "Stories describe a member’s own reported experience.",
            },
            {
              icon: "shield" as const,
              title: "Publication reviewed",
              body: "Sweepza moderates each story before it can appear publicly.",
            },
            {
              icon: "verified" as const,
              title: "Evidence badge",
              body: "Shown only when supporting evidence was reviewed.",
            },
          ].map((item, index) => (
            <div
              key={item.title}
              className={`flex gap-3 p-4 ${
                index > 0 ? "border-t border-line sm:border-l sm:border-t-0" : ""
              }`}
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink/5 text-ink/65">
                <Icon name={item.icon} size={17} />
              </span>
              <div>
                <h3 className="text-sm font-semibold text-ink">{item.title}</h3>
                <p className="mt-0.5 text-xs leading-relaxed text-graphite">
                  {item.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {posts.length > 0 ? (
        <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
          {posts.map((post) => (
            <WinnerCard
              key={post.id}
              post={post}
              isAuthenticated={Boolean(authUser)}
              clerkConfigured={clerkConfigured}
            />
          ))}
        </div>
      ) : (
        <div className="mt-10 flex flex-col items-center gap-3 rounded-card border border-line bg-surface px-6 py-14 text-center shadow-e1">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-gold/10 text-gold">
            <Icon name="trophy" size={26} />
          </div>
          <p className="font-display text-[20px] leading-none text-ink">
            No published winner stories yet
          </p>
          <p className="max-w-[40ch] text-sm leading-relaxed text-graphite">
            The moderated wall is currently empty. Share a win you attribute to
            a Sweepza listing and it can appear here after publication review.
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
