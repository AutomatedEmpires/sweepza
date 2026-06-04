import { Worker } from "@notionhq/workers"
import * as Schema from "@notionhq/workers/schema"
import * as Builder from "@notionhq/workers/builder"

/**
 * GitHub → Notion mirror sync.
 *
 * Mirrors every issue and pull request from the Sweepza repo into a
 * managed Notion database, refreshed on a schedule. One direction only: this
 * worker never writes to GitHub, so it can't corrupt implementation truth.
 *
 * Source of truth: Notion canon page "GitHub → Notion Sync Worker — Build Pack".
 * API verified against https://developers.notion.com/workers/reference/schema
 */

const worker = new Worker()
export default worker

const GITHUB_API = "https://api.github.com"
const OWNER = process.env.GITHUB_OWNER ?? "AutomatedEmpires"
const REPO = process.env.GITHUB_REPO ?? "sweepza"
const PER_PAGE = 50

const repoItems = worker.database("repoItems", {
  type: "managed",
  initialTitle: "Sweepza — GitHub",
  primaryKeyProperty: "Node ID",
  schema: {
    properties: {
      Title: Schema.title(),
      "Node ID": Schema.richText(),
      Number: Schema.number(),
      Type: Schema.select([
        { name: "Pull Request", color: "purple" },
        { name: "Issue", color: "blue" },
      ]),
      State: Schema.select([
        { name: "Open", color: "green" },
        { name: "Closed", color: "red" },
        { name: "Merged", color: "purple" },
      ]),
      Author: Schema.richText(),
      Labels: Schema.richText(),
      Branch: Schema.richText(),
      URL: Schema.url(),
      Created: Schema.date(),
      Updated: Schema.date(),
    },
  },
})

interface GitHubUser {
  login?: string
}

interface GitHubLabel {
  name?: string
}

interface GitHubIssue {
  node_id: string
  number: number
  title: string
  state: string
  user?: GitHubUser | null
  labels?: GitHubLabel[]
  html_url: string
  created_at: string
  updated_at: string
  pull_request?: unknown
}

interface GitHubPull {
  node_id: string
  number: number
  title: string
  state: string
  merged_at?: string | null
  user?: GitHubUser | null
  labels?: GitHubLabel[]
  head?: { ref?: string } | null
  html_url: string
  created_at: string
  updated_at: string
}

async function gh<T>(path: string): Promise<T[]> {
  const token = process.env.GITHUB_TOKEN
  if (!token) throw new Error("Missing required env var: GITHUB_TOKEN")

  const response = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: ["Bearer", token].join(" "),
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "sweepza-github-notion-sync",
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`GitHub API error ${response.status}: ${body}`)
  }

  const data = (await response.json()) as T[]
  return data
}

const labelsToString = (labels?: GitHubLabel[]) =>
  (labels ?? [])
    .map((label) => label.name?.trim())
    .filter((name): name is string => Boolean(name))
    .join(", ")

worker.sync("githubSync", { mode: "replace", schedule: "30m" }, async () => {
  for (let page = 1; ; page += 1) {
    const issues = await gh<GitHubIssue>(
      `/repos/${OWNER}/${REPO}/issues?state=all&per_page=${PER_PAGE}&page=${page}`,
    )
    if (issues.length === 0) break

    for (const issue of issues) {
      if (issue.pull_request) continue

      await repoItems.upsert(
        Builder.row({
          Title: issue.title,
          "Node ID": issue.node_id,
          Number: issue.number,
          Type: "Issue",
          State: issue.state === "open" ? "Open" : "Closed",
          Author: issue.user?.login ?? "",
          Labels: labelsToString(issue.labels),
          Branch: "",
          URL: issue.html_url,
          Created: issue.created_at,
          Updated: issue.updated_at,
        }),
      )
    }
  }

  for (let page = 1; ; page += 1) {
    const pulls = await gh<GitHubPull>(
      `/repos/${OWNER}/${REPO}/pulls?state=all&per_page=${PER_PAGE}&page=${page}`,
    )
    if (pulls.length === 0) break

    for (const pull of pulls) {
      const state = pull.merged_at ? "Merged" : pull.state === "open" ? "Open" : "Closed"
      await repoItems.upsert(
        Builder.row({
          Title: pull.title,
          "Node ID": pull.node_id,
          Number: pull.number,
          Type: "Pull Request",
          State: state,
          Author: pull.user?.login ?? "",
          Labels: labelsToString(pull.labels),
          Branch: pull.head?.ref ?? "",
          URL: pull.html_url,
          Created: pull.created_at,
          Updated: pull.updated_at,
        }),
      )
    }
  }
})
