import { SignIn } from "@clerk/nextjs";
import {
  AuthProductShell,
  AuthUnavailable,
} from "@/components/auth-product-shell";
import { isClerkConfigured } from "@/lib/auth";

export const metadata = { title: "Sign In" };

export default function SignInPage() {
  if (!isClerkConfigured()) {
    return (
      <AuthProductShell experience="sign-in">
        <AuthUnavailable />
      </AuthProductShell>
    );
  }

  return (
    <AuthProductShell experience="sign-in">
      <SignIn fallbackRedirectUrl="/" signUpUrl="/sign-up" />
    </AuthProductShell>
  );
}
