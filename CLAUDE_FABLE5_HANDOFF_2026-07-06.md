# Sweepza Claude / Fable 5 Handoff

Updated: 2026-07-06

## Purpose

This handoff is for continuing the founder-authorized one-pass production convergence of Sweepza inside Claude with Fable 5.

It summarizes:

- the mandate and intended direction,
- the actual current repo state,
- what is already real,
- what is still transitional or stale,
- what was in progress at the point of handoff,
- what Claude should do first.

This is not a roadmap substitute. It is a continuation brief for active implementation work.

## Repo + environment

- Repo: `AutomatedEmpires/sweepza`
- Local path in this environment: `/home/jackson/automatedempires/ventures/sweepza`
- Reference repo: `/home/jackson/automatedempires/ventures/explore-and-earn`
- Branch at handoff: `main`
- Git status at handoff: clean except untracked `supabase/.temp/`
- Recent HEAD history:
  - `e3023c2` `ci: align reusable workflow, agent routing, and webhook hardening (#41)`
  - `64718ec` `feat(host): listing management, edit flow, analytics, logo upload, billing portal (#40)`
  - `349744f` `feat(admin): command center — dashboard, hosts, reports, notifications log, listings consolidation (#39)`
  - `24c3424` `feat(seeker): full-text search — GIN index, /search route, discovery integration (#38)`
  - `7ca023b` `feat(notifications): Resend email transport, 4 templates, host prefs, wired to review + winner flows (#37)`
  - `7fae8e6` `feat(winners+observability): real winner wall, reactions, submission flow, PostHog, Sentry (#35)`

## Founder mandate distilled

The product direction from the prompt is clear:

- Sweepza is not a sweepstakes directory.
- It should become the consumer operating system for discovering, organizing, entering, tracking, and returning to legitimate sweepstakes.
- The two core loops are:
  - consumer: Discover -> Understand -> Enter -> Track -> Return -> Win -> Share
  - host: Create -> Publish -> Reach -> Convert -> Measure -> Promote -> Return
- The highest-priority product work is the consumer operating layer:
  - Today
  - Sweep Routine
  - Ready Again
  - coherent Discover / Swipe / Search state
  - My Sweeps as a true control center
- Host monetization matters, but consumers remain free.
- Trust, freshness, provenance, and moderation are product features, not side details.
- Do not stop at route-level polish. Converge the whole product.

## What Copilot actually did in this session

This session did not implement product code.

It did:

- locate the real repo after the initial Linux path did not map through the Windows file APIs,
- verify the repo exists and is usable in WSL,
- inspect the current route tree, recent commit history, core shared primitives, and key product surfaces,
- compare current code against older repo reports to separate stale documentation from current reality,
- identify the highest-value continuation points for the next agent,
- write this handoff.

It did not:

- change app behavior,
- create migrations,
- run a full validate pass,
- run E2E,
- reconcile docs beyond documenting the current state here.

## Reality check: current product state

The repo has moved materially beyond the older June reports.

This is not a blank app and not just a public listings MVP anymore.

### Real now

- Live Supabase-backed public listing discovery through canonical listing queries.
- Homepage, Discover feed, Swipe deck, Search route, Listings browse route, and listing detail pages.
- Auth boundary through Clerk helpers when env is configured.
- Seeker-state persistence model backed by `listing_seeker_state`.
- Root layout loads signed-in seeker state from Supabase and passes it into the client provider.
- Winner Wall reads published winner posts and supports reactions and submission flow.
- Host routes exist for dashboard, listings, analytics, billing, notifications, and settings.
- Admin routes exist for command center, listings, hosts, reports, notifications, winners, claims, and import.
- Stripe baseline plan + add-on entitlement primitives exist in code.
- Resend-backed notification work appears to be landed.
- PostHog and Sentry wiring are present enough to justify the recent feature commit.
- Search index migration exists: `20260608000000_search_index.sql`.

