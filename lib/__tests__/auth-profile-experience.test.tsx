import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AuthProductShell,
  AuthUnavailable,
} from "@/components/auth-product-shell";

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("authentication product context", () => {
  it("renders honest sign-in context around the supplied auth form", () => {
    const html = renderToStaticMarkup(
      <AuthProductShell experience="sign-in">
        <div data-auth-form="sign-in">Auth form</div>
      </AuthProductShell>,
    );

    expect(html).toContain("Pick up your sweep routine.");
    expect(html).toContain('data-auth-form="sign-in"');
    expect(html).toContain("Official rules set the terms");
    expect(html).toContain("it does not enter a promotion for you");
    expect(html).toContain("not imported automatically");
    expect(html.match(/<h1/g)).toHaveLength(1);
  });

  it("renders the account-creation and unavailable states without overstating sync", () => {
    const html = renderToStaticMarkup(
      <AuthProductShell experience="sign-up">
        <AuthUnavailable />
      </AuthProductShell>,
    );

    expect(html).toContain("Keep your sweep routine with you.");
    expect(html).toContain("Account access is unavailable");
    expect(html).toContain("record activity on this device");
    expect(html).toContain("not imported automatically");
    expect(html).not.toMatch(/sync(?:ed|s)? guest/i);
  });

  it("preserves Clerk redirects and mode switching", () => {
    const signIn = source("app/sign-in/[[...sign-in]]/page.tsx");
    const signUp = source("app/sign-up/[[...sign-up]]/page.tsx");

    expect(signIn).toContain('<AuthProductShell experience="sign-in">');
    expect(signIn).toContain('fallbackRedirectUrl="/"');
    expect(signIn).toContain('signUpUrl="/sign-up"');

    expect(signUp).toContain('<AuthProductShell experience="sign-up">');
    expect(signUp).toContain('fallbackRedirectUrl="/"');
    expect(signUp).toContain('signInUrl="/sign-in"');
  });
});

describe("profile account truth and preferences", () => {
  const profile = source("app/profile/page.tsx");

  it("keeps the optional light-mode control in the named dashboard Appearance section", () => {
    expect(profile).toContain('title="Appearance"');
    expect(profile).toContain("<ThemeToggle");
    expect(profile).toContain(
      '{authUser && (\n            <ProfileSection id="profile-appearance"',
    );
    expect(profile).toContain(
      "Dark by default. Switch to light here when you prefer it.",
    );
    expect(profile).not.toContain("automatic, light, and dark");
  });

  it("does not promise that guest history is imported into an account", () => {
    expect(profile).toContain(
      "your guest history is not imported automatically",
    );
    expect(profile).not.toMatch(/sign in to sync it/i);
    expect(profile).not.toMatch(/sync your (?:guest|local|sweep) activity/i);
  });

  it("describes reminders, wins, and host access as the implemented workflows", () => {
    expect(profile).toContain(
      "Set email preferences for ready-again and deadline reminders",
    );
    expect(profile).toContain(
      "Submit a real win for review before publication",
    );
    expect(profile).toContain(
      "Apply for review before managing promotion listings",
    );
    expect(profile).not.toContain(
      "List and promote your sweepstakes on Sweepza",
    );
  });
});
