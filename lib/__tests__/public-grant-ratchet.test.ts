import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Grant ratchet.
 *
 * RLS filters rows, never columns, so the only thing keeping operator notes
 * out of public reach is the column-level SELECT allowlist installed by
 * 20260801160000. A later migration that re-grants the whole table would undo
 * that silently — nothing in the app would change and no RLS test would fail.
 * This asserts the shape of the grants instead of the behavior, because the
 * behavior is invisible until an operator writes the first note.
 */
const MIGRATIONS_DIR = join(process.cwd(), "supabase/migrations");
const OPERATOR_ONLY_LISTING_COLUMNS = [
  "review_notes",
  "review_notes_internal",
  "sponsor_notes_internal",
];
const CLIENT_ROLES = ["anon", "authenticated"];

function migrationsAfter(version: string): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql") && name.slice(0, 14) >= version)
    .sort()
    .map((name) => ({
      name,
      sql: readFileSync(join(MIGRATIONS_DIR, name), "utf8"),
    }));
}

/** Strips `--` line comments so prose about grants never trips the scan. */
function withoutComments(sql: string): string {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

describe("public grant ratchet", () => {
  it("never re-grants table-wide SELECT on listing to a client role", () => {
    const offenders: string[] = [];
    for (const { name, sql } of migrationsAfter("20260801160000")) {
      for (const statement of withoutComments(sql).split(";")) {
        const normalized = statement.replace(/\s+/g, " ").trim().toLowerCase();
        if (!normalized.startsWith("grant ")) continue;
        if (!/\bon\s+(table\s+)?(public\.)?listing\b/.test(normalized)) continue;
        // A column list makes the grant explicit and is what we want; a bare
        // `grant select on listing` covers every column including the notes.
        const isColumnScoped = /grant\s+select\s*\(/.test(normalized);
        const touchesClientRole = CLIENT_ROLES.some((role) =>
          new RegExp(`\\bto\\b[^;]*\\b${role}\\b`).test(normalized),
        );
        if (touchesClientRole && !isColumnScoped) {
          offenders.push(`${name}: ${normalized.slice(0, 120)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("never grants an operator-only listing column to a client role", () => {
    const offenders: string[] = [];
    for (const { name, sql } of migrationsAfter("20260801160000")) {
      for (const statement of withoutComments(sql).split(";")) {
        const normalized = statement.replace(/\s+/g, " ").trim().toLowerCase();
        if (!normalized.startsWith("grant ")) continue;
        const columnList = normalized.match(/grant\s+select\s*\(([^)]*)\)/);
        if (!columnList) continue;
        const granted = columnList[1].split(",").map((c) => c.trim());
        const touchesClientRole = CLIENT_ROLES.some((role) =>
          new RegExp(`\\bto\\b[^;]*\\b${role}\\b`).test(normalized),
        );
        if (!touchesClientRole) continue;
        for (const column of OPERATOR_ONLY_LISTING_COLUMNS) {
          if (granted.includes(column)) {
            offenders.push(`${name}: grants ${column}`);
          }
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps host_public projecting only public-safe columns", () => {
    const sql = readFileSync(
      join(
        MIGRATIONS_DIR,
        "20260801160000_close_public_column_exposure_and_host_attribution.sql",
      ),
      "utf8",
    );
    const view = sql.slice(
      sql.indexOf("create or replace view public.host_public"),
      sql.indexOf("comment on view public.host_public"),
    );

    expect(view).toContain("security_invoker = false");
    // The predicate is the access control for an owner-run view — without it
    // the view would expose every host row.
    expect(view).toContain("visibility_status = 'public'");
    expect(view).toContain("lifecycle_status = 'active'");
    for (const forbidden of [
      "stripe_customer_id",
      "app_user_id",
      "suspended_reason",
      "verified_by",
      "account_status",
    ]) {
      expect(view).not.toContain(forbidden);
    }
  });
});
