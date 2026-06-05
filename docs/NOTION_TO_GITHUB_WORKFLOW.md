# Notion to GitHub Workflow

## Purpose
Keep product planning in Notion and implementation execution in GitHub without letting Sweepza drift from canon.

## Baseline Flow
1. Product or architecture truth is approved in Notion.
2. A GitHub issue is created from that source of truth.
3. The issue includes acceptance criteria, risk level, and verification commands.
4. A feature branch and PR implement the issue.
5. GitHub Actions validates the PR on GitHub-hosted runners.
6. Review agents comment on the PR.
7. After merge, status is reconciled back to Notion.

## Required issue fields
- source of truth link
- task summary
- acceptance criteria
- out-of-scope note when needed
- verification commands
- risk level
- approval gate if relevant

## Sweepza-specific rule
If a task affects the canonical `listing` object, permissions/RLS, trust badges, billing/entitlements, or moderation behavior, the Notion source must be explicit before implementation starts.

## Worker guidance
- Start with safe issue creation and PR delivery.
- Do not let automation merge, deploy, or rewrite protected branches.
- Do not treat local audit notes as repo truth unless they are intentionally committed.