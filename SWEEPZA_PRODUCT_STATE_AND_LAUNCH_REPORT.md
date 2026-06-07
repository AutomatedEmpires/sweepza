# Sweepza Product State And Launch Report

Updated: 2026-06-04

## Current Product Summary

Sweepza currently has a real, working public browsing shell centered on live Supabase public reads: homepage, discover feed, swipe deck, browse page, and listing detail all render from the server-side query/adapter layer using canonical `Listing` objects. The app is strongest as a seeker-only discovery MVP. Saved state, Winner Wall, host tooling, auth, moderation/admin, scraper/import workflows, and SEO/analytics polish are still partial, mocked, or undefined.

## Route / Surface Inventory

| Route | File | Status | Data source | Empty / loading / error state | SEO metadata | Launch-critical |
| --- | --- | --- | --- | --- | --- | --- |
| `/` | `app/page.tsx` | Complete | Live Supabase public listings | No explicit loading; graceful empty rails by omission | Layout title template only | Yes |
| `/discover` | `app/discover/page.tsx` | Complete | Live Supabase public listings | Filter empty state present | Route title | Yes |
| `/discover/swipe` | `app/discover/swipe/page.tsx` | Complete | Live Supabase public listings | Empty deck state present | Route title | Yes |
| `/listings` | `app/listings/page.tsx` | Complete | Live Supabase public listings | No explicit empty copy beyond item count | Route title | Secondary |
| `/sweeps/[slug]` | `app/sweeps/[slug]/page.tsx` | Complete | Live Supabase by slug | `notFound()` on missing slug | Dynamic title + description | Yes |
| `/saved` | `app/saved/page.tsx` | Partial | Mock listings | Dashboard empty states depend on mock seeker state | Route title | No |
| `/winners` | `app/winners/page.tsx` | Partial | Mock winners + mock listings | Explicit empty state | Title + description | No |
| `/host` | `app/host/page.tsx` | Placeholder | None | Placeholder copy only | Route title | No |

## What Exists Today

### Public listing experience
- Homepage with hero, live stats, ending-soon rail, featured rail, and CTA links.
- Discover feed with sort and chip-based filters (`new`, `ends today`, `ends soon`, `daily`, `instant win`, `verified`).
- Swipe deck with save / skip / enter interactions and an empty “caught up” state.
- Listing detail page with rules summary, eligibility display, source attribution, host display, save/skip/enter interactions, and dynamic metadata.
- Browse page with bulk public listing display.
- Clean default Next.js 404 for bad slugs.

### Data architecture
- Public listing query layer in `lib/db/listings.ts`.
- Row-to-UI adapter boundary in `lib/db/adapters.ts`.
- RLS-backed public read model with `listing`, `listing_tag`, `winner_post`, and `host_public` projection.
- Seed convergence for sample listings `dream-cash-10k` and `maui-getaway`.
- Full SQL migration history committed in `supabase/migrations/`.

### UX primitives
- Mobile shell and bottom navigation.
- Streamline-style interim icon system in `components/icon.tsx`.
- Embedded SVG seed hero images to avoid broken external requests.
- Analytics event stub with consistent event names, but no transport yet.

## What Is Partial / Placeholder / Missing

### Partial
- `/saved`: mock seeker state and mock listing source, not Supabase-backed.
- `/winners`: mock wall only; real `winner_post` reads are not wired.
- SEO: basic metadata exists, but no sitemap, robots, JSON-LD, or explicit canonicals.
- Error and loading behavior: no route-level `loading.tsx`, `error.tsx`, or branded `not-found.tsx`.

### Placeholder
- `/host`: placeholder only.
- Analytics transport: stub only, no PostHog runtime hookup.

### Missing / Undefined
- Search route or search box.
- Auth UI / Clerk wiring.
- Admin/moderation surface.
- Import/scraper pipeline.
- Legal pages (`/privacy`, `/terms`, `/about`).
- Cloudinary or other managed image pipeline.
- Sentry/observability wiring.
- Automated test suite worth trusting.

## Public Surface Assessment

