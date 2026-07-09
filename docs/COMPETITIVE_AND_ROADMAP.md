# Sweepza: Competitive Teardown & Execution Roadmap

Thesis under test: **"Sweepza remembers so you don't have to."** A memory/routine engine — what you entered, when you can re-enter, what's ending, what to do next — is the moat. This doc grounds that thesis against the real incumbent landscape and turns it into a buildable roadmap against Sweepza's actual schema (`listing`, `host`, `subscription`, `listing_seeker_state`, `winner_post`) and interaction model (save / enter / ready-again / Today / Discover+swipe / My Sweeps / Winners).

Research note: web search was used to characterize each named competitor. Where a source didn't state a specific fact (e.g. exact ad revenue, precise UX metrics), that's marked "not verifiable" rather than guessed.

---

## 1. Landscape

The sweepstakes-aggregator category is old, fragmented, and has not been meaningfully re-platformed for mobile or personalization. It is almost entirely: (a) ad-supported directory websites built in the 2000s-2010s, still running today, or (b) newsletter/forum communities. There is no dominant mobile-native player.

| Site | What it is | Monetization | Notable dated/spammy/manual traits |
|---|---|---|---|
| **Sweepstakes Advantage** (sweepsadvantage.com) | Largest directory, live since 1997; 200+ new sweeps/day, "SweepsCheck" manual entry-tracker | Ad-supported free tier + paid "Plus" tier (exclusive sweeps, social/local/Canada sweeps, daily bonuses) gated behind a **consumer** paywall | Core "remember what I entered" function is a manual self-service tracker, not a proactive system; best content is paywalled from free users |
| **Contest Girl** (contestgirl.com) | One of the largest directories (~354K monthly visitors per third-party estimate); community/user-submitted listings, filterable by entry frequency | Paid host placement packages (homepage, newsletter, cross-posting) — no clear consumer paywall | Reviewed elsewhere as having a "20th-century UI"; light moderation on user-submitted listings |
| **Sweepstakes Fanatics** (sweepstakesfanatics.com) | Largest US directory by traffic (1M+ monthly visits per third-party estimate); vetted/curated daily listings, forum, daily email digest | Ad-supported, social/newsletter promotion | Curated but still a flat chronological list; no personalization; growth loop is email digest, not the product itself |
| **Sweeties Sweeps** (sweetiessweeps.com) | Community platform — brands/individuals post sweeps; hosts none of the actual entry forms | Ad-supported free site + **paid "Secret" ad-free site** ($40/yr) | User reviews explicitly cite pop-ups / download-prompt ads on the free tier as a recurring complaint; trust/quality gated behind a consumer paywall |
| **Sweeps Atlas** (sweepsatlas.com) | Modern-ish directory (~1,900 listings) with a purpose-built power-user toolset: "Embark" bulk-opens many entry links in tabs at once, per-listing Hide/Block-domain, and a self-reported "remembers which sweepstakes you've already entered" | Free core + paid "premium tools" tier | Closest existing analog to a memory engine, but it's a **client-side browser convenience tool**, not proactive (no push/email nudges tied to re-entry cadence); still requires the user to initiate every session |
| **Online-Sweepstakes.com / iWin** | Legacy forum-based community site (Online-Sweepstakes) and a gamified casual-games-tied sweepstakes portal (iWin) | Ad-supported / casual-game engagement loops | Design and interaction patterns are pre-mobile-web era; engagement is driven by games, not sweepstakes utility |
| **"Golden Ticket" / GoldenTicketSweeps** | Not a single coherent competitor — the name is shared by unrelated operators (a UK instant-win competition site, a US giveaway company, and branded promos like Verizon's/DraftKings') | Varies (bond/comp-style instant-win sites; branded promos) | Flagging as **not independently verifiable as one entity**; excluded from further analysis |
| **r/sweepstakes** | Community-driven, real-time crowd-sourced posting; no structured tooling | None (Reddit ads) | Zero verification layer — the community itself has to police scam links; no memory of entries at all |
| **"Sweepstakes" apps on iOS/Android app stores** | Search results are dominated by **sweepstakes-casino** apps (social/real-money-adjacent gambling using sweepstakes-model virtual currency — Crown Coins, McLuck, Pulsz, etc.) | Real-money-adjacent gambling mechanics | This is a different category entirely (gambling, not "enter free prize sweepstakes"), but it means **legitimate no-purchase-necessary sweepstakes discovery has essentially no credible native mobile presence** — confirmed whitespace |

