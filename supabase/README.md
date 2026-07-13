# Sweepza data layer (Supabase)

Canonical implementation of **Canonical Data Model & RLS**, **Listing States &
Quality Gate**, and **Controlled Dictionaries & Taxonomy Governance**.

## Layout
- `migrations/` ordered SQL: enums to dictionaries to core to engagement to
  billing/notifications to functions/triggers to RLS/grants to dictionary seed.
- `seed.sql` local/dev-only sample rows (owner + two seeded listings).

## Apply locally
```bash
supabase start
supabase db reset   # runs migrations + seed.sql
```

## Identity model
Clerk is the IdP. The JWT `sub` claim is the `clerk_user_id`. Helpers
(`private.current_app_user_id()`, `private.is_owner()`, `private.is_admin()`,
`private.is_host()`, `private.current_host_id()`, `private.current_clerk_user_id()`)
resolve identity for RLS and are `security definer` to avoid recursive policy
evaluation. They live in the non-exposed `private` schema (not in the Data API's
exposed-schema list), so they are unreachable as PostgREST RPCs while `anon` /
`authenticated` keep EXECUTE for policy evaluation — see
`migrations/20260713120000_move_identity_helpers_to_private_schema.sql`. The
`service_role` key bypasses RLS for trusted server tasks (Clerk webhooks, owner
seeding, moderation jobs).

## Guardrails enforced in the database
- **Quality gate** (`listing_publish_guard`): blockers #1-#13 for `active`.
- **Entitlement cap** (`enforce_active_listing_cap`): host-submitted active
  listings <= plan cap (hard max 10).
- **Trust/moderation protection** (`protect_listing_privileged_fields`): only
  owner/admin set verification/featured/moderation/duplicate.
- **Role protection** (`protect_app_user_roles`): role flags are admin-managed.
- **Claim transfer** (`apply_listing_claim`): approval reassigns ownership while
  preserving history.

AI moderation (#14) and final publish authority remain application/admin concerns.

## Public exposure
Anonymous users read only `public` + `active` + non-`under_review`/`action_taken`
listings, dictionaries, the `host_public` view, and published winner posts.

## Type generation
TS row/enum types are hand-authored in `lib/db/` to match these migrations. Once a
real project exists, regenerate with `pnpm db:types`.