### Transitional / incomplete / stale

- The top-level consumer IA is still transitional.
  - There is no dedicated `Today` route.
  - The homepage is still a marketing/discovery page, not the habit surface.
  - Bottom navigation is still `Discover / Saved / Winners / Host`, not the founder-mandated consumer-first set.
- `My Sweeps` is still too shallow.
  - Current `saved` route is a 3-tab dashboard: `Saved / Entered / Skipped`.
  - It does not yet model `Ready`, `Ready Again`, `Ending Soon`, `Won`, or richer personal organization.
- The proprietary Sweepza Card is stronger than early MVP, but not fully converged.
  - Share action exists on the card but only tracks analytics in `components/listing-card.tsx`.
  - Listing detail share uses real Web Share / clipboard fallback behavior.
- The icon doctrine is stale and conflicts with the founder direction.
  - `components/icon.tsx` still documents Streamline as the locked design system.
  - `AGENTS.md` still says `Icons = Streamline`.
  - The mandate now says move to a single semantic Phosphor-based registry.
- There are still stale comments from old lane/mock-era scaffolding in multiple files.
- Route-level hardening remains thin.
  - There is no meaningful first-party test suite in the repo.
  - Loading / error / branded not-found coverage is still sparse.
  - The quick inventory did not show meaningful app-owned test files.
- Some route styling has drift.
  - `app/host/billing/page.tsx` still uses generic gray/indigo SaaS styling instead of Sweepza visual language.
- Some type/doc seams are stale.
  - `components/winner-card.tsx` still imports `WinnerPost` from `lib/mock/winners` as a type, even though Winner Wall is now real.
  - `lib/seeker-state.tsx` still contains old comments describing it as mock/lane-based even though it now supports remote persistence.
- Reports in repo root dated `2026-06-04` are partly obsolete and understate what is now implemented.

## Important file-level observations

### Consumer shell

- `app/layout.tsx`
  - loads auth user,
  - fetches seeker-state snapshot for signed-in users,
  - mounts `ObservabilityProviders`, `SweepzaProviders`, `MobileShell`.

- `components/mobile-shell.tsx`
  - constrains app to `max-w-md` and uses a persistent bottom nav.
  - good for mobile discipline, but desktop will need more intentional treatment.

- `components/bottom-nav.tsx`
  - currently transitional MVP nav:
    - `/discover`
    - `/saved`
    - `/winners`
    - `/host`
  - this is one of the clearest places where the founder mandate is not yet reflected.

### Consumer state

- `lib/db/seeker-state.ts`
  - real service-role-backed read/write snapshot layer for `listing_seeker_state`.

- `lib/seeker-state.tsx`
  - real client provider with local mode and remote mode.
  - remote mode persists via `/api/seeker-state`.
  - still contains stale comments describing this as mock-era infrastructure.

- `app/api/seeker-state/route.ts`
  - signed-in GET/POST API for snapshot + mutation.

### Discovery / search / detail

- `lib/db/listings.ts`
  - canonical public listing query layer.
  - supports category, frequency, verified-only, and full-text search against `search_vector`.

- `app/discover/page.tsx`
  - simple discovery feed entrypoint.
  - not yet unified enough with Search and Swipe to feel like one coherent system.

- `app/discover/swipe/page.tsx`
  - real swipe surface exists.

- `app/search/page.tsx`
  - real search route exists and uses live query layer.
  - currently still basic in filtering and empty-state sophistication.

- `app/sweeps/[slug]/page.tsx`
  - real detail route, canonical metadata, `notFound()` behavior.

### Home vs Today

- `app/page.tsx`
  - still presents a brand/marketing hero, live stat strip, ending soon rail, featured rail, and Winner Wall teaser.
  - this is usable, but it is not the personalized `Today` operating layer described in the mandate.

### Winners

- `app/winners/page.tsx`
  - real published winner-post reads.
  - signed-in CTA for new submission.