| Capability | Status | Notes |
| --- | --- | --- |
| Homepage | Real | Live data-driven rails and stats |
| Discover | Real | Best current public surface |
| Discover swipe | Real | Good mobile-first interaction |
| Listings/browse | Real but simple | No extra sort/filter UX |
| Listing detail | Real | Best-completed surface after PR #20 |
| Bad slug handling | Real | Uses `notFound()` -> clean default 404 |
| Search | Missing | No search UI or query layer |
| Filters | Partial | Discover-only; no category/tag chips yet |
| Tags/chips | Partial | Data model exists; chips not yet tag/category-driven |
| Eligibility display | Real | Detail page shows country/states/age |
| Rules summary | Real | Detail page |
| Prize/brand display | Partial | Prize info good; sponsor/brand content thin |
| Entry CTA | Real | Opens `entryUrl`, updates local seeker state |
| Image handling | Partial | Inline SVG seed images and raw URLs; no media pipeline |
| SEO metadata | Partial | Layout + detail only |
| Sitemap / robots | Missing | No route files present |
| Admin/import tools | Missing | Not yet surfaced |
| Scraper/data pipeline | Missing | No ingest worker or admin import UI |
| Source attribution | Real | `sourceLabel` displayed |
| Blog/content | Missing | None |
| Privacy/terms/about | Missing | None |
| Analytics | Partial | Events defined, transport absent |
| Auth/admin | Missing | Planned later |
| Monetization | Missing | Planned later |

## Backend / Architecture Status

### Real
- Canonical `Listing` type exists and is respected by public routes.
- Server-side public reads go through `getPublicListings()` / `getListingBySlug()`.
- Adapter layer prevents UI routes from depending on raw Supabase row shapes.
- RLS and `host_public` view enforce a safe anonymous public-read model.
- Seed is convergent for seeded listing rows (`on conflict (slug) do update`).

### Partial
- `listing_seeker_state` exists in schema, but public app state still starts from mock seed data in `app/layout.tsx`.
- Data model supports winner posts, reports, claims, subscriptions, boosts, and notifications, but most of those surfaces are not wired in UI.
- Image strategy exists at schema level, but no asset pipeline or moderation pipeline exists.

### Undefined / Not Ready
- Admin import workflow.
- Scraper or source-refresh cadence.
- Duplicate detection strategy beyond unique slug.
- Automated expiration/update job strategy.
- Production analytics/observability pipeline.

## Blunt Classification

### Real
- Public browse MVP shell.
- Live Supabase public listing reads.
- Adapter boundary.
- Seeded demo content.

### Fake / mocked
- Saved dashboard content.
- Winner Wall content.
- Initial seeker state seeded from mocks in layout.

### Placeholder
- Host dashboard.
- Analytics transport.

### Undefined
- Search product.
- Launch legal posture.
- Admin moderation process in-product.
- Import/scraper ownership and operating model.

## Launch-Blocking vs Deferrable

### Launch-blocking for anything beyond a demo
1. No search despite search/filter expectations in product scope.
2. No real saved-state persistence.
3. No admin/import workflow for maintaining listings.
4. No legal/privacy pages.
5. No production analytics / error monitoring.
6. No branch protection or real test suite, which increases release risk.

### Deferrable for an early public demo
1. Winner Wall live data.
2. Host dashboard.
3. Billing / monetization.
4. Sentry / PostHog full wiring if this is a short-lived demo.
5. Cloudinary/media pipeline.

## Design / Asset Status

- Icons: interim in-repo Streamline-style SVG glyphs.
- Streamline HQ: referenced as design direction, licensed asset import not yet present.
- Embedded SVG starter hero images: yes, in `supabase/seed.sql`.
- External placeholder images: yes, still present in mock listing data via `picsum.photos`.
- Public assets directory: none committed.
- Cloudinary usage: none in code.

Questions for Jackson:
1. Should Sweepza use cleaner product/sweepstakes icons or a more playful freehand style?
2. Should icons stay mostly in filters/detail states, or become more prominent on cards?
3. Should embedded SVG seed images remain for starter data, or move to Cloudinary-managed assets soon?
4. Are AI-generated or category-generated fallback images acceptable for launch, or should every public listing require curated imagery?

