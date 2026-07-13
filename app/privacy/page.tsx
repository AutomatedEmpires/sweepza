import Link from "next/link";

export const metadata = {
  title: "Privacy Policy",
  description: "How Sweepza collects, uses, and protects information.",
};

const sections = [
  {
    title: "Information we collect",
    body: "We may collect account details you provide, including your name, email address, profile information, saved or entered sweepstakes, host-submitted listing information, support messages, and winner posts. If paid host features are enabled, our payment provider processes billing details and Sweepza receives related customer, subscription, and transaction records. We also collect limited device, log, security, and product-usage data needed to operate and improve the service.",
  },
  {
    title: "How we use information",
    body: "We use information to provide accounts and requested features, display and moderate listings and winner posts, operate host tools, provide support, protect the service, prevent abuse, process billing, measure reliability and product performance, and meet legal obligations. We do not use private account content in analytics events, and product analytics is configured without automatic pageview capture or session replay unless a later reviewed notice says otherwise.",
  },
  {
    title: "When information is shared",
    body: "We may share information with service providers that support hosting, authentication, databases, payments, email delivery, analytics, and error monitoring. We may also disclose information when required by law, to protect rights or safety, or as part of a reviewed business transaction. Sweepstakes sponsors and third-party entry sites receive information directly under their own terms when you choose to visit or enter through them. We do not sell personal information for money.",
  },
  {
    title: "Retention and security",
    body: "We retain information only for as long as reasonably needed for the purposes described here, including security, dispute, accounting, and legal needs. Retention periods depend on the record and whether an account or paid feature is active. We use administrative and technical safeguards designed to protect information, but no online service can guarantee absolute security.",
  },
  {
    title: "Your choices and requests",
    body: "You may update available account settings and communication preferences in the product. You may also request access, correction, or deletion of personal information, subject to identity verification and lawful retention requirements. Marketing messages, if introduced, will include the choices required by the reviewed communication policy. Service and security notices may still be necessary.",
  },
  {
    title: "Children and geographic scope",
    body: "Sweepza is not directed to children under 13, and we do not knowingly collect their personal information. Individual sweepstakes may impose higher age or location requirements in their official rules. If Sweepza expands to additional jurisdictions, this policy and the product controls must be reviewed for the applicable requirements before that expansion.",
  },
];

export default function PrivacyPage() {
  return (
    <section className="px-5 pb-10 pt-8">
      <div className="mx-auto flex max-w-2xl flex-col gap-5">
        <header className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-ember">
            Privacy policy
          </p>
          <h1 className="font-display text-4xl leading-tight text-ink">
            How Sweepza handles information
          </h1>
          <p className="text-sm leading-relaxed text-ink/70">
            Draft baseline dated July 12, 2026. This policy needs legal review
            before public launch and is not represented as attorney-approved.
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
          <h2 className="text-lg font-semibold text-ink">Contact and updates</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink/70">
            Privacy questions and requests may be sent to{" "}
            <a className="underline" href="mailto:privacy@sweepza.com">
              privacy@sweepza.com
            </a>
            . General support is available at{" "}
            <a className="underline" href="mailto:support@sweepza.com">
              support@sweepza.com
            </a>
            . We may update this policy as the service changes and will revise the
            date and provide additional notice when appropriate. See the{" "}
            <Link className="underline" href="/terms">
              Terms of Use
            </Link>
            .
          </p>
        </section>
      </div>
    </section>
  );
}
