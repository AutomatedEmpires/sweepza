"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { Icon } from "@/components/icon";

export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <section className="flex flex-col items-center gap-4 px-6 pb-16 pt-20 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-full bg-ember/10 text-ember">
        <Icon name="flag" size={26} />
      </span>
      <div>
        <h1 className="font-display text-3xl text-ink">Something snagged</h1>
        <p className="mx-auto mt-2 max-w-[40ch] text-sm leading-relaxed text-graphite">
          That didn&apos;t load the way it should. It&apos;s been reported —
          try again, or head back to Today.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="min-h-11 rounded-xl bg-ember px-5 text-sm font-semibold text-on-accent transition hover:bg-ember/90"
        >
          Try again
        </button>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center rounded-xl border border-line px-5 text-sm font-semibold text-ink/75 transition hover:bg-ink/5"
        >
          Go to Today
        </Link>
      </div>
    </section>
  );
}
