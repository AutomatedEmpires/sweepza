# Agent Workflow

## Operating Model
- Notion is the product and spec backbone.
- GitHub Issues are the engineering queue.
- Branches and pull requests are the delivery path.
- VS Code agents implement and validate locally.
- GitHub Actions validates independently on GitHub-hosted runners.

## Baseline Flow
1. Product truth is locked in Notion.
2. A GitHub issue is created with acceptance criteria, risk, and verification commands.
3. An agent implements the issue on a feature branch.
4. A pull request is opened against `main`.
5. CI runs lint, typecheck, and build.
6. Copilot, Codex, or Claude review the PR.
7. After merge, status is reconciled back to Notion.

## Sweepza-specific rules
- Keep every slice anchored to the canonical `listing` object.
- Do not introduce free-text taxonomy or parallel seeker/host listing models.
- Treat RLS and server-side enforcement as non-negotiable.
- Do not fake test coverage; until meaningful tests exist, validation is lint + typecheck + build.

## Handoff standard
Every PR or issue handoff should state:
- source of truth
- scope
- validation commands
- pass/fail results
- next agent or reviewer