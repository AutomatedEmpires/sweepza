#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_NAME="sweepza"
DOPPLER_PROJECT="sweepza"
VERCEL_SCOPE="${VERCEL_SCOPE:-jackson-coles-projects-dd76106c}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

looks_like_placeholder() {
  local value="$1"
  [[ "$value" =~ (replace_me|SWEEPZ|YOUR_|PLACEHOLDER|placeholder|dummy|example) ]]
}

vercel_sensitivity_flag() {
  local key="$1"
  local vercel_env="$2"

  case "$key" in
    SUPABASE_SERVICE_ROLE_KEY|CLERK_SECRET_KEY|CLERK_WEBHOOK_SECRET|STRIPE_SECRET_KEY|STRIPE_WEBHOOK_SECRET|SENTRY_AUTH_TOKEN|RESEND_API_KEY|CRON_SECRET|GITHUB_TOKEN)
      if [ "$vercel_env" != "development" ]; then
        echo "--sensitive"
        return 0
      fi
      ;;
  esac

  echo "--no-sensitive"
}

read_project_field() {
  local field="$1"
  node -e '
    const fs = require("fs");
    const path = process.argv[1];
    const field = process.argv[2];
    const data = JSON.parse(fs.readFileSync(path, "utf8"));
    process.stdout.write(String(data[field] ?? ""));
  ' "$ROOT_DIR/.vercel/project.json" "$field"
}

upsert_vercel_env() {
  local key="$1"
  local vercel_env="$2"
  local value="$3"
  local add_command
  local sensitivity_flag

  if [ -z "$value" ]; then
    echo "Skipping $key for $vercel_env because no value was provided."
    return 0
  fi

  if looks_like_placeholder "$value"; then
    echo "Skipping $key for $vercel_env because the value still looks like a placeholder."
    return 0
  fi

  sensitivity_flag="$(vercel_sensitivity_flag "$key" "$vercel_env")"
  vercel env rm "$key" "$vercel_env" --yes --scope "$VERCEL_SCOPE" >/dev/null 2>&1 || true

  if [ "$vercel_env" = "preview" ]; then
    add_command="vercel env add $key $vercel_env $sensitivity_flag --value '$value' --scope $VERCEL_SCOPE"
    script -qec "$add_command" /dev/null <<< "" >/dev/null
  else
    vercel env add "$key" "$vercel_env" "$sensitivity_flag" --value "$value" --yes --scope "$VERCEL_SCOPE" >/dev/null
  fi

  echo "Synced $key -> $vercel_env"
}

read_doppler_secret() {
  local key="$1"
  local doppler_config="$2"

  doppler secrets get "$key" \
    --project "$DOPPLER_PROJECT" \
    --config "$doppler_config" \
    --plain 2>/dev/null || true
}

sync_secret_from_doppler() {
  local key="$1"
  local vercel_env="$2"
  local doppler_config="$3"
  local value

  value="$(read_doppler_secret "$key" "$doppler_config")"
  upsert_vercel_env "$key" "$vercel_env" "$value"
}

sync_env_group() {
  local vercel_env="$1"
  local doppler_config="$2"
  local base_keys=(
    NEXT_PUBLIC_APP_URL
    NEXT_PUBLIC_SUPABASE_URL
    NEXT_PUBLIC_SUPABASE_ANON_KEY
    SUPABASE_SERVICE_ROLE_KEY
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
    CLERK_SECRET_KEY
    CLERK_WEBHOOK_SECRET
    STRIPE_SECRET_KEY
    STRIPE_ACCOUNT_ID
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
    STRIPE_WEBHOOK_SECRET
    STRIPE_PRICE_HOST_BASELINE
    STRIPE_PRICE_ADDITIONAL_LISTING
    NEXT_PUBLIC_POSTHOG_KEY
    NEXT_PUBLIC_POSTHOG_HOST
    NEXT_PUBLIC_SENTRY_DSN
    SENTRY_ORG
    SENTRY_PROJECT
    SENTRY_AUTH_TOKEN
    RESEND_API_KEY
    RESEND_FROM_EMAIL
    RESEND_REPLY_TO_EMAIL
    CRON_SECRET
    GITHUB_OWNER
    GITHUB_REPO
    GITHUB_TOKEN
  )

  # PAYMENTS_ENABLED is intentionally excluded. A routine bulk secret sync
  # must never become live-money activation authority; that gate is changed
  # only through a separate founder-approved operation.
  # OUTBOUND_EMAIL_ENABLED is excluded for the same reason. Provisioning the
  # Resend tuple must never become authority to send mail.
  # EMAIL_OUTBOX_SCHEMA_READY is also excluded: it is set only after the two
  # durable email migrations and runtime authorization checks are verified.

  for key in "${base_keys[@]}"; do
    sync_secret_from_doppler "$key" "$vercel_env" "$doppler_config"
  done
}

require_command doppler
require_command vercel
require_command node

cd "$ROOT_DIR"

if [ ! -f "$ROOT_DIR/.vercel/project.json" ]; then
  echo "Missing .vercel/project.json. Link the Sweepza repo to Vercel first." >&2
  exit 1
fi

if [ "$(read_project_field projectName)" != "$PROJECT_NAME" ]; then
  echo "Refusing to sync because .vercel/project.json is not linked to $PROJECT_NAME." >&2
  exit 1
fi

sync_env_group "development" "dev"
sync_env_group "preview" "stg"
sync_env_group "production" "prd"

echo
echo "Sweepza Vercel env sync complete."