### The 4 systemic weaknesses

1. **No memory, no proactive routine.** Every directory researched is pull-only: the user must remember to come back, re-check, and manually re-enter daily/weekly sweeps. The one exception (Sweeps Atlas's "remembers what you entered") is a manual browser tool, not a push/email-driven re-entry cadence tied to when you're actually eligible again.
2. **Ad-choked, dated UX — and the best UX is often paywalled from the consumer.** Sweeties Sweeps and Sweepstakes Advantage both gate their cleanest experience behind a *consumer-paid* tier, which is the opposite of Sweepza's host-pays model.
3. **Weak, inconsistent trust/verification.** Several directories are user/community-submitted with light moderation (Contest Girl, Sweeties Sweeps, r/sweepstakes). Scam vigilance is left to the community. No researched competitor surfaces a structured host-verification badge or automated link/rules health-check to the end user.
4. **No personalization or ranking, and no native mobile-first experience.** Listings are flat, chronological/alphabetical, filtered only by static facets (frequency, category, geography). Growth and retention loops run through email newsletters, not an app people build a daily habit around. The mobile app-store surface for this category is currently occupied by unrelated gambling apps.

Sources: [Sweepstakes Advantage](https://www.sweepsadvantage.com/), [Contest Girl](https://www.contestgirl.com/), [Sweepstakes Fanatics](https://sweepstakesfanatics.com/), [Sweeties Sweeps Trustpilot](https://www.trustpilot.com/review/sweetsweeps.com), [Sweeties Sweeps review](https://www.livingmoreworkingless.com/sweeties-secret-sweeps-review-scam-or-legit-way-to-win-local-sweepstakes/), [Sweeps Atlas](https://www.sweepsatlas.com/), [Sweeps Atlas "Welcome"](https://www.sweepsatlas.com/pages/welcome-to-sweeps-atlas), [Blitz Rocket: 20 best free sweepstakes sites](https://blitzrocket.com/blog/best-free-sweepstakes-websites), [RafflePress: 23 best sweepstakes websites](https://rafflepress.com/best-online-sweepstakes-websites/), [The Enterprise World: top websites for legitimate sweepstakes](https://theenterpriseworld.com/websites-to-find-legitimate-sweepstakes/), [Sweepstakes casino apps roundup](https://www.thelines.com/casino/sweepstakes/apps/).

---

## 2. Where Sweepza wins

| Systemic weakness | Sweepza's structural advantage | Grounded in |
|---|---|---|
| No memory / manual re-entry | `listing_seeker_state` already models per-user `saved_at` / `entered_at` / `skipped_at` / `won_at` / `primary_ui_state` per listing — the memory engine is a first-class table, not a bolt-on browser tool. Combined with `listing.entry_frequency` (`daily`/`weekly`/`monthly`/`instant_win`/`one_time`), Sweepza can compute exact "ready again" eligibility server-side. | `supabase/migrations/20260604120200_core.sql` |
| Best UX paywalled from consumers | Sweepza's monetization is host-side only (`subscription`, `boost` tables, Stripe-backed slot caps). Consumers are never asked to pay for the memory engine, reminders, or an ad-free experience — that's the structural opposite of Sweepstakes Advantage/Sweeties Sweeps. | `supabase/migrations/20260604120400_billing_notifications.sql` |
| Weak trust/verification | `host.verification_status` (`none`/`self_verified`/`admin_verified`), `listing.listing_verification_status` (`unreviewed`/`reviewed`/`verified`/`rejected`), `moderation_status`, `duplicate_status`, and a structured `report` table with reason codes (`scam_suspicious`, `broken_entry_link`, `fake_winner_claim`, `rules_issue`, etc.) and `report_ai_severity` are already modeled. No competitor researched has this as structured data — it's community vigilance at best. | `supabase/migrations/20260604120000_enums.sql`, `20260604120300_engagement.sql` |
| No personalization, no native mobile | Sweepza already has Discover + swipe mode and a Today dashboard as first-class surfaces (not retrofitted onto a desktop directory), plus full-text search (`search_vector`/GIN index) and controlled `category`/`tag` dictionaries to rank against. | `app/discover`, `app/discover/swipe`, `supabase/migrations/20260608000000_search_index.sql`, `20260604120100_dictionaries.sql` |

**A specific, already-latent asset worth calling out:** `notification_pref` already has seeker-facing columns — `ends_today`, `ends_soon`, `new_listings`, `saved_listing_ending`, `winner_wall_reactions`, `winner_wall_verification`, `weekly_roundup`, plus `email_enabled`/`in_app_enabled`/`push_enabled` — but the only implemented send path today (`lib/email/notifications.ts`'s `sendHostNotification`) is **host-lifecycle-only** (`listing_approved`, `listing_held`, `listing_expiring_soon`). The seeker-facing reminder engine is schema-complete and unbuilt. That's the single highest-leverage gap in the codebase relative to the thesis.

---

## 3. The roadmap: 8 highest-leverage moves

| # | Move | Effort |
|---|---|---|
| 1 | Proactive multi-channel reminders (ready-again + ending-soon) | S |
| 2 | Personalized Discover/Today ranking | M |
| 3 | Trust & verification surfacing + automated scam filtering | M |
| 4 | One-tap / assisted entry (non-deceptive) | S–M |
| 5 | Host self-serve liquidity (claim-your-sweepstakes + Stripe onboarding) | M |
| 6 | Winner proof & social trust loop | S |
| 7 | Daily habit / streak loop | S–M |
| 8 | Mobile-native shell + push infrastructure | L |

### 1. Proactive multi-channel reminders — the thesis, shipped

- **What:** A scheduled job that, per user, computes two reminder classes and delivers them through the channels the user opted into.
- **Why it wins:** This *is* "remembers so you don't have to." No competitor researched pushes a re-entry reminder tied to actual cadence eligibility — Sweeps Atlas's memory is manual/browser-side; Sweepstakes Advantage/Sweepstakes Fanatics push generic daily-digest emails, not per-user "you can re-enter X now" or "Y you saved ends in 6 hours."
- **Implementation sketch:**
  - *Ready-again*: `listing_seeker_state` rows where `primary_ui_state = 'entered'`, joined to `listing.entry_frequency` (`daily`/`weekly`/`monthly`), where `entered_at + cadence_interval <= now()` and the listing is still `lifecycle_status = 'active'` / `visibility_status = 'public'`.
  - *Ending-soon*: `listing.end_date` within a configurable window (e.g. 72h/24h) where the user has `saved_at` or `entered_at` set, gated by `notification_pref.saved_listing_ending` / `.ends_soon`.
  - New cron route (Vercel Cron, alongside the existing `app/api/cron/expire-stale/route.ts` pattern) — e.g. `app/api/cron/seeker-reminders/route.ts` — runs hourly/daily, checks `notification_pref` per user, writes `notification_log` rows (`channel: 'email' | 'in_app'`, `type: 'ready_again' | 'ending_soon'`), and calls a new seeker-facing counterpart to `sendHostNotification` reusing the existing `lib/email/send.ts` + template pattern.
  - Surfaces on the Today dashboard as the literal next-best-action list, ranked by urgency (ending-soon before ready-again, soonest end_date first).
- **Effort:** S for email + in-app (reuses existing `notification_pref`/`notification_log`/email plumbing, no schema change). Push channel is a separate lift — see Move 8.

### 2. Personalized Discover/Today ranking

- **What:** Replace (or layer onto) the current chronological/`published_at`-ordered Discover feed with a per-user relevance score.
- **Why it wins:** Every competitor researched is a flat list with only static facet filters (frequency, category, geography). None personalize to a user's actual behavior.
- **Implementation sketch:**
  - Signal inputs, all already captured: implicit preference from `listing_seeker_state` history (which `prize_category`/`tag_code`s a user saves/enters vs. skips), `entry_frequency` mix a user tends to complete, `is_featured`/active `boost` rows (host-paid, but capped in weight so paid placement nudges rather than dominates — protects trust), recency (`published_at`), and proximity to `end_date` (soon-ending relevant sweeps should surface).
  - No ML needed for v1: a weighted-sum score computed at query time (or in a nightly-refreshed materialized view keyed by `app_user_id` × `prize_category`/`tag_code` affinity) is sufficient and keeps it auditable — important given trust is a stated differentiator.
  - Swipe mode (`app/discover/swipe`) becomes the training signal collector: every skip/save is a preference update.
- **Effort:** M — new scoring function/view, no new tables required (can derive affinity directly from `listing_seeker_state` + `listing_tag`).

### 3. Trust & verification surfacing + automated scam filtering

- **What:** Turn the already-modeled trust columns into a visible, automated pipeline rather than admin-only backend state.
- **Why it wins:** "Weak trust/verification" is the most consistently observed weakness across the category (light-moderation community directories, community-only scam policing on r/sweepstakes, zero structured verification anywhere researched).
- **Implementation sketch:**
  - Surface `host.verification_status` and `listing.listing_verification_status` as a visible badge on listing cards and host profiles (`self_verified`/`admin_verified` → badge; `unreviewed` → no badge, never a "trust" signal by default).
  - Automated **link-health cron**: periodically HEAD/GET-check `listing.entry_url` and `listing.official_rules_url`; on repeated failure, auto-transition or auto-file a `report` with `reason_code = 'broken_entry_link'` and `ai_severity` set, feeding the existing admin `report` review queue (`app/admin/reports`) instead of waiting on user reports.
  - AI-assisted triage: use `report.ai_severity` (already `low`/`medium`/`high`/`critical`) to auto-prioritize the admin review queue and auto-escalate `critical` (e.g. `scam_suspicious`, `fake_winner_claim`) reports.
  - Duplicate detection already has a `duplicate_status` field (`clear`/`suspected`/`confirmed`) and a publish-guard trigger that blocks `confirmed` duplicates — extend with a nightly job comparing new listings' `entry_url`/`prize_name`/`host_id` against existing active listings to auto-flag `suspected`.
- **Effort:** M overall — badge surfacing is S, link-health cron is S, AI-triage integration is M (external LLM call + queue wiring).

### 4. One-tap / assisted entry (non-deceptive)

- **What:** Reduce entry friction without ever submitting a third-party host's entry form on the user's behalf without an explicit per-entry action.
- **Why it wins:** Sweeps Atlas's "Embark" (bulk-open entry links in tabs) is the closest incumbent feature and is well-liked by its users, but it's a generic bulk-tab-opener disconnected from memory state. Sweepza can do the same trick *integrated with the memory engine*: opening `entry_url` and immediately prompting "mark as entered?" writes straight to `listing_seeker_state.entered_at`, so the action and the memory update happen in one motion.
- **Implementation sketch:**
  - "Enter my Today list" button: sequentially opens each Today next-best-action's `entry_url` in a new tab/window and, on return-to-app or a lightweight confirm, sets `entered_at`/`primary_ui_state = 'entered'` on the corresponding `listing_seeker_state` row.
  - Optional profile autofill: a `seeker_profile` (new, minimal — name/email/mailing address the user opts to save) that a browser extension or copy-to-clipboard affordance can use to speed up filling host forms — copy/paste assist, not headless auto-submission.
  - Explicitly **not**: scripted/headless form-submission on host domains. See Non-Goals.
- **Effort:** S–M — the "mark entered" loop is mostly UI/state wiring against existing `listing_seeker_state`; the optional profile-autofill piece needs one new table.

### 5. Host self-serve liquidity (claim-your-sweepstakes + Stripe onboarding)

- **What:** Convert Sweepza's cold-start seed content into paying hosts, self-serve.
- **Why it wins:** Every competitor's host-side monetization researched (Contest Girl's "paid packages," Sweeties Sweeps) is manual/sales-contact-driven, not self-serve slotted SaaS. Sweepza already has the primitive for this: `listing.source_type = 'owner_seeded'` (found-by-Sweepza content, `public_source_label = 'found_by_sweepza'`) plus a `listing_claim` table and an `apply_listing_claim` trigger that reassigns `host_id`/`source_type`/`public_source_label` to `'claimed_host'`/`'claimed_by_host'` the moment a claim is approved.
- **Implementation sketch:**
  - Outbound: surface a "Are you the sponsor? Claim this listing" CTA on owner-seeded listings, which creates a `listing_claim` row (`status = 'requested'`) for the brand once they sign up as a `host`.
  - Inbound self-serve: Stripe Checkout → webhook creates/updates `subscription` (`included_active_listings`, `max_active_listings` capped at 10 per the existing `subscription_cap` constraint) → host dashboard (`app/host`) lets them submit listings against their slot cap, gated by the existing `listing_publish_guard` quality checks and `enforce_active_listing_cap` trigger.
  - This is the Airbnb/Zillow-style playbook: seed supply on day one (owner-seeded listings), then convert the real brand into a paying, self-service host once there's proven traffic to their listing.
- **Effort:** M — most of the hard constraint logic (cap enforcement, claim transfer, quality gate) already exists as DB triggers; the lift is the self-serve UI/Stripe Checkout flow and the outbound claim-invitation surface/emails.

### 6. Winner proof & social trust loop

- **What:** Make "I actually won" a visible, reactable, semi-verified public feed.
- **Why it wins:** No competitor researched has a consumer-facing social proof feed of real winners. This is close to free to build — `winner_post` (with `review_status`: `draft`→`submitted`→`pending_review`→`published`/`hidden`/`rejected`) and `winner_reaction` (`congrats`/`awesome`/`nice_win`/`celebration`) already exist end-to-end.
- **Implementation sketch:**
  - When `listing_seeker_state.won_at` gets set, trigger a next-best-action prompt: "You won [prize] — post proof?" → creates a `winner_post` in `draft`/`submitted`.
  - Public `Winners` feed (`app/winners`) ranked by recency + `winner_reaction` count; a `verified` badge only appears once `review_status = 'published'` through the moderation pipeline — never auto-verified from a raw user claim (see Risks).
  - Feeds host trust too: hosts whose listings generate real, verified winner posts are a stronger self-serve sales pitch than "trust us."
- **Effort:** S — almost entirely UI/prompt wiring against existing tables; no schema changes needed for v1.

### 7. Daily habit / streak loop

- **What:** A lightweight, honest consistency mechanic layered onto the Today dashboard.
- **Why it wins:** Every incumbent's retention loop is an email digest, not the product itself. A lot of daily-entry sweeps literally reward daily habits (30x more chances/month per daily entry, per Sweepstakes Advantage's own positioning) — Sweepza is positioned to be the app that makes that habit frictionless and visible.
- **Implementation sketch:**
  - Compute a streak directly from real `listing_seeker_state.entered_at` timestamps (distinct calendar days with at least one entry) — no separate "check-in" action, so the streak can't be gamed by opening the app without doing anything real.
  - Surface on Today dashboard ("5-day streak") and optionally in a weekly-roundup notification (`notification_pref.weekly_roundup` already exists).
  - Must stay honest: no fake urgency, no punishing streak-loss messaging that borders on dark pattern (see Non-Goals).
- **Effort:** S–M — a small computed/cached streak value (new column or lightweight materialized query over `listing_seeker_state`), plus dashboard UI.

### 8. Mobile-native shell + push infrastructure

- **What:** A real push channel and a native (or app-like PWA) mobile presence.
- **Why it wins:** Confirmed whitespace — "sweepstakes app" app-store search results are dominated by unrelated sweepstakes-casino gambling apps; there is no credible native mobile presence for legitimate no-purchase-necessary sweepstakes discovery. Push is also what makes Move 1's reminders actually proactive instead of email-only (email open rates are weak for daily nudges).
- **Implementation sketch:**
  - Schema gap to close first: `notification_channel` enum currently only has `('in_app', 'email')` — no `'push'` value — despite `notification_pref.push_enabled` already existing as a column. Needs a migration adding `'push'` to the enum plus a new `push_subscription` table (endpoint/keys for web push, or device tokens for native) keyed to `app_user_id`.
  - Web push first (service worker + VAPID keys) is the cheaper path to "push works today"; a wrapped/native shell (Expo/Capacitor) around the existing Next.js app is the fuller mobile-native bet.
  - Once push exists, Move 1's cron simply adds `'push'` as a third channel option per `notification_pref`.
- **Effort:** L — real schema migration, new subscription-management surface, and either a service-worker build or a native shell project.

---

## 4. Honest risks & non-goals

**Legal / compliance**
- Sweepza is a **directory/aggregator**, not the sponsor. State registration/bonding obligations (FL, NY, RI require registration above $5,000 total prize value — RI's retail-promotion threshold is $500 — with bonding equal to prize value in FL/NY) are the **host's** legal responsibility, not Sweepza's. The schema already models `no_purchase_necessary`, `official_rules_url`/`official_rules_exception`, `eligibility_country`, `eligibility_states`, and `age_requirement` — but today's `listing_publish_guard` only hard-requires `eligibility_country`, not `eligibility_states` or a true no-purchase confirmation. Tightening the publish gate to require an explicit no-purchase/AMOE affirmation before `lifecycle_status = 'active'` is cheap insurance against unknowingly hosting an illegal "pay-to-enter" lottery.
- Any "assisted entry" feature (Move 4) must never auto-submit a host's entry form without an explicit human action per entry — doing so risks (a) violating the host's own terms of service, (b) being indistinguishable from bot/fraud entry and getting real users disqualified, and (c) undermining AMOE equal-treatment if the automated path is faster/easier than the free alternate method.

**Anti-abuse**
- Cadence gaming: nothing currently stops a user from creating multiple `app_user` rows to bypass `entry_frequency` limits (re-entering a `one_time`/`daily` sweep repeatedly). Multi-account detection (Clerk-level signals, device fingerprinting) should be considered before Move 1's reminders make re-entry even easier to act on.
- Fake winner claims: `report_reason` already anticipates this exact abuse (`fake_winner_claim`, and even `host_advertising_winner_wall` — hosts pressuring/paying for winner-wall posts). Move 6 must gate any "verified" badge strictly behind `winner_review_status = 'published'` through admin moderation, never auto-verify a raw claim.

**Deliberate non-goals**
- Never auto-enter a sweepstakes on a user's behalf without an explicit, per-entry human action (see above) — this is a bright line, not a v1-vs-later tradeoff.
- Never fabricate or imply a winner post is verified before it clears `winner_review_status = 'published'`.
- Never gate the memory engine, reminders, or an ad-free consumer experience behind a consumer paywall. This is the structural difference from Sweepstakes Advantage's "Plus" and Sweeties Sweeps' "$40/yr Secret" tiers, and it's core to the free-to-seeker/host-pays thesis — don't compromise it even under revenue pressure.
- Never sell user PII/entry data to third-party advertisers — a recurring complaint pattern in competitor reviews (spam after entering).
- Don't chase the "sweepstakes casino" app-store category (real-money-adjacent gambling mechanics). It's a different product with different regulatory exposure; Sweepza's whitespace is specifically *legitimate, no-purchase-necessary* sweepstakes, and blurring that line would undercut the trust positioning that's the whole point of Move 3.

---

## 5. Recommended next build wave

**1. Proactive multi-channel reminders (Move 1, email + in-app only).** Lowest lift on the list — `notification_pref`, `notification_log`, and the email-send pattern already exist; the only new code is the cadence-math cron and a seeker-facing counterpart to `sendHostNotification`. It is also the most direct, literal expression of "Sweepza remembers so you don't have to." Ship this first.

**2. Trust & verification surfacing (Move 3, badges + link-health cron; defer AI-triage).** The single most repeated weakness across every competitor researched, and Sweepza already has the columns (`host.verification_status`, `listing.listing_verification_status`, `report`) sitting mostly unused at the UI layer. Needed before leaning into Move 5's host-acquisition push — trust signal is part of what justifies paid host placement.

**3. Winner proof & social trust loop (Move 6).** Nearly free (schema-complete, `winner_post`/`winner_reaction` already built), and it's a differentiator no competitor researched has at all. It's also a cheap word-of-mouth/organic growth lever — real winners sharing real proof — that compounds once Move 1 is driving more completed entries to win from.

Personalized ranking (Move 2) and host self-serve liquidity (Move 5) are the natural next wave once there's real usage data to rank against and a trust layer to sell against. One-tap entry (Move 4) and the mobile-native/push shell (Move 8) are bigger infrastructure bets best sequenced after the core loop (reminders → trust → winner proof) is proven to retain and convert.
