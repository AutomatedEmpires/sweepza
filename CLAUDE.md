# Claude — Sweepza

Read **`AGENTS.md`** first. It is binding. This file only adds Claude-specific notes.

- When mentioned with `@claude` on an issue or PR, implement against the issue's **acceptance criteria** and the locked canon referenced in `AGENTS.md`. If acceptance criteria are missing or ambiguous, ask in a comment instead of guessing.
- Work on a feature branch (`feat/<lane>/<slug>`) and open a PR against `main`. Never push directly to `main`.
- Honor the architectural law: one canonical `listing` object, controlled dictionaries (no free-text taxonomy), seeker state in `listing_seeker_state`, RLS server-enforced.
- Never commit secrets. Reference env through `lib/env.ts`; document any new env var in `.env.example`.
- Keep changes scoped to the lane. Mobile-first, accessible, SEO-aware, TypeScript strict. Ensure `pnpm build` passes.
