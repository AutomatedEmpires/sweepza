/**
 * Orders the mutating Stripe provisioner so every refusal/read-only discovery
 * completes and the local secret destination is exclusively reserved before
 * the first provider write.
 */
export async function runProvisioningWorkflow({
  preflight,
  expectedAccountId,
  retrieveAccount,
  discover,
  needsSecretOutput,
  reserveSecretOutput,
  mutate,
  releaseSecretOutput,
}) {
  if (!preflight.ok) {
    throw new Error(preflight.errors.join(" "));
  }

  const account = await retrieveAccount();
  if (account.id !== expectedAccountId) {
    throw new Error(
      `Authenticated Stripe account ${account.id} does not match expected ${expectedAccountId}.`,
    );
  }

  const discovery = await discover();
  const reservation = needsSecretOutput(discovery)
    ? reserveSecretOutput()
    : null;
  let keepSecretOutput = false;
  try {
    const result = await mutate(discovery, reservation);
    keepSecretOutput = result.keepSecretOutput === true;
    return { account, ...result };
  } finally {
    if (reservation !== null) {
      releaseSecretOutput(reservation, { keepSecretOutput });
    }
  }
}

/**
 * Exhausts a Stripe cursor list with a hard page ceiling. List endpoints are
 * strongly consistent and are safe for read-before-create reconciliation.
 */
export async function listAllStripePages(
  fetchPage,
  { label, maxPages = 100 },
) {
  const items = [];
  let startingAfter;
  for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
    const page = await fetchPage(startingAfter);
    items.push(...page.data);
    if (!page.has_more) return items;
    const last = page.data.at(-1);
    if (!last?.id) {
      throw new Error(`Refusing invalid ${label} pagination response.`);
    }
    startingAfter = last.id;
  }
  throw new Error(
    `Refusing ${label} discovery after ${maxPages} pages; operator review is required.`,
  );
}

/**
 * Persists the one-time webhook secret. If persistence fails, a failed
 * provider rollback is surfaced with the orphan endpoint id for cleanup.
 */
export async function persistWebhookSecretWithRollback({
  endpoint,
  secretFd,
  writeSecret,
  deleteEndpoint,
}) {
  try {
    writeSecret(secretFd, endpoint.secret);
  } catch (writeError) {
    try {
      await deleteEndpoint(endpoint.id);
    } catch (rollbackError) {
      const rollbackMessage =
        rollbackError instanceof Error ? rollbackError.message : "unknown error";
      throw new Error(
        `Webhook ${endpoint.id} was created, but secret persistence and rollback both failed. Remove the orphan endpoint before retrying. Rollback error: ${rollbackMessage}`,
        { cause: writeError },
      );
    }
    throw writeError;
  }
}
