import Link from "next/link";
import { Icon, type IconName } from "@/components/icon";

// The host acquisition pitch — what a signed-out (or pre-configured
// environment) visitor sees at /host. This is the revenue-side front door, so
// it sells the platform honestly: what hosting is, how review works, and what
// seekers do with a listing. Canon copy rules apply — no invented traffic
// numbers, no fabricated social proof, no hardcoded pricing (billing lives in
// Stripe + the billing canon).
export function HostPitch({
  signInAvailable,
}: {
  signInAvailable: boolean;
}) {
  const valueProps: { icon: IconName; title: string; body: string }[] = [
    {
      icon: "repeat",
      title: "Built for repeat entries",
      body: "Sweepza remembers entry windows and invites seekers back when your daily or weekly sweep re-opens — your listing keeps working after the first visit.",
    },
    {
      icon: "verified",
      title: "A trust-first directory",
      body: "Every listing is reviewed before it goes live, carries source attribution, and links to your official entry page. Verified hosts get a visible badge.",
    },
    {
      icon: "chart",
      title: "See what resonates",
      body: "Host analytics show tracked seeker activity per listing — how many signed-in seekers viewed, saved, and entered — so you can see what resonates.",
    },
  ];

  const steps: { title: string; body: string }[] = [
    {
      title: "Create your host profile",
      body: "Create an account and the Sweepza team enables host access during onboarding. Your brand name, logo, and site appear on every listing you run.",
    },
    {
      title: "Submit a sweepstakes",
      body: "Prize, dates, entry cadence, eligibility, and your official entry link. No purchase necessary is required — pay-to-enter is never listed.",
    },
    {
      title: "Pass review, go live",
      body: "The Sweepza team reviews every submission. Approved listings appear in Discover and the category hubs.",
    },
    {
      title: "Seekers enter — and return",
      body: "Entries happen on your official page. Sweepza tracks re-entry windows and reminds seekers when your sweep is ready again.",
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <header className="px-1">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-ember">
          Host on Sweepza
        </p>
        <h1 className="mt-1.5 max-w-[18ch] font-display text-[36px] leading-[1.05] text-ink lg:text-[44px]">
          Put your sweepstakes in front of people who enter daily.
        </h1>
        <p className="mt-3 max-w-[56ch] text-[15px] leading-relaxed text-graphite">
          Sweepza is where sweepstakes seekers run their daily routine —
          discovering, entering, and re-entering free-to-enter giveaways. List
          yours, keep entries on your own official page, and let the routine
          bring people back.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {signInAvailable ? (
            <>
              <Link
                href="/sign-up?redirect_url=%2Fhost"
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-ember px-5 text-sm font-semibold text-on-accent transition hover:bg-ember/90"
              >
                Start hosting <Icon name="send" size={15} />
              </Link>
              <Link
                href="/sign-in?redirect_url=%2Fhost"
                className="inline-flex min-h-11 items-center rounded-xl border border-line px-5 text-sm font-semibold text-ink/75 transition hover:bg-ink/5"
              >
                Sign in
              </Link>
            </>
          ) : (
            <span className="inline-flex min-h-11 items-center rounded-xl border border-line bg-surface px-4 text-sm font-medium text-graphite">
              Host sign-up opens with account access in this environment
            </span>
          )}
          <span className="text-xs font-medium text-graphite">
            Free-to-enter sweepstakes only
          </span>
        </div>
      </header>

      <section aria-label="Why host on Sweepza" className="grid gap-3 sm:grid-cols-3">
        {valueProps.map((prop) => (
          <div
            key={prop.title}
            className="rounded-card border border-line bg-surface p-4 shadow-e1"
          >
            <span className="grid h-9 w-9 place-items-center rounded-full bg-ember/10 text-ember">
              <Icon name={prop.icon} size={17} />
            </span>
            <h2 className="mt-3 text-sm font-semibold text-ink">{prop.title}</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-graphite">
              {prop.body}
            </p>
          </div>
        ))}
      </section>

      <section
        aria-label="How hosting works"
        className="overflow-hidden rounded-sheet border border-line bg-surface shadow-e1"
      >
        <div className="border-b border-line px-5 py-4">
          <h2 className="font-display text-2xl text-ink">How hosting works</h2>
        </div>
        <ol className="grid sm:grid-cols-2">
          {steps.map((step, index) => (
            <li
              key={step.title}
              className="flex gap-3 border-t border-line p-5 first:border-t-0 sm:[&:nth-child(2)]:border-t-0 sm:[&:nth-child(odd)]:border-r"
            >
              <span className="nums grid h-8 w-8 shrink-0 place-items-center rounded-full bg-pine/10 font-display text-base text-pine">
                {index + 1}
              </span>
              <div>
                <h3 className="text-sm font-semibold text-ink">{step.title}</h3>
                <p className="mt-0.5 text-[13px] leading-relaxed text-graphite">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <p className="px-1 text-xs leading-relaxed text-graphite">
        Hosting is subscription-based with a capped number of active listings
        per plan; billing details are shown before checkout. Every listing must
        offer a free entry route, and the Sweepza team can hold or remove
        listings that break the rules. Questions first? Read the{" "}
        <Link href="/faq" className="font-medium text-ember underline">
          FAQ
        </Link>{" "}
        or{" "}
        <Link href="/about" className="font-medium text-ember underline">
          how Sweepza works
        </Link>
        .
      </p>
    </div>
  );
}
