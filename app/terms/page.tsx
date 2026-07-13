import Link from "next/link";

export const metadata = {
  title: "Terms of Use",
  description: "Baseline terms governing use of Sweepza.",
};

const sections = [
  {
    title: "Sweepza's role",
    body: "Sweepza helps people discover sweepstakes and may provide tools for hosts to submit and manage listings. Unless a listing expressly says otherwise, Sweepza is not the sponsor, administrator, or prize provider. Each sponsor's official rules, eligibility requirements, entry method, deadlines, and decisions control that promotion. A listing is informational and is not a guarantee that a promotion is available, lawful in your location, or accurately described.",
  },
  {
    title: "Eligibility and accounts",
    body: "You must be at least 18 years old and able to enter a binding agreement to create an account or use host features. You are responsible for accurate account information, protecting your credentials, and activity under your account. You must independently review the official rules before entering any sweepstakes. Creating a Sweepza account does not make you eligible for a promotion.",
  },
  {
    title: "Acceptable use",
    body: "You may not misuse the service, interfere with its operation, scrape or automate access in a way that burdens the service, evade security controls, impersonate others, submit deceptive or unlawful content, infringe rights, manipulate entries or winner activity, or use the Winner Wall as undisclosed advertising. Sweepza may investigate, hide, reject, or remove content and may suspend access when reasonably necessary to protect users or the service.",
  },
  {
    title: "Host content and paid features",
    body: "Hosts remain responsible for their promotions, official rules, required disclosures, prize fulfillment, listing accuracy, and compliance with applicable law. By submitting content, you confirm that you have the rights needed for Sweepza to host, display, format, and promote that content in connection with the service. Pricing, renewals, cancellations, refunds, and plan limits for any paid host feature must be shown at purchase and remain subject to the applicable payment-provider terms.",
  },
  {
    title: "Third-party services",
    body: "Sweepza links to sponsor websites and other third-party services that Sweepza does not control. Their terms and privacy practices apply when you use them. Sweepza is not responsible for third-party content, availability, entry processing, winner selection, communications, or prize fulfillment. Report suspicious or inaccurate listings to support@sweepza.com.",
  },
  {
    title: "Service changes and termination",
    body: "We may change, suspend, or discontinue features and may update these terms as the service evolves. We may restrict or terminate access for violations, legal risk, fraud, abuse, or threats to the service. Provisions that by their nature should continue after termination, including ownership, disclaimers, limitations, and dispute terms, will survive.",
  },
  {
    title: "Disclaimers and responsibility",
    body: "To the extent permitted by law, Sweepza is provided on an 'as is' and 'as available' basis without warranties of uninterrupted operation, listing accuracy, eligibility, entry success, winner selection, or prize fulfillment. Any limitation of liability, indemnity, governing-law, venue, arbitration, or class-action waiver language requires jurisdiction-specific legal review before it may be treated as operative launch terms.",
  },
];

export default function TermsPage() {
  return (
    <section className="px-5 pb-10 pt-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-5">
        <header className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ember">
            Terms of use
          </p>
          <h1 className="font-display text-4xl leading-tight text-ink">
            Rules for using Sweepza
          </h1>
          <p className="text-sm leading-relaxed text-ink/70">
            Draft baseline dated July 12, 2026. These terms need legal review
            before public launch and are not represented as attorney-approved.
          </p>
        </header>

        {sections.map((section) => (
          <section
            key={section.title}
            className="rounded-card border border-sand bg-white/70 p-4"
          >
            <h2 className="text-lg font-semibold text-ink">{section.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink/70">
              {section.body}
            </p>
          </section>
        ))}

        <section className="rounded-card border border-sand bg-white/70 p-4">
          <h2 className="text-lg font-semibold text-ink">Questions</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink/70">
            Contact{" "}
            <a className="underline" href="mailto:legal@sweepza.com">
              legal@sweepza.com
            </a>{" "}
            for legal notices or{" "}
            <a className="underline" href="mailto:support@sweepza.com">
              support@sweepza.com
            </a>{" "}
            for product support. Please also review the{" "}
            <Link className="underline" href="/privacy">
              Privacy Policy
            </Link>
            .
          </p>
        </section>
      </div>
    </section>
  );
}
