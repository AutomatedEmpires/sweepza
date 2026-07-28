import Link from "next/link";
import { BrandLockup } from "@/components/brand";

const FOOTER_GROUPS = [
  {
    title: "Explore",
    links: [
      { href: "/discover", label: "Discover" },
      { href: "/winners", label: "Winner Wall" },
      { href: "/faq", label: "FAQ" },
    ],
  },
  {
    title: "Sweepza",
    links: [
      { href: "/about", label: "About" },
      { href: "/host", label: "For sponsors" },
      { href: "/sign-in", label: "Sign in" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/cookies", label: "Cookies" },
      { href: "/terms", label: "Terms" },
    ],
  },
] as const;

export function PublicFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid w-full max-w-[1440px] gap-10 px-5 py-12 sm:px-6 md:grid-cols-[1.4fr_2fr] lg:px-10">
        <div>
          <BrandLockup tagline />
          <p className="mt-4 max-w-sm text-sm leading-6 text-graphite">
            A free discovery and tracking service for sweepstakes. Promotions
            are run by their named sponsors or administrators, not by Sweepza
            unless a listing explicitly says otherwise.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
          {FOOTER_GROUPS.map((group) => (
            <div key={group.title}>
              <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-ink">
                {group.title}
              </h2>
              <ul className="mt-3 space-y-2.5">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="inline-flex min-h-11 min-w-11 items-center text-sm text-graphite transition hover:text-ink hover:underline"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex w-full max-w-[1440px] flex-col gap-2 px-5 py-5 text-xs leading-5 text-graphite sm:px-6 md:flex-row md:items-center md:justify-between lg:px-10">
          <p>© {new Date().getFullYear()} Sweepza. Free for sweepstakes seekers.</p>
          <p>Eligibility, entry terms, and odds are defined by each promotion&apos;s official rules.</p>
        </div>
      </div>
    </footer>
  );
}
