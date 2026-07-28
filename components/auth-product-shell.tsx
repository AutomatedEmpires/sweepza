import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/icon";

export type AuthExperience = "sign-in" | "sign-up";

const AUTH_COPY: Record<
  AuthExperience,
  { eyebrow: string; title: string; description: string }
> = {
  "sign-in": {
    eyebrow: "Welcome back",
    title: "Pick up your sweep routine.",
    description:
      "Sign in to keep new saves and entry records with your Sweepza account.",
  },
  "sign-up": {
    eyebrow: "Free seeker account",
    title: "Keep your sweep routine with you.",
    description:
      "Create an account so new saves and entry records are available whenever you sign in.",
  },
};

const TRUST_POINTS: Array<{
  icon: IconName;
  title: string;
  body: string;
}> = [
  {
    icon: "externalLink",
    title: "You complete each entry",
    body: "Sweepza opens the destination shown on a listing; it does not enter a promotion for you.",
  },
  {
    icon: "rules",
    title: "Official rules set the terms",
    body: "Check the official rules for eligibility, deadlines, and entry requirements.",
  },
  {
    icon: "shield",
    title: "Your activity is a record",
    body: "Saved and entered labels reflect the status you choose in Sweepza.",
  },
];

export function AuthProductShell({
  experience,
  children,
}: {
  experience: AuthExperience;
  children: ReactNode;
}) {
  const copy = AUTH_COPY[experience];

  return (
    <section className="px-4 pb-14 pt-6 sm:px-6 sm:pt-10 lg:pb-20 lg:pt-14">
      <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(22rem,28rem)] lg:gap-x-16 lg:gap-y-10">
        <header className="max-w-xl lg:col-start-1 lg:row-start-1">
          <Link
            href="/discover"
            className="mb-7 inline-flex min-h-11 items-center gap-2 rounded-pill border border-line bg-surface px-4 text-sm font-semibold text-ink/75 shadow-e1 transition hover:border-pine/35 hover:text-ink"
          >
            <Icon name="discover" size={17} />
            Browse sweeps
          </Link>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-pine">
            {copy.eyebrow}
          </p>
          <h1 className="mt-3 max-w-[14ch] font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
            {copy.title}
          </h1>
          <p className="mt-4 max-w-[52ch] text-base leading-relaxed text-graphite sm:text-lg">
            {copy.description}
          </p>
        </header>

        <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
          <div className="mx-auto w-full max-w-md [&_.cl-cardBox]:w-full [&_.cl-rootBox]:w-full">
            {children}
          </div>
          <p className="mx-auto mt-4 max-w-md text-center text-xs leading-relaxed text-graphite">
            Sweepza is a discovery service, not the operator of most listed
            promotions.
          </p>
        </div>

        <div className="max-w-xl lg:col-start-1 lg:row-start-2">
          <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {TRUST_POINTS.map((point) => (
              <li
                key={point.title}
                className="flex gap-3 rounded-card border border-line bg-surface p-4 shadow-e1"
              >
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-pine/10 text-pine">
                  <Icon name={point.icon} size={17} />
                </span>
                <span>
                  <span className="block text-sm font-semibold text-ink">
                    {point.title}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-graphite">
                    {point.body}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          <aside className="mt-3 flex gap-3 rounded-card border border-ocean/25 bg-ocean/[0.06] p-4">
            <span className="mt-0.5 text-ocean">
              <Icon name="info" size={18} />
            </span>
            <p className="text-xs leading-relaxed text-graphite">
              <strong className="font-semibold text-ink">
                Signed-out activity stays in this browser.
              </strong>{" "}
              It is not imported automatically when you sign in or create an
              account.
            </p>
          </aside>
        </div>
      </div>
    </section>
  );
}

export function AuthUnavailable() {
  return (
    <div
      role="status"
      className="flex w-full flex-col items-center gap-4 rounded-card border border-line bg-surface px-6 py-10 text-center shadow-e2"
    >
      <span className="grid h-12 w-12 place-items-center rounded-full bg-ocean/10 text-ocean">
        <Icon name="profile" size={24} />
      </span>
      <div>
        <h2 className="font-display text-2xl font-semibold text-ink">
          Account access is unavailable
        </h2>
        <p className="mx-auto mt-2 max-w-[38ch] text-sm leading-relaxed text-graphite">
          Account access is not configured in this environment. You can keep
          browsing and record activity on this device.
        </p>
      </div>
      <Link
        href="/discover"
        className="inline-flex min-h-11 items-center justify-center rounded-xl bg-ember px-5 text-sm font-semibold text-on-accent transition hover:bg-ember/90"
      >
        Continue to discover
      </Link>
    </div>
  );
}
