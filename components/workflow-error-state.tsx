"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";

import { Icon, type IconName } from "@/components/icon";

export type WorkflowErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export function WorkflowErrorState({
  error,
  reset,
  scope,
  eyebrow,
  title,
  description,
  icon,
  retryLabel,
  returnHref,
  returnLabel,
}: WorkflowErrorProps & {
  scope: string;
  eyebrow: string;
  title: string;
  description: string;
  icon: IconName;
  retryLabel: string;
  returnHref: string;
  returnLabel: string;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  const titleId = `${scope}-error-title`;

  return (
    <section
      role="alert"
      aria-labelledby={titleId}
      className="mx-auto flex w-full max-w-2xl flex-col items-center px-5 pb-16 pt-16 text-center"
    >
      <span className="grid h-14 w-14 place-items-center rounded-full bg-ember/10 text-ember">
        <Icon name={icon} size={26} weight="bold" />
      </span>
      <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-ember">
        {eyebrow}
      </p>
      <h1
        id={titleId}
        className="mt-1 font-display text-3xl leading-tight text-ink"
      >
        {title}
      </h1>
      <p className="mt-3 max-w-[46ch] text-sm leading-relaxed text-graphite">
        {description}
      </p>
      <div className="mt-6 flex w-full max-w-sm flex-col gap-2 sm:flex-row sm:justify-center">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-ember px-5 text-sm font-semibold text-on-accent transition hover:bg-ember/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/50 focus-visible:ring-offset-2"
        >
          <Icon name="repeat" size={16} weight="bold" />
          {retryLabel}
        </button>
        <Link
          href={returnHref}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line bg-surface px-5 text-sm font-semibold text-ink/75 transition hover:bg-ink/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ember/50 focus-visible:ring-offset-2"
        >
          {returnLabel}
          <Icon name="caretRight" size={15} weight="bold" />
        </Link>
      </div>
    </section>
  );
}
