# Sweepza Migration Reconciliation

## Result

**RECONCILED.** Remote Supabase history now contains every repository migration plus one security-hardening migration: 17 total.

## Pre-change metadata snapshot

- Remote history ended at `20260604120700_seed_dictionaries` (8 migrations).
- All eight later repository artifacts were absent from the schema, proving they were needed rather than manually applied.
- Row counts before change: one administrative `app_user`; zero hosts, listings, seeker states, winner posts, notification preferences, and notification logs. Founder context states there are zero real users/customers.
- No business row was deleted or overwritten. The only data statement was the idempotent saved-state backfill against an empty table.

## Classification and execution

| Version | Classification | Result |
| --- | --- | --- |
| `20260604220000` | needed, additive | applied; `is_saved` verified |
| `20260604223000` | needed, additive | applied; `verified_win` verified |
| `20260605120000` | needed, additive | applied; internal review note verified |
| `20260607000000` | needed, security hardening | applied; six pinned search paths verified |
| `20260607010000` | needed, additive | applied; email preferences, metadata, enum verified |
| `20260607120000` | needed, additive | applied; host review fields, enums, bucket/policies verified |
| `20260607120100` | needed, function replacement | applied; lifecycle guard verified |
| `20260608000000` | needed but repository SQL was invalid | corrected to real columns, then applied; generated vector and GIN index verified |

The search migration referenced nonexistent `description` and `host_name` columns. It now indexes `title`, `short_description`, `long_description`, `sponsor_name`, `prize_name`, and `prize_category`.

## Security follow-up applied

Migration `20260713000551_harden_public_views_and_storage`:

- sets `public.host_public` to `security_invoker=true`;
- removes broad anonymous object-listing policy from the public `host-logos` bucket;
- revokes direct Data API execution of the trigger-only privileged-field function.

Post-change security advisor: zero `ERROR` findings. Twelve warnings remain around intentionally callable identity helpers and should receive a separate RLS/RPC design review before public-user launch.

## Rollback

The changes are additive and business tables were empty. If a defect appears, use a new forward migration to correct functions, policies, columns, or indexes. Do not drop columns or enum values in a live rollback.
