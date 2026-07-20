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
  const reservation = reserveSecretOutput();
  let keepSecretOutput = false;
  try {
    const result = await mutate(discovery, reservation);
    keepSecretOutput = result.keepSecretOutput === true;
    return { account, ...result };
  } finally {
    releaseSecretOutput(reservation, { keepSecretOutput });
  }
}
