import Link from "next/link";
import { cn } from "@/lib/cn";

export function BrandMark({
  className,
  title,
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 48 48"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      className={cn("h-10 w-10", className)}
    >
      {title ? <title>{title}</title> : null}
      <rect width="48" height="48" rx="14" fill="rgb(var(--color-surface-2))" />
      <path
        d="M37 10.5H21c-6.1 0-11 4.1-11 9.2s4.9 9.2 11 9.2h6c6.1 0 11 3.8 11 8.6"
        fill="none"
        stroke="rgb(var(--color-accent))"
        strokeWidth="4.25"
        strokeLinecap="round"
      />
      <path
        d="m27 37 4.2 4.2L41 31"
        fill="none"
        stroke="rgb(var(--color-trust))"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M39.5 6.5v5M37 9h5"
        fill="none"
        stroke="rgb(var(--color-info))"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BrandLockup({
  href = "/",
  className,
  tagline = false,
}: {
  href?: string;
  className?: string;
  tagline?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-label="Sweepza home"
      className={cn(
        "inline-flex min-h-11 items-center gap-2.5 rounded-xl text-ink",
        className,
      )}
    >
      <BrandMark className="h-9 w-9 shrink-0" />
      <span className="min-w-0">
        <span className="block text-[21px] font-extrabold leading-none tracking-[-0.045em]">
          Sweepza
        </span>
        {tagline ? (
          <span className="mt-1 block text-[10px] font-semibold uppercase tracking-[0.16em] text-graphite">
            Sweepstakes simplified
          </span>
        ) : null}
      </span>
    </Link>
  );
}
