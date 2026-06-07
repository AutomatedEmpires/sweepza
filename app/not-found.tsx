import Link from "next/link";
import { Icon } from "@/components/icon";

export default function NotFound() {
  return (
    <section className="flex min-h-[70dvh] flex-col items-center justify-center px-6 py-16 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-full bg-moss/10 text-moss">
        <Icon name="gift" size={30} />
      </span>
      <h1 className="mt-5 font-display text-4xl text-ink">Page not found</h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-ink/65">
        That page is not available right now. You can jump back into the live
        sweepstakes feed or head home.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <Link
          href="/discover"
          className="rounded-full bg-moss px-4 py-2 text-sm font-semibold text-cream transition hover:bg-moss/90"
        >
          Browse sweeps
        </Link>
        <Link
          href="/"
          className="rounded-full border border-sand px-4 py-2 text-sm font-semibold text-ink/70 transition hover:bg-ink/5"
        >
          Home
        </Link>
      </div>
    </section>
  );
}
