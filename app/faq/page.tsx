import type { Metadata } from "next";
import Link from "next/link";
import { FAQ_ITEMS } from "@/lib/faq";
import { buildFaqJsonLd } from "@/lib/structured-data";
import { serializeJsonLd } from "@/lib/listing-seo";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Answers about Sweepza — is it free, are the sweepstakes legitimate, how daily entries work, and how we handle your data.",
  alternates: { canonical: "/faq" },
};

export default function FaqPage() {
  const jsonLd = serializeJsonLd(buildFaqJsonLd(FAQ_ITEMS));

  return (
    <section className="px-4 pb-10 pt-8 lg:mx-auto lg:w-full lg:max-w-2xl">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd }}
      />

      <header className="px-1">
        <h1 className="font-display text-3xl text-ink lg:text-4xl">
          Frequently asked questions
        </h1>
        <p className="mt-2 max-w-[52ch] text-[15px] leading-relaxed text-graphite">
          The short version: Sweepza is free, no purchase is ever necessary, and
          we&apos;re a directory — not the sponsor. Here are the details.
        </p>
      </header>

      <dl className="mt-6 flex flex-col gap-3">
        {FAQ_ITEMS.map((item) => (
          <div
            key={item.question}
            className="rounded-card border border-line bg-surface p-4 shadow-e1"
          >
            <dt className="font-display text-lg leading-snug text-ink">
              {item.question}
            </dt>
            <dd className="mt-1.5 text-[15px] leading-relaxed text-graphite">
              {item.answer}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-6 px-1 text-sm text-graphite">
        Still have a question? Read our{" "}
        <Link href="/privacy" className="font-semibold text-ember hover:underline">
          Privacy Policy
        </Link>{" "}
        and{" "}
        <Link href="/terms" className="font-semibold text-ember hover:underline">
          Terms
        </Link>
        , or learn more{" "}
        <Link href="/about" className="font-semibold text-ember hover:underline">
          about Sweepza
        </Link>
        .
      </p>

      <p className="mt-6 text-center text-[10px] uppercase tracking-[0.15em] text-graphite">
        Free for seekers · No purchase necessary
      </p>
    </section>
  );
}
