# Runbook: apply the RLS policy consolidation (founder-gated)

**State today:** NOT applied and NOT committed — rewriting RLS policies on
nine production tables requires explicit founder approval, which has not been
given. The live database is untouched.

## What it is
The Supabase performance advisor reports 72 `multiple_permissive_policies`
warnings: seven `FOR ALL` write policies overlap dedicated per-command
policies, so every read evaluates two RLS predicates per row (badge, category,
eligibility, tag, host, listing, listing_seeker_state, listing_tag,
winner_reaction). The drafted migration replaces each with per-command
policies whose predicates are the exact OR-union of today's grants — access
neither widens nor narrows.

## Evidence already gathered
The exact DDL was dry-run against the live project inside a rolled-back
transaction (2026-07-16): every statement applied cleanly, a post-state
assertion confirmed zero `(table, action)` pairs with multiple permissive
policies, then everything rolled back and the live DB was verified untouched.

## Activate (after founder approval)
1. Recover the draft (session scratchpad `rls-consolidation-full.sql`, or
   regenerate: the derivation is fully documented in PR #66's description and
   the session log — per-command split with OR-union predicates).
2. Commit it as `supabase/migrations/<timestamp>_advisor_rls_consolidation.sql`
   on a `feat/data/*` branch; open a PR; merge on green CI.
3. Apply through the normal migration flow (`supabase db push` / deploy).
4. Verify: re-run the Supabase advisor — `multiple_permissive_policies`
   should drop to zero; smoke-test seeker save/enter, host dashboard, admin
   review (policy semantics are unchanged, so all should behave identically).

## Rollback
Policies are metadata: re-applying the previous policy definitions (from the
prior migrations) restores the exact old state. No data is touched either way.
