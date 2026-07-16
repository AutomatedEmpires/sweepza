import Link from "next/link";
import { SignUp } from "@clerk/nextjs";
import { isClerkConfigured } from "@/lib/auth";

export const metadata = { title: "Sign Up" };

export default function SignUpPage() {
  if (!isClerkConfigured()) {
    return (
      <section className="px-5 pb-10 pt-8">
        <div className="mx-auto flex max-w-md flex-col gap-4 rounded-card border border-line bg-surface p-5 text-center">
          <h1 className="font-display text-3xl text-ink">Sign up unavailable</h1>
          <p className="text-sm leading-relaxed text-ink/65">
            Clerk is not configured for this environment yet, so account sign-up
            is not available here.
          </p>
          <Link
            href="/discover"
            className="rounded-full bg-moss px-4 py-2 text-sm font-semibold text-cream transition hover:bg-moss/90"
          >
            Back to discover
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="px-5 pb-10 pt-8">
      <div className="mx-auto flex max-w-md justify-center">
        <SignUp forceRedirectUrl="/" signInUrl="/sign-in" />
      </div>
    </section>
  );
}
