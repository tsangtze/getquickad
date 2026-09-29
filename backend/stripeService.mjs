import Stripe from "stripe";

function cleanEnvironmentValue(value) {
  return String(value ?? "").trim();
}

export function createStripeClient() {
  const secretKey =
    cleanEnvironmentValue(
      process.env.STRIPE_SECRET_KEY
    );

  if (!secretKey) {
    const error =
      new Error(
        "Stripe billing is not configured."
      );

    error.code =
      "STRIPE_NOT_CONFIGURED";

    throw error;
  }

  return new Stripe(secretKey);
}

function isStripeResourceMissing(error) {
  return (
    error?.code === "resource_missing" ||
    (
      error?.statusCode === 404 &&
      error?.raw?.code === "resource_missing"
    )
  );
}

export async function cancelStripeSubscriptionForAccountDeletion(
  subscriptionId,
  {
    cancelSubscription = null
  } = {}
) {
  const normalizedSubscriptionId =
    String(subscriptionId ?? "").trim();

  if (!normalizedSubscriptionId) {
    return {
      canceled: false,
      missing: false
    };
  }

  let cancel =
    cancelSubscription;

  if (!cancel) {
    const stripe =
      createStripeClient();

    cancel =
      (id) =>
        stripe.subscriptions.cancel(id);
  }

  try {
    await cancel(
      normalizedSubscriptionId
    );

    return {
      canceled: true,
      missing: false
    };
  } catch (error) {
    if (isStripeResourceMissing(error)) {
      return {
        canceled: false,
        missing: true
      };
    }

    throw error;
  }
}
