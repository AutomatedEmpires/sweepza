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
// `public` is Postgres's pseudo-role: a grant to it reaches anon and
// authenticated alike, so it has to count as a client role here.
const CLIENT_ROLES = ["anon", "authenticated", "public"];

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

  it("never selects * on listing under a client role", () => {
    // Postgres expands `*` before privilege checks, so a star select against
    // the column-scoped grant fails the entire query with 42501 and takes the
    // public feed down. getPublicListings is the one listing query that runs
    // under a client role; the others use the service role, which keeps its
    // table-wide grant.
    const src = readFileSync(
      join(process.cwd(), "lib/db/listings.ts"),
      "utf8",
    );
    const publicQuery = src.slice(
      src.indexOf("export async function getPublicListings"),
      src.indexOf("export async function getSeekerHistoryListingsByIds"),
    );

    expect(publicQuery).toContain("createServerSupabaseClient");
    expect(publicQuery).toContain(".select(PUBLIC_LISTING_COLUMNS)");
    expect(publicQuery).not.toContain('.select("*")');
  });

  it("keeps the selected column list and the granted allowlist in sync", () => {
    const listings = readFileSync(
      join(process.cwd(), "lib/db/listings.ts"),
      "utf8",
    );

    // Compare against the LATEST migration that grants listing columns to a
    // client role, not a fixed filename: the effective grant is whichever one
    // ran last, and pinning a name would leave a later re-application (like
    // the 20260801180000 recovery) unvalidated.
    const grantMigrations = migrationsAfter("00000000000000").filter(
      ({ sql }) =>
        /grant\s+select\s*\([^)]*\)\s*on\s+table\s+public\.listing\s+to[^;]*anon/i.test(
          withoutComments(sql),
        ),
    );
    expect(grantMigrations.length).toBeGreaterThan(0);
    const migration = grantMigrations[grantMigrations.length - 1].sql;

    const selected = new Set(
      (listings
        .slice(
          listings.indexOf("const PUBLIC_LISTING_COLUMNS = ["),
          listings.indexOf("].join(\", \")"),
        )
        .match(/"([a-z_]+)"/g) ?? []).map((token) => token.replaceAll('"', "")),
    );
    const grantBlock = migration.slice(
      migration.indexOf("grant select ("),
      migration.indexOf(") on table public.listing to anon, authenticated;"),
    );
    const granted = new Set(
      (grantBlock.match(/\b[a-z_]+\b/g) ?? []).filter(
        (token) => !["grant", "select"].includes(token),
      ),
    );

    // Selecting an ungranted column fails the query; granting one that is
    // never selected is dead surface area. They must match exactly.
    const selectedNotGranted = [...selected].filter((c) => !granted.has(c));
    const grantedNotSelected = [...granted].filter(
      (c) => !selected.has(c) && c !== "search_vector",
    );
    expect({ selectedNotGranted, grantedNotSelected }).toEqual({
      selectedNotGranted: [],
      grantedNotSelected: [],
    });
  });

  it("never re-grants anon a direct read of the host table", () => {
    // Public sponsor attribution goes through the host_public projection,
    // which carries its own column list and public-listing predicate. A grant
    // on the base table would make RLS the only barrier for data the design
    // never intended anon to reach at all.
    const offenders: string[] = [];
    for (const { name, sql } of migrationsAfter("20260801190000")) {
      for (const statement of withoutComments(sql).split(";")) {
        const normalized = statement.replace(/\s+/g, " ").trim().toLowerCase();
        if (!normalized.startsWith("grant ")) continue;
        if (!/\bon\s+(table\s+)?(public\.)?host\b/.test(normalized)) continue;
        if (/\bhost_public\b/.test(normalized)) continue;
        if (/\bto\b[^;]*\b(anon|public)\b/.test(normalized)) {
          offenders.push(`${name}: ${normalized.slice(0, 120)}`);
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
