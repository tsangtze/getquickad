import express from "express";
import Stripe from "stripe";

import {
  PLAN_IDS,
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

    webhookSecret:
      cleanEnvironmentValue(
        process.env.STRIPE_WEBHOOK_SECRET
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

function unixTimeToIso(value) {
  const seconds = Number(value);

  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }

  return new Date(seconds * 1000).toISOString();
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

function userFromSubscription(subscription) {
  return String(
    subscription?.metadata?.quickadUserId || ""
  ).trim();
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

function paidStatus(status) {
  return (
    status === "active" ||
    status === "trialing"
  );
}

async function applySubscription(
  projectRoot,
  subscription
) {
  const userId =
    userFromSubscription(subscription);

  if (!userId) {
    console.warn(
      "Stripe subscription has no QuickAd user ID:",
      subscription?.id
    );

    return;
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
        )
    }
  );

  console.log(
    "Stripe subscription synchronized:",
    userId,
    planId,
    subscription.status
  );
}

export function createStripeWebhookHandler({
  projectRoot
}) {
  return [
    express.raw({
      type: "application/json"
    }),

    async (request, response) => {
      const configuration =
        stripeConfiguration();

      if (
        !configuration.secretKey ||
        !configuration.webhookSecret
      ) {
        return response.status(503).json({
          ok: false,
          error: "Stripe webhook is not configured."
        });
      }

      const stripe =
        new Stripe(configuration.secretKey);

      const signature =
        request.headers["stripe-signature"];

      let event;

      try {
        event =
          stripe.webhooks.constructEvent(
            request.body,
            signature,
            configuration.webhookSecret
          );
      } catch (error) {
        console.error(
          "Stripe webhook signature verification failed:",
          error.message
        );

        return response.status(400).send(
          "Invalid Stripe webhook signature."
        );
      }

      try {
        switch (event.type) {
          case "customer.subscription.created":
          case "customer.subscription.updated":
          case "customer.subscription.deleted":
            await applySubscription(
              projectRoot,
              event.data.object
            );
            break;

          default:
            break;
        }

        response.json({
          received: true
        });
      } catch (error) {
        console.error(
          "Stripe webhook processing failed:",
          error
        );

        response.status(500).json({
          ok: false,
          error: "Stripe webhook processing failed."
        });
      }
    }
  ];
}
