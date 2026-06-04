# Notion → GitHub Issue Dispatcher

Dispatches **Ready-for-Engineering** tasks from Notion into GitHub issues
for `AutomatedEmpires/sweepza`, and writes the issue URL back to the Notion
source page so the baton is visible to the next agent.

## What it does

Exposes one Notion Worker tool, `dispatchTaskToGithub`, callable by the Notion
Custom Agent. Given a Notion handoff it:

1. Builds a GitHub issue body using the handoff-protocol template
   (Source of truth / Goal / Scope (in) / Out of scope / Acceptance criteria /
   Founder approval gate).
2. Creates the issue via the GitHub REST API.
3. Writes the created issue URL back to the Notion source page.
4. Returns `{ issueUrl, issueNumber, title, labels, notionWriteBack }`.

Auto labels: `ready-for-engineering`, `source:notion`, plus `priority:<p>` and
`agent:<type>` when supplied, merged with any extra labels and de-duplicated.

This is a **write** tool (no `readOnlyHint`), so it prompts for confirmation
before creating an issue.

## Configuration

Set via `ntn workers env set KEY=value` (or a local `.env`, see `.env.example`):

| Variable | Required | Notes |
| --- | --- | --- |
| `GITHUB_TOKEN` | yes | Fine-grained PAT, **Issues: Read and write** on `AutomatedEmpires/sweepza`. |
| `GITHUB_OWNER` | no | Defaults to `AutomatedEmpires`. |
| `GITHUB_REPO` | no | Defaults to `sweepza`. |
| `NOTION_API_TOKEN` | local only | Set automatically by the platform when the tool runs inside the Custom Agent. Only needed for `ntn workers exec` / local testing. |

The write-back targets a Notion **URL property** named `GitHub Issue` by default;
override per-call with `issueUrlProperty`, or pass `notionPageId: null` to skip.

## Develop

```bash
pnpm --filter @sweepza/notion-github-issue-dispatcher check   # tsc --noEmit
ntn doctor
ntn workers exec dispatchTaskToGithub -d '{ ... }' --local --dotenv
```

## Deploy (on-demand worker.tool — keep as is until production ready)

```bash
ntn workers deploy
```

> ⚠️ Deploying Notion Workers requires a **Business plan or above**. The tool is
> complete, but it cannot run in production until the workspace plan allows it.
> Keep this as an on-demand `worker.tool` until it's needed in production.

## Notes

- This package is intentionally **not** in the root `pnpm-workspace.yaml`; it
  type-checks standalone via its own `check` script.
- `workers.json` records the Notion workspace ID. After the first `ntn workers
  deploy`, the generated `workerId` will be written back to this file and
  committed.
