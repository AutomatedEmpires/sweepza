import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("reminder preference delivery truth", () => {
  const page = source("app/profile/notifications/page.tsx");
  const form = source(
    "app/profile/notifications/reminder-preferences-form.tsx",
  );

  it("derives the displayed state from every existing outbound gate", () => {
    expect(page).toContain("isOutboundEmailEnabled()");
    expect(page).toContain("isOutboundEmailConfigured()");
    expect(page).toContain("isEmailOutboxSchemaReady()");
    expect(page).toContain('data-delivery-state="inactive"');
    expect(page).toContain('data-delivery-state="unavailable"');
    expect(page).toContain('data-delivery-state="available"');
  });

  it("states plainly that disabled or unavailable delivery sends nothing", () => {
    expect(page).toContain("Email delivery is inactive");
    expect(page).toContain(
      "Sweepza is not sending reminder emails while outbound delivery is",
    );
    expect(page).toContain("Saving choices here does not activate it.");
    expect(page).not.toMatch(/only emails you/i);
    expect(page).not.toMatch(/choose which (?:emails|ones) you get/i);
  });

  it("provides pending, success, and error announcement infrastructure", () => {
    expect(form).toContain("useActionState");
    expect(form).toContain("useFormStatus");
    expect(form).toContain('aria-live="polite"');
    expect(form).toContain('state.status === "error" ? "alert" : "status"');
    expect(form).toContain("Saving preferences…");
    expect(form).toContain("disabled={pending}");
  });
});
