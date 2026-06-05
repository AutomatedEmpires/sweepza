# Copilot Instructions

## Role
You are a repo-scoped coding and review agent for Sweepza. Follow `AGENTS.md`, the PR template, and the linked issue acceptance criteria before making changes.

## Sweepza-specific defaults
- Preserve the canonical `listing` object. Do not create parallel listing models.
- Use controlled dictionaries for taxonomy and badge-like values. Do not add free-text alternatives.
- Treat Supabase RLS and server enforcement as the source of truth for access control.
- Keep changes narrow and lane-scoped. Do not widen scope to unrelated product areas.

## Review expectations
- Cite the Notion canon or repo source that governs the change.
- Run the narrowest relevant validation commands and report the real result.
- Call out missing tests, missing branch protection, or workflow drift when you see them.
- Do not claim test coverage exists where it does not.

## Safety
- Never commit secrets.
- Never merge, deploy, or mutate production settings.
- Treat auth, RLS, billing, payouts, moderation, and destructive schema changes as approval-gated work.

## Handoff
When finishing work, summarize:
- what changed
- what was validated
- what remains blocked
- which next reviewer or agent should act next