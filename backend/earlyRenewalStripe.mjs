function requiredText(
  value,
  code,
  message
) {
  const normalized =
    String(value || "").trim();

  if (!normalized) {
    const error = new Error(message);
    error.code = code;
    throw error;
  }

  return normalized;
}

export function earlyRenewalIdempotencyKey(
  operationId
) {
  const normalizedOperationId =
    requiredText(
      operationId,
      "EARLY_RENEWAL_OPERATION_ID_REQUIRED",
      "Early Renewal operation ID is required."
    );

  return `pix2vid-early-renewal-${normalizedOperationId}`;
}

export async function startEarlyRenewalStripePeriod({
  stripeSubscriptionId,
  operationId,
  updateSubscription
}) {
  const normalizedSubscriptionId =
    requiredText(
      stripeSubscriptionId,
      "EARLY_RENEWAL_SUBSCRIPTION_ID_REQUIRED",
      "Stripe subscription ID is required."
    );

  if (typeof updateSubscription !== "function") {
    const error =
      new Error(
        "Stripe subscription update function is required."
      );

    error.code =
      "EARLY_RENEWAL_STRIPE_UPDATE_REQUIRED";

    throw error;
  }

  const idempotencyKey =
    earlyRenewalIdempotencyKey(operationId);

  return updateSubscription(
    normalizedSubscriptionId,
    {
      billing_cycle_anchor: "now",
      proration_behavior: "none",
      payment_behavior: "error_if_incomplete"
    },
    {
      idempotencyKey
    }
  );
}