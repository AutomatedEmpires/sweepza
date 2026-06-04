# GitHub → Notion Sync Worker

Mirrors every **issue** and **pull request** from `AutomatedEmpires/sweepza`
into a managed Notion database, refreshed on a schedule.

One direction only: this worker never writes to GitHub, so it can't corrupt
implementation truth. The reverse (Notion → GitHub) is the separate
`notion-github-issue-dispatcher` worker.

## What it does

- Declares one managed Notion database, `Sweepza — GitHub`, keyed on the
  GitHub `node_id` (unique across issues and PRs).
- `worker.sync("githubSync", { mode: "replace", schedule: "30m" })` re-fetches
  all issues and PRs every 30 minutes. `replace` mode prunes anything not seen
  in a cycle, so closed/deleted items fall out automatically.
- Two phases per cycle: issues first (PRs are filtered out of the issues
  endpoint), then pulls (needed to tell **Merged** apart from **Closed**).

## Configuration

Set via `ntn workers env set KEY=value` (or a local `.env`, see `.env.example`):

| Variable | Required | Notes |
| --- | --- | --- |
| `GITHUB_TOKEN` | yes | PAT with **repo: read** (fine-grained, scoped to the one repo is ideal). |
| `GITHUB_OWNER` | no | Defaults to `AutomatedEmpires`. |
| `GITHUB_REPO` | no | Defaults to `sweepza`. |

## Develop / deploy

```bash
cd tools/github-notion-sync
pnpm install --frozen-lockfile=false
pnpm check        # tsc --noEmit
pnpm build        # emit dist/ for hosted deploys
ntn doctor
ntn workers sync trigger githubSync --preview   # dry run, writes nothing
ntn workers deploy                              # creates the managed DB
```

> ⚠️ Deploying Notion Workers requires a **Business plan or above**. The CLI and
> local testing work on any plan; hosted deploy does not.

## Notes

- This package is intentionally **not** in any root pnpm workspace; it
  type-checks standalone via its own `check` script. `build` emits `dist/` for
  hosted `ntn workers deploy`.
- `workers.json` records the Notion workspace ID. After the first `ntn workers
  deploy`, the generated `workerId` will be written back to this file and
  committed.
