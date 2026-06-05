# Repo Governance

## Current baseline
- PR template present
- CI workflow present
- Copilot instructions now present
- issue forms now present
- AI review and workflow docs now present

## Required controls for maturity
- protect `main`
- require current CI checks before merge
- disable force pushes on protected branches
- disable branch deletion on protected branches
- keep PR-based delivery as the only merge path

## Sensitive paths
Protect at least:
- `.github/`
- `AGENTS.md`
- `CLAUDE.md`
- workflow/governance docs
- Supabase schema and migration paths
- deployment or release configuration

## Review policy
- builder is not the sole approver
- AI reviews are advisory unless tied to required GitHub checks
- conversation resolution should be enabled once branch protection is tightened

## Known current limitation
Sweepza still lacks branch protection and meaningful automated test coverage. Until those land, the repo is only partially standardized.