import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(relativePath: string): string {
  return readFileSync(join(process.cwd(), relativePath), "utf8");
}

describe("interaction accessibility contracts", () => {
  it("keeps compact-card confirmation and official-rules controls readable and tappable", () => {
    const card = source("components/listing-card.tsx");

    expect(card).toContain(
      'className="mt-1 inline-flex min-h-11 items-center gap-1',
    );
    expect(card).toContain(
      'className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1',
    );
    expect(card).toContain(
      'className="min-h-11 rounded-xl bg-pine px-3 py-2 text-xs font-semibold text-on-trust"',
    );
    expect(card).not.toContain(
      'bg-pine px-3 py-2 text-xs font-semibold text-white',
    );
  });

  it("keeps public-footer navigation targets at least 44px tall", () => {
    const footer = source("components/public-footer.tsx");

    expect(footer).toContain(
      'className="inline-flex min-h-11 min-w-11 items-center text-sm',
    );
    expect(footer).not.toContain("inline-flex min-h-8 items-center text-sm");
  });

  it("gives every host and admin state exactly one shell-owned main landmark", () => {
    const shell = source("components/mobile-shell.tsx");
    const adminLayout = source("app/admin/layout.tsx");
    const shellMainLandmarks = shell.match(/<main(?:\s|>)/g) ?? [];

    expect(shellMainLandmarks).toHaveLength(2);
    expect(shell).toContain(
      'if (isRoleWorkspace) {\n    return (\n      <div className="min-h-dvh bg-paper">',
    );
    expect(shell).toContain(
      '<main id="main-content" tabIndex={-1} className="focus:outline-none">',
    );
    expect(shell).not.toContain("isAdminWorkspace ? (");
    expect(adminLayout).not.toContain('<main className="min-w-0 flex-1">');
    expect(adminLayout).toContain('<div className="min-w-0 flex-1">');
  });
});
