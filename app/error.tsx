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
        <p className="mx-auto mt-2 max-w-[40ch] text-sm leading-relaxed text-ink/65">
          That didn&apos;t load the way it should. It&apos;s been reported —
          try again, or head back to Today.
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-moss px-5 py-2.5 text-sm font-semibold text-cream transition hover:bg-moss/90"
        >
          Try again
        </button>
        <Link
          href="/"
          className="rounded-full border border-sand px-5 py-2.5 text-sm font-semibold text-ink/70 transition hover:bg-ink/5"
        >
          Go to Today
        </Link>
      </div>
    </section>
  );
}
