# AI Review Agents

## Purpose
Sweepza uses AI agents as repeatable implementation and review layers. They do not replace CI, branch protection, or founder approval gates.

## Copilot
- Ready when GitHub Copilot is enabled for the repo and `.github/copilot-instructions.md` is present.
- Best used for PR review comments, narrow follow-up fixes, and scoped implementation assistance.
- Current limitation: Copilot review is advisory until branch protection requires the relevant status checks.

## Codex
- Ready because `AGENTS.md` defines the repo contract and acceptance criteria flow.
- Best used for local repo implementation, debugging, and code review against the canonical `listing` model.
- Current limitation: tasks still need durable issue or PR artifacts; chat-only context is not sufficient.

## Claude
- Ready because `CLAUDE.md` exists and defers to `AGENTS.md`.
- Best used for scoped implementation or review where the source of truth is explicit.
- Current limitation: no GitHub-side Claude automation is configured in this repo yet.

## Shared Rules
- Agents do not auto-merge.
- Agents do not deploy.
- Agents do not bypass founder approval gates.
- CI remains the executable source of validation truth.
- Branch protection remains the merge control plane.