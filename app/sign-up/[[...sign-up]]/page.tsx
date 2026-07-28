import { SignUp } from "@clerk/nextjs";
import {
  AuthProductShell,
  AuthUnavailable,
} from "@/components/auth-product-shell";
import { isClerkConfigured } from "@/lib/auth";

export const metadata = { title: "Sign Up" };

export default function SignUpPage() {
  if (!isClerkConfigured()) {
    return (
      <AuthProductShell experience="sign-up">
        <AuthUnavailable />
      </AuthProductShell>
    );
  }

  return (
    <AuthProductShell experience="sign-up">
      <SignUp fallbackRedirectUrl="/" signInUrl="/sign-in" />
    </AuthProductShell>
  );
}
