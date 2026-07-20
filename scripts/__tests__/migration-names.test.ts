import { readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Supabase migration names", () => {
  it("uses one unique timestamp per migration", () => {
    const directory = join(process.cwd(), "supabase", "migrations");
    const files = readdirSync(directory).filter((name) => name.endsWith(".sql"));
    const timestamps = files.map((name) => {
      const match = /^(\d{14})_[a-z0-9_]+\.sql$/.exec(name);
      expect(match, `invalid migration filename: ${name}`).not.toBeNull();
      return match![1];
    });

    expect(new Set(timestamps).size, "duplicate migration timestamps").toBe(timestamps.length);
  });
});
