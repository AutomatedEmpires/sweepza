import Link from "next/link";
import { SignIn } from "@clerk/nextjs";
import { isClerkConfigured } from "@/lib/auth";

export const metadata = { title: "Sign In" };

export default function SignInPage() {
  if (!isClerkConfigured()) {
    return (
      <section className="px-5 pb-10 pt-8">
        <div className="mx-auto flex max-w-md flex-col gap-4 rounded-card border border-sand bg-white/70 p-5 text-center">
          <h1 className="font-display text-3xl text-ink">Sign in unavailable</h1>
          <p className="text-sm leading-relaxed text-ink/65">
            Clerk is not configured for this environment yet, so account sign-in
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
        <SignIn forceRedirectUrl="/saved" signUpUrl="/sign-up" />
      </div>
    </section>
  );
}
