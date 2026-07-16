import Link from "next/link";
import { Icon } from "@/components/icon";

// The dead-listing landing. Every listing link eventually outlives its
// sweepstake — ends, is taken down after review, or was mistyped — and this
// surface turns that dead end into a route back into live inventory. Copy is
// honest by construction: without a row we cannot say WHICH of those
// happened, so it names the possibilities and points forward. The tip line
// states a real mechanism (seeker history keeps resolving once-public
// listings after they end — see getSeekerHistoryListingsByIds).
export function SweepsNotFound() {
  return (
    <section className="flex min-h-[70dvh] flex-col items-center justify-center px-6 py-16 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-full bg-pine/10 text-pine">
        <Icon name="clock" size={30} />
      </span>
      <h1 className="mt-5 font-display text-4xl text-ink">
        This sweepstakes isn&apos;t available
      </h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-graphite">
        It may have ended, been taken down, or the link may be off —
        sweepstakes come and go daily. The live feed is the place to catch
        what&apos;s open right now.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <Link
          href="/discover"
          className="inline-flex min-h-11 items-center justify-center rounded-xl bg-ember px-4 py-2.5 text-sm font-semibold text-on-accent transition hover:bg-ember/90"
        >
          Browse live sweeps
        </Link>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-line px-4 text-sm font-semibold text-ink/75 transition hover:bg-ink/5"
        >
          Home
        </Link>
      </div>
      <p className="mt-8 max-w-xs text-xs leading-relaxed text-graphite">
        Signed in, the sweeps you save or enter stay tracked in My Sweeps —
        even after they end.
      </p>
    </section>
  );
}