- `components/winner-card.tsx`
  - good visual baseline, but still has stale mock type import and unauthenticated reaction bar behavior hardcoded.

### Host

- `app/host/page.tsx`
  - substantial real host logic is present:
    - sign-in gating,
    - host profile creation/edit path,
    - dashboard snapshot reads,
    - plan/connect billing actions,
    - category/tag loading,
    - checkout flow launch.
  - this is no longer a placeholder.

- `app/host/billing/page.tsx`
  - functionally real, visually not converged.

- `lib/billing/plans.ts`
  - one clear baseline subscription plus an extra-listing add-on.
  - this is good raw architecture for the host-side monetization law.

### Admin

- `app/admin/page.tsx`
  - real command center with live snapshots.
  - strong starting point, though the founder mandate wants queues/exceptions to dominate rather than decorative stats.

- `app/admin/review/page.tsx`
  - now redirects into consolidated listings review, which suggests admin IA is being merged rather than duplicated.

### Global config / docs drift

- `README.md`
  - still describes Phase 1 shell and old workflow assumptions.
- `CLAUDE.md`
  - still tells Claude to read `AGENTS.md` first and follow issue-driven delivery.
- `AGENTS.md`
  - still encodes older operational doctrine and stale icon standard.

## What is genuinely complete enough to preserve

Preserve and build on these instead of replacing them:

- canonical listing query + adapter boundary,
- Supabase schema/migrations already landed,
- seeker-state model and API shape,
- winner post model and Winner Wall baseline,
- host dashboard / host profile / billing scaffolding,
- admin snapshot queries and surface entrypoints,
- Stripe baseline/add-on entitlement direction,
- mobile-first shell discipline,
- legal routes already present,
- analytics / observability integrations already landed enough to extend.

## What is not yet complete against the mandate

These are the biggest mandate gaps, in priority order.

### 1. Today does not exist as the core habit surface

This is the most important product gap.

What exists now:

- homepage rails,
- saved dashboard,
- discovery feed,
- swipe,
- winners.

What still needs to exist:

- a true personal `Today` destination,
- `Ready Again`,
- `Ending Today`,
- `New Since Last Visit`,
- `Saved, Not Entered`,
- `Recent activity`,
- signed-out editorial variant,
- signed-in personal variant.

### 2. Consumer navigation and IA are still pre-convergence

Current nav is not the founder-defined model.

Need likely convergence toward:

- Today
- Discover
- My Sweeps
- Winners
- Profile

with host/admin role-aware access layered in, not mixed into the main consumer bottom nav as a permanent fourth consumer tab.

### 3. My Sweeps is not yet an operating system

Current `Saved / Entered / Skipped` tabs are not enough.

The founder brief explicitly wants:

- Ready
- Saved
- Entered
- Ready Again
- Ending Soon
- Won
- Skipped

and precise language around user-reported / application-observed state.

### 4. Discovery modes are still separate routes more than one coherent system

Search exists now, but the product still feels like separate feed/swipe/search pages rather than one unified discovery system with consistent state, chips, filters, and mental model.

### 5. Card and detail trust language need one more convergence pass

Still needed:

- stronger distinction among host trust, listing trust, source, and freshness,
- removal of any dead or fake controls,
- card and detail state language aligned to the product laws,
- cleaner explanation for why a listing is trustworthy and why it is relevant.

### 6. Icon system and active docs violate current mandate

The active code/docs still talk about Streamline. That needs to be retired in active documentation and current implementation surfaces, replaced by one semantic icon registry using the current AutomatedEmpires standard.

### 7. Host and admin surfaces need visual and IA convergence, not just existence

Host and admin are real, but they still need:

- stronger Sweepza-specific presentation,
- better “what needs attention now” hierarchy,
- reduction of generic dashboard feel,
- clearer monetization and promotion story.

### 8. Production hardening is behind the product surface work

