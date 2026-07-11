export const BASELINE_INCLUDED_ACTIVE_LISTINGS = 3;
export const MAX_ACTIVE_LISTINGS = 10;

export function isLiveStripeKey(key) {
  return /^(?:sk|rk)_live_/.test(key ?? "");
}

export function toLocalSubscriptionStatus(status) {
  switch (status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    case "paused":
    case "incomplete":
      return "grace";
    default:
      return "no_plan";
  }
}

function parseMetadataInteger(metadata, key) {
  const raw = metadata?.[key];
  if (typeof raw !== "string" || !/^\d+$/.test(raw)) return null;
  const value = Number.parseInt(raw, 10);
  return Number.isSafeInteger(value) ? value : null;
}

export function getPriceQuantity(subscription, priceId) {
  if (!priceId) return 0;
  return (subscription.items?.data ?? []).reduce(
    (total, item) =>
      item.price?.id === priceId ? total + (item.quantity ?? 0) : total,
    0,
  );
}

export function inspectSubscriptionEntitlement(
  subscription,
  baselinePriceId,
  additionalPriceId,
) {
  const baselineQuantity = getPriceQuantity(subscription, baselinePriceId);
  const additionalQuantity = getPriceQuantity(subscription, additionalPriceId);
  const included = parseMetadataInteger(
    subscription.metadata,
    "included_active_listings",
  );
  const purchased = parseMetadataInteger(
    subscription.metadata,
    "purchased_additional_listings",
  );
  const max = parseMetadataInteger(subscription.metadata, "max_active_listings");
  const expectedMax = BASELINE_INCLUDED_ACTIVE_LISTINGS + additionalQuantity;

  return {
    baselineQuantity,
    additionalQuantity,
    included,
    purchased,
    max,
    expectedMax,
    valid:
      baselineQuantity === 1 &&
      included === BASELINE_INCLUDED_ACTIVE_LISTINGS &&
      purchased === additionalQuantity &&
      max === expectedMax &&
      expectedMax <= MAX_ACTIVE_LISTINGS,
  };
}

export function isExpectedRecurringPrice(price, expected) {
  const product =
    price && typeof price.product === "object" && price.product !== null
      ? price.product
      : null;

  return Boolean(
    price?.livemode === true &&
      price.active === true &&
      price.unit_amount === expected.unitAmount &&
      price.currency === "usd" &&
      price.recurring?.interval === "month" &&
      price.recurring?.interval_count === 1 &&
      product &&
      product.deleted !== true &&
      product.active === true &&
      product.metadata?.venture === "sweepza" &&
      product.metadata?.sweepza_key === expected.lookupKey,
  );
}
