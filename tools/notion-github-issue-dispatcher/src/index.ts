import { Worker } from "@notionhq/workers"
import { j } from "@notionhq/workers/schema-builder"

/**
 * Notion → GitHub Issue Dispatcher.
 *
 * A Notion task that is `Ready for Engineering` is dispatched into a GitHub
 * issue, and the created issue URL is written back into the Notion source page
 * so the baton is visible to the next agent.
 *
 * Unlike a pure payload formatter, this tool performs the real side effects:
 *   1. Creates the GitHub issue via the REST API.
 *   2. Writes the issue URL back to Notion via the platform-provided client.
 */

const worker = new Worker()

const PRIORITIES = ["p0", "p1", "p2", "p3"] as const
const AGENT_TYPES = ["copilot", "codex", "cursor", "claude"] as const

type Priority = (typeof PRIORITIES)[number]
type AgentType = (typeof AGENT_TYPES)[number]

interface DispatchInput {
  notionSourceUrl: string
  notionPageId: string | null
  issueUrlProperty: string | null
  title: string | null
  goal: string
  inScope: string[]
  outOfScope: string[] | null
  acceptanceCriteria: string[]
  founderApprovalGate: string | null
  labels: string[] | null
  priority: Priority | null
  agentType: AgentType | null
}

function clean(items: string[] | null | undefined): string[] {
  return (items ?? []).map((i) => i.trim()).filter((i) => i.length > 0)
}

function deriveTitle(goal: string, explicit: string | null): string {
  const base = (explicit?.trim() || goal.trim()).replace(/\s+/g, " ")
  const firstLine = base.split("\n")[0] ?? base
  return firstLine.length > 70 ? `${firstLine.slice(0, 67)}...` : firstLine
}

function bulletList(items: string[], empty = "_None_"): string {
  const rows = clean(items)
  return rows.length === 0 ? empty : rows.map((i) => `- ${i}`).join("\n")
}

function checklist(items: string[]): string {
  const rows = clean(items)
  return rows.length === 0
    ? "- [ ] _Define acceptance criteria_"
    : rows.map((i) => `- [ ] ${i}`).join("\n")
}

function buildBody(input: DispatchInput): string {
  return [
    "## Source of truth",
    input.notionSourceUrl.trim(),
    "",
    "## Goal",
    input.goal.trim(),
    "",
    "## Scope (in)",
    bulletList(input.inScope),
    "",
    "## Out of scope / forbidden",
    bulletList(input.outOfScope ?? []),
    "",
    "## Acceptance criteria",
    checklist(input.acceptanceCriteria),
    "",
    "## Founder approval gate?",
    input.founderApprovalGate?.trim() || "none",
    "",
    "---",
    "_Dispatched from Notion by the Notion → GitHub Issue Dispatcher._",
  ].join("\n")
}

function buildLabels(input: DispatchInput): string[] {
  const labels = new Set<string>(["ready-for-engineering", "source:notion"])
  if (input.priority) labels.add(`priority:${input.priority}`)
  if (input.agentType) labels.add(`agent:${input.agentType}`)
  for (const raw of input.labels ?? []) {
    const t = raw.trim().toLowerCase()
    if (t) labels.add(t)
  }
  return [...labels]
}

worker.tool("dispatchTaskToGithub", {
  title: "Dispatch task to GitHub",
  description:
    "Create a GitHub issue from a Notion handoff (Ready for Engineering) for the Sweepza repo, then write the created issue URL back to the Notion source page. This creates a real issue — confirm before running.",
  schema: j.object({
    notionSourceUrl: j
      .string()
      .describe("URL of the Notion canon/source-of-truth page for this task."),
    notionPageId: j
      .string()
      .nullable()
      .describe(
        "Notion page ID to write the issue URL back to. Pass null to skip write-back.",
      ),
    issueUrlProperty: j
      .string()
      .nullable()
      .describe(
        "Name of the Notion URL property to store the issue link. Defaults to 'GitHub Issue'.",
      ),
    title: j
      .string()
      .nullable()
      .describe("Explicit issue title. If null, derived from the goal."),
    goal: j.string().describe("One-sentence outcome for this unit of work."),
    inScope: j
      .array(j.string(), { minItems: 1 })
      .describe("In-scope items (at least one)."),
    outOfScope: j
      .array(j.string())
      .nullable()
      .describe("Out-of-scope / forbidden items."),
    acceptanceCriteria: j
      .array(j.string(), { minItems: 1 })
      .describe("Acceptance criteria, rendered as a checklist (at least one)."),
    founderApprovalGate: j
      .string()
      .nullable()
      .describe("'none' or the name of the founder approval gate that applies."),
    labels: j
      .array(j.string())
      .nullable()
      .describe("Extra labels. Merged with auto labels and de-duplicated."),
    priority: j
      .enum(...PRIORITIES)
      .nullable()
      .describe("Priority; becomes a priority:<p> label."),
    agentType: j
      .enum(...AGENT_TYPES)
      .nullable()
      .describe("Target coding agent; becomes an agent:<type> label."),
  }),
  outputSchema: j.object({
    issueUrl: j.string(),
    issueNumber: j.integer(),
    title: j.string(),
    labels: j.array(j.string()),
    notionWriteBack: j.enum("updated", "skipped", "failed"),
  }),
  execute: async (input, { notion }) => {
    const dispatchInput = input as DispatchInput
    const token = process.env.GITHUB_TOKEN
    if (!token) {
      throw new Error(
        "GITHUB_TOKEN is not set. Run: ntn workers env set GITHUB_TOKEN=<fine-grained PAT>",
      )
    }
    const owner = process.env.GITHUB_OWNER ?? "AutomatedEmpires"
    const repo = process.env.GITHUB_REPO ?? "sweepza"

    if (clean(dispatchInput.inScope).length === 0) {
      throw new Error("inScope must contain at least one non-empty item.")
    }
    if (clean(dispatchInput.acceptanceCriteria).length === 0) {
      throw new Error(
        "acceptanceCriteria must contain at least one non-empty item.",
      )
    }

    const title = deriveTitle(dispatchInput.goal, dispatchInput.title)
    const body = buildBody(dispatchInput)
    const labels = buildLabels(dispatchInput)

    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: ["Bearer", token].join(" "),
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        "User-Agent": "sweepza-issue-dispatcher",
      },
      body: JSON.stringify({ title, body, labels }),
    })

    if (!res.ok) {
      const detail = await res.text()
      throw new Error(
        `GitHub issue creation failed (${res.status} ${res.statusText}): ${detail}`,
      )
    }

    const issue = (await res.json()) as { html_url: string; number: number }

    let notionWriteBack: "updated" | "skipped" | "failed" = "skipped"
    if (dispatchInput.notionPageId) {
      const prop = dispatchInput.issueUrlProperty?.trim() || "GitHub Issue"
      try {
        await notion.pages.update({
          page_id: dispatchInput.notionPageId,
          properties: { [prop]: { url: issue.html_url } },
        })
        notionWriteBack = "updated"
      } catch (err) {
        console.error("Notion write-back failed:", err)
        notionWriteBack = "failed"
      }
    }

    return {
      issueUrl: issue.html_url,
      issueNumber: issue.number,
      title,
      labels,
      notionWriteBack,
    }
  },
})

export default worker
