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
const MAX_PAGES = 100

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

worker.sync("githubSync", {
  database: repoItems,
  mode: "replace",
  schedule: "30m",
  execute: async () => {
    const changes = []

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const issues = await gh<GitHubIssue>(
      `/repos/${OWNER}/${REPO}/issues?state=all&per_page=${PER_PAGE}&page=${page}`,
    )
    if (issues.length === 0) break

    for (const issue of issues) {
      if (issue.pull_request) continue

      changes.push({
        type: "upsert" as const,
        key: issue.node_id,
        properties: {
          Title: Builder.title(issue.title),
          "Node ID": Builder.richText(issue.node_id),
          Number: Builder.number(issue.number),
          Type: Builder.select("Issue"),
          State: Builder.select(issue.state === "open" ? "Open" : "Closed"),
          Author: Builder.richText(issue.user?.login ?? ""),
          Labels: Builder.richText(labelsToString(issue.labels)),
          Branch: Builder.richText(""),
          URL: Builder.url(issue.html_url),
          Created: Builder.dateTime(issue.created_at),
          Updated: Builder.dateTime(issue.updated_at),
        },
        upstreamUpdatedAt: issue.updated_at,
      })
    }
  }

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const pulls = await gh<GitHubPull>(
      `/repos/${OWNER}/${REPO}/pulls?state=all&per_page=${PER_PAGE}&page=${page}`,
    )
    if (pulls.length === 0) break

    for (const pull of pulls) {
      const state = pull.merged_at ? "Merged" : pull.state === "open" ? "Open" : "Closed"
      changes.push({
        type: "upsert" as const,
        key: pull.node_id,
        properties: {
          Title: Builder.title(pull.title),
          "Node ID": Builder.richText(pull.node_id),
          Number: Builder.number(pull.number),
          Type: Builder.select("Pull Request"),
          State: Builder.select(state),
          Author: Builder.richText(pull.user?.login ?? ""),
          Labels: Builder.richText(labelsToString(pull.labels)),
          Branch: Builder.richText(pull.head?.ref ?? ""),
          URL: Builder.url(pull.html_url),
          Created: Builder.dateTime(pull.created_at),
          Updated: Builder.dateTime(pull.updated_at),
        },
        upstreamUpdatedAt: pull.updated_at,
      })
    }
  }

    return { changes, hasMore: false }
  },
})