Still needed:

- meaningful automated tests,
- route-level loading and error coverage,
- broader mobile/desktop visual QA,
- accessibility checks,
- performance review,
- explicit validation pass.

## External / environment notes

- The repo uses Clerk, Supabase, Stripe, PostHog, Sentry, and Resend patterns.
- `.env.local` exists locally in the repo, but this handoff does not inspect or repeat secrets.
- Billing code appears architecturally present, but actual sellable host product completion still depends on real Stripe products/price IDs being configured correctly.
- This handoff did not test live provider connectivity end to end.
- The older provider-readiness report is out of date in some areas because more features have landed since then.

## Concrete contradictions between current repo and founder brief

Claude should treat these as immediate convergence targets.

1. The app still centers on a homepage + discover + saved shell, not `Today`.
2. The bottom nav is not the intended consumer navigation model.
3. Streamline is still encoded in active docs/comments even though the current mandate says Phosphor via a semantic registry.
4. Some share behavior is still dead on the listing card.
5. Host billing styling is generic and visually off-brand.
6. Test coverage is effectively absent.
7. Repo root status reports from June are partially stale and should not be trusted over current code.

## Best first moves for Claude / Fable 5

Do not start by auditing the whole repo again.

Start with a short verification pass, then implement the highest-leverage convergence slice.

### Recommended sequence

1. Verify current baseline fast.
   - `git status`
   - inspect current env contract only as needed
   - run a narrow quality check if time allows: `pnpm typecheck` or `pnpm validate`

2. Converge the consumer IA first.
   - Build `Today` as the primary consumer route.
   - Decide whether `/` becomes Today directly or whether `/today` becomes primary and `/` becomes a signed-out editorial entry.
   - Update bottom nav to the final consumer-first structure.

3. Upgrade `My Sweeps` from transitional tabs into operational states.
   - Leverage the existing seeker-state model instead of inventing a second system.
   - Add `Ready Again` logic based on existing listing frequency + last interaction state.
   - Add `Ending Soon` and `Won` views.

4. Unify Discover / Swipe / Search.
   - One vocabulary.
   - One canonical state system.
   - One filter/chip language.

5. Do the card/detail trust pass.
   - Remove dead share behavior.
   - Make provenance, trust, freshness, and eligibility more explicit.
   - Preserve canonical listing data shape.

6. Fix icon/doc drift while touching those surfaces.
   - Do not make this the whole project.
   - Replace active Streamline doctrine in current docs/components as part of real product work.

7. Then tighten host/admin monetization and operational UX.
   - keep server-enforced entitlements,
   - make promotions/disclosure real,
   - improve “needs attention” hierarchy.

8. Finish with hardening.
   - loading
   - empty states
   - error states
   - tests
   - visual QA
   - accessibility
   - validation.

## Suggested prompt seed for Claude / Fable 5

Use something close to this:

"Continue Sweepza from the current repo state, not from the old June reports. The founder mandate is to converge it into the definitive consumer operating system for sweepstakes. The highest-priority remaining work is consumer IA convergence: Today, Sweep Routine, Ready Again, coherent Discover/Search/Swipe, and a real My Sweeps control center. Preserve the canonical listing object, Supabase-backed seeker state, host/admin/billing systems already landed, and do not re-audit the entire app. Read `CLAUDE_FABLE5_HANDOFF_2026-07-06.md`, then inspect the current shell, bottom nav, home route, seeker-state, listing card/detail, and host/admin surfaces. Implement continuously."

## Bottom line

Sweepza already has real product substance.

The next agent should not rebuild it.

The right move is to preserve the real data model and operations work that already exists, then spend the next major pass on whole-product convergence around the consumer operating system thesis:

- Today as habit surface,
- My Sweeps as control center,
- coherent discovery,
- stronger trust/freshness language,
- serious host monetization presentation,
- visual and operational unification across the entire app.