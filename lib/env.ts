import { z } from "zod";

const schema = z.object({
  VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),
  CLERK_SECRET_KEY: z.string().optional(),
  CLERK_WEBHOOK_SECRET: z.string().optional(),
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_ACCOUNT_ID: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().optional(),
  STRIPE_PRICE_HOST_BASELINE: z.string().optional(),
  STRIPE_PRICE_ADDITIONAL_LISTING: z.string().optional(),
  /**
   * Master switch for all Stripe/live-money behavior. Only the literal string
   * "true" permits customer creation, Checkout, portal sessions, or webhook
   * mutation. Provider credentials alone never authorize payments.
   */
  PAYMENTS_ENABLED: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  NEXT_PUBLIC_POSTHOG_HOST: z.string().url().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  SENTRY_AUTH_TOKEN: z.string().optional(),
  SENTRY_ORG: z.string().optional(),
  SENTRY_PROJECT: z.string().optional(),
  GITHUB_TOKEN: z.string().optional(),
  GITHUB_OWNER: z.string().optional(),
  GITHUB_REPO: z.string().optional(),
  NOTION_API_TOKEN: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),
  RESEND_REPLY_TO_EMAIL: z.string().optional(),
  /**
   * Master switch for every outbound email path. Only the literal string
   * "true" permits a provider call. Credentials and sender identity alone
   * never authorize email delivery.
   */
  OUTBOUND_EMAIL_ENABLED: z.string().optional(),
  /**
   * Set only after the durable email-outbox migrations are applied. This lets
   * disabled transport crons purge expired payloads without making code deploy
   * order imply database activation.
   */
  EMAIL_OUTBOX_SCHEMA_READY: z.string().optional(),
  /** Bearer secret Vercel Cron sends to /api/cron/* routes. */
  CRON_SECRET: z.string().optional(),
  /** "true" flips CSP from report-only to enforcing (nonce-based). Redeploy required. */
  CSP_ENFORCE: z.string().optional(),
  /** Anthropic key for the ingestion extractor. Ingestion no-ops if unset. */
  ANTHROPIC_API_KEY: z.string().optional(),
  /** Override the extraction model (defaults to claude-opus-4-8). */
  INGEST_EXTRACTION_MODEL: z.string().optional(),
  /**
   * Master switch for live source ingestion. Execution requires the literal
   * string "true"; absent or anything else means ingestion no-ops. This is a
   * founder-controlled activation gate — code being merged never implies this
   * is set. Per-source compliance approval is still required on top.
   */
  INGESTION_ENABLED: z.string().optional(),
});

export const env = schema.parse(process.env);
export type Env = z.infer<typeof schema>;
