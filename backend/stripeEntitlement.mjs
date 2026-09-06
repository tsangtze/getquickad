import Stripe from "stripe";

import {
  PLAN_IDS,
  getUserUsage,
  getStripeBillingState,
  updateStripeSubscription
} from "./usageLimits.mjs";

function cleanEnvironmentValue(value) {
  return String(value ?? "").trim();
}

function stripeConfiguration() {
  return {
    secretKey:
      cleanEnvironmentValue(
        process.env.STRIPE_SECRET_KEY
      ),

    starterPriceId:
      cleanEnvironmentValue(
        process.env.STRIPE_STARTER_PRICE_ID
      ),

    proPriceId:
      cleanEnvironmentValue(
        process.env.STRIPE_PRO_PRICE_ID
      )
  };
}

function paidStatus(status) {
  return (
    status === "active" ||
    status === "trialing"
  );
}

function planFromSubscription(subscription) {
  const configuration =
    stripeConfiguration();

  const priceId =
    subscription?.items?.data?.[0]?.price?.id || "";

  if (
    priceId &&
    priceId === configuration.starterPriceId
  ) {
    return PLAN_IDS.STARTER;
  }

  if (
    priceId &&
    priceId === configuration.proPriceId
  ) {
    return PLAN_IDS.PRO;
  }

  const metadataPlan =
    String(
      subscription?.metadata?.planId || ""
    ).toLowerCase();

  if (metadataPlan === PLAN_IDS.STARTER) {
    return PLAN_IDS.STARTER;
  }

  if (metadataPlan === PLAN_IDS.PRO) {
    return PLAN_IDS.PRO;
  }

  return PLAN_IDS.FREE;
}

function unixTimeToIso(value) {
  const seconds = Number(value);

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }

  return new Date(seconds * 1000).toISOString();
}

function customerIdFromSubscription(subscription) {
  if (
    subscription?.customer &&
    typeof subscription.customer === "object"
  ) {
    return subscription.customer.id || null;
  }

  return subscription?.customer || null;
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

async function setFreeForMissingSubscription(
  projectRoot,
  userId
) {
  await updateStripeSubscription(
    projectRoot,
    userId,
    {
      planId: PLAN_IDS.FREE,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      stripeSubscriptionStatus: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false
    }
  );

  return getUserUsage(
    projectRoot,
    userId
  );
}

const STRIPE_ENTITLEMENT_FRESHNESS_MS =
  15 * 60 * 1000;

function hasFreshStripeVerification(
  verifiedAt,
  now = Date.now()
) {
  const verifiedTime =
    Date.parse(verifiedAt || "");

  if (!Number.isFinite(verifiedTime)) {
    return false;
  }

  const age = now - verifiedTime;

  return (
    age >= 0 &&
    age < STRIPE_ENTITLEMENT_FRESHNESS_MS
  );
}

export async function reconcilePaidEntitlement(
  projectRoot,
  userId,
  {
    retrieveSubscription = null,
    force = false,
    requireFreshVerification = false
  } = {}
) {
  const usage =
    await getUserUsage(
      projectRoot,
      userId
    );

  const billingState =
    await getStripeBillingState(
      projectRoot,
      userId
    );

  const subscriptionId =
    String(
      billingState.stripeSubscriptionId || ""
    ).trim();

  if (!subscriptionId) {
    if (usage.planId !== PLAN_IDS.FREE) {
      console.warn(
        "Paid entitlement has no Stripe subscription ID:",
        userId
      );
    }

    if (
      requireFreshVerification &&
      usage.planId !== PLAN_IDS.FREE
    ) {
      const error =
        new Error(
          "Paid subscription cannot be verified because its Stripe subscription ID is missing."
        );

      error.code =
        "STRIPE_ENTITLEMENT_UNAVAILABLE";

      throw error;
    }

    return usage;
  }

  if (
    !force &&
    hasFreshStripeVerification(
      billingState.stripeEntitlementVerifiedAt
    )
  ) {
    return usage;
  }

  let retrieve = retrieveSubscription;

  if (!retrieve) {
    const configuration =
      stripeConfiguration();

    if (!configuration.secretKey) {
      if (
        requireFreshVerification &&
        usage.planId !== PLAN_IDS.FREE
      ) {
        const error =
          new Error(
            "Paid subscription verification is temporarily unavailable."
          );

        error.code =
          "STRIPE_ENTITLEMENT_UNAVAILABLE";

        throw error;
      }

      return usage;
    }

    const stripe =
      new Stripe(configuration.secretKey);

    retrieve =
      (id) =>
        stripe.subscriptions.retrieve(id);
  }

  let subscription;

  try {
    subscription =
      await retrieve(subscriptionId);
  } catch (error) {
    if (isStripeResourceMissing(error)) {
      return setFreeForMissingSubscription(
        projectRoot,
        userId
      );
    }

    console.warn(
      "Stripe entitlement reconciliation unavailable:",
      userId,
      error?.code || error?.message || "unknown error"
    );

    if (
      requireFreshVerification &&
      usage.planId !== PLAN_IDS.FREE
    ) {
      const verificationError =
        new Error(
          "Paid subscription verification is temporarily unavailable."
        );

      verificationError.code =
        "STRIPE_ENTITLEMENT_UNAVAILABLE";

      verificationError.cause = error;

      throw verificationError;
    }

    return usage;
  }

  const stripePlan =
    planFromSubscription(subscription);

  const planId =
    paidStatus(subscription.status)
      ? stripePlan
      : PLAN_IDS.FREE;

  await updateStripeSubscription(
    projectRoot,
    userId,
    {
      planId,

      stripeCustomerId:
        customerIdFromSubscription(subscription),

      stripeSubscriptionId:
        subscription.id || null,

      stripeSubscriptionStatus:
        subscription.status || null,

      currentPeriodStart:
        unixTimeToIso(
          subscription.current_period_start
        ),

      currentPeriodEnd:
        unixTimeToIso(
          subscription.cancel_at ||
          subscription.current_period_end
        ),

      cancelAtPeriodEnd:
        Boolean(
          subscription.cancel_at_period_end ||
          subscription.cancel_at
        ),

      stripeEntitlementVerifiedAt:
        new Date().toISOString()
    }
  );

  return getUserUsage(
    projectRoot,
    userId
  );
}