## Launch-Readiness Scorecard (0-10)

| Area | Score | Notes |
| --- | --- | --- |
| Public listing browsing | 8 | Core routes are real and stable |
| Discover / swipe | 8 | Strong current UX |
| Listing detail | 8 | Good content and interaction surface |
| Filters / search | 4 | Filters exist, search missing, category/tag filters missing |
| Tags / categories | 5 | Data model exists; public UX is incomplete |
| Supabase persistence | 6 | Public read is real; seeker/host/admin write flows are not |
| Data / import pipeline | 2 | Manual seed only |
| Admin tooling | 1 | Essentially absent |
| SEO | 4 | Basic metadata only |
| Image / media handling | 5 | Good enough for seed, not for scaled launch |
| Analytics | 2 | Stub only |
| Error / empty states | 6 | Some good empty states, little explicit error handling |
| Mobile UX | 8 | Clearly mobile-first |
| Testing / CI | 4 | CI exists, meaningful tests do not |
| Deployment / env | 5 | Deployable, but env docs are under-specified |
| Legal / privacy | 1 | Missing public pages |
| Monetization | 0 | Not launched |
| Overall MVP readiness | 5 | Good demo candidate, not a robust public beta yet |

## Timeline Scenarios

### A. Demo launch
Definition: live public app with seeded/manual listings, basic deploy, basic metadata, no automated scraper/admin.

Estimate: 3-7 days if env and deploy path are already in hand.

Critical path:
1. Confirm production envs.
2. Add basic legal/about pages.
3. Add branded 404 + simple SEO polish.
4. Decide whether mock-only saved/winners surfaces stay visible.

Can defer:
- auth
- host tools
- billing
- scraper

### B. Private/public beta
Definition: live Supabase listings, basic filters/search, manual admin/import path, analytics, Sentry, stable deploy.

Estimate: 3-5 weeks.

Critical path:
1. Search + richer public filters.
2. Admin/manual import workflow.
3. Saved-state persistence.
4. Sentry + PostHog wiring.
5. Legal/privacy pages and launch checklist.

Can defer:
- monetization
- full host dashboard
- automated scraping

### C. Real public launch
Definition: reliable listing pipeline, SEO system, analytics, monitoring, legal pages, domain/support path, repeatable operations.

Estimate: 8-12 weeks.

Critical path:
1. Reliable import/update pipeline.
2. Moderation/admin tooling.
3. Search + taxonomy polish.
4. SEO content system and indexability.
5. Observability and operational playbooks.

Can defer:
- subscription monetization if launch goal is audience acquisition first

## Recommended Next 10 Branches / PRs

1. `feat/seeker-experience/public-listing-filters-empty-states`
   Improve category/tag filters, empty states, browse consistency, and bad-slug polish.
2. `feat/foundation/public-seo-foundation`
   Add sitemap, robots, branded not-found, richer metadata, and canonical hygiene.
3. `feat/seeker-experience/seeker-state-supabase-persistence`
   Replace mock saved/entered/skipped state with `listing_seeker_state`.
4. `feat/observability/posthog-sentry-foundation`
   Wire analytics transport and error monitoring.
5. `feat/foundation/legal-static-pages`
   Add privacy, terms, and about/support surfaces.
6. `feat/data-auth-permissions/clerk-auth-shell`
   Add auth shell and session-aware server access path.
7. `feat/host-experience/host-submission-foundation`
   First real host submission/dashboard slice.
8. `feat/winner-wall/live-winner-wall-read-path`
   Replace mock winner data with `winner_post` public reads.
9. `feat/data-auth-permissions/manual-import-admin-slice`
   Add a minimal admin/manual ingest flow for listings.
10. `feat/data-auth-permissions/source-ingest-pipeline-plan`
   Establish repeatable ingest/freshness/duplicate strategy before broader launch.

## Immediate Recommendation

Treat Sweepza as a seeker-facing discovery demo with strong public-read foundations, not as a launch-complete marketplace. The next branch should improve public listing UX and surface completeness without breaking the Supabase adapter boundary.