import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import Stripe from "stripe";

import {
  PLAN_IDS,
  getStripeBillingState,
  getUserUsage
} from "../usageLimits.mjs";

import {
  createStripeWebhookHandler
} from "../stripeWebhook.mjs";

const originalEnvironment = {
  secretKey: process.env.STRIPE_SECRET_KEY,
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  starterPriceId: process.env.STRIPE_STARTER_PRICE_ID,
  proPriceId: process.env.STRIPE_PRO_PRICE_ID
};

process.env.STRIPE_SECRET_KEY =
  "sk_test_quickad_webhook_regression";

process.env.STRIPE_WEBHOOK_SECRET =
  "whsec_quickad_webhook_regression";

process.env.STRIPE_STARTER_PRICE_ID =
  "price_test_starter";

process.env.STRIPE_PRO_PRICE_ID =
  "price_test_pro";

const stripe =
  new Stripe(
    process.env.STRIPE_SECRET_KEY
  );

function subscription({
  userId,
  id = "sub_webhook_test",
  customer = "cus_webhook_test",
  status = "active",
  priceId = "price_test_starter",
  cancelAtPeriodEnd = false
}) {
  return {
    id,
    customer,
    status,
    cancel_at_period_end:
      cancelAtPeriodEnd,
    cancel_at: null,
    current_period_start:
      1788220800,
    current_period_end:
      1790812800,
    metadata: {
      quickadUserId: userId,
      quickadPlanId:
        priceId === "price_test_pro"
          ? PLAN_IDS.PRO
          : PLAN_IDS.STARTER
    },
    items: {
      data: [
        {
          price: {
            id: priceId
          }
        }
      ]
    }
  };
}

async function sendSignedWebhook(
  baseUrl,
  event
) {
  const payload =
    JSON.stringify(event);

  const signature =
    stripe.webhooks.generateTestHeaderString({
      payload,
      secret:
        process.env.STRIPE_WEBHOOK_SECRET
    });

  const response =
    await fetch(
      `${baseUrl}/api/billing/webhook`,
      {
        method: "POST",
        headers: {
          "content-type":
            "application/json",
          "stripe-signature":
            signature
        },
        body: payload
      }
    );

  const text =
    await response.text();

  return {
    status: response.status,
    text
  };
}

async function main() {
  const projectRoot =
    await fs.mkdtemp(
      path.join(
        os.tmpdir(),
        "quickad-stripe-webhook-"
      )
    );

  const app =
    express();

  app.post(
    "/api/billing/webhook",
    ...createStripeWebhookHandler({
      projectRoot
    })
  );

  app.use(
    express.json({
      limit: "1mb"
    })
  );

  const server =
    await new Promise(
      (resolve, reject) => {
        const instance =
          app.listen(
            0,
            "127.0.0.1",
            () => resolve(instance)
          );

        instance.once(
          "error",
          reject
        );
      }
    );

  try {
    const address =
      server.address();

    assert.ok(
      address &&
      typeof address === "object"
    );

    const baseUrl =
      `http://127.0.0.1:${address.port}`;

    const userId =
      "signed-webhook-user";

    const activeResult =
      await sendSignedWebhook(
        baseUrl,
        {
          id: "evt_active",
          object: "event",
          type:
            "customer.subscription.updated",
          data: {
            object: subscription({
              userId,
              status: "active"
            })
          }
        }
      );

    assert.equal(
      activeResult.status,
      200
    );

    const activeUsage =
      await getUserUsage(
        projectRoot,
        userId
      );

    const activeBilling =
      await getStripeBillingState(
        projectRoot,
        userId
      );

    assert.equal(
      activeUsage.planId,
      PLAN_IDS.STARTER
    );

    assert.equal(
      activeBilling.stripeSubscriptionId,
      "sub_webhook_test"
    );

    assert.equal(
      activeBilling.stripeSubscriptionStatus,
      "active"
    );

    assert.ok(
      activeBilling.stripeEntitlementVerifiedAt
    );

    assert.ok(
      Number.isFinite(
        Date.parse(
          activeBilling.stripeEntitlementVerifiedAt
        )
      )
    );

    console.log(
      "PASS: Signed active webhook grants Starter and records verification time."
    );

    const canceledResult =
      await sendSignedWebhook(
        baseUrl,
        {
          id: "evt_deleted",
          object: "event",
          type:
            "customer.subscription.deleted",
          data: {
            object: subscription({
              userId,
              status: "canceled"
            })
          }
        }
      );

    assert.equal(
      canceledResult.status,
      200
    );

    const canceledUsage =
      await getUserUsage(
        projectRoot,
        userId
      );

    const canceledBilling =
      await getStripeBillingState(
        projectRoot,
        userId
      );

    assert.equal(
      canceledUsage.planId,
      PLAN_IDS.FREE
    );

    assert.equal(
      canceledBilling.stripeSubscriptionStatus,
      "canceled"
    );

    assert.ok(
      canceledBilling.stripeEntitlementVerifiedAt
    );

    assert.ok(
      Number.isFinite(
        Date.parse(
          canceledBilling.stripeEntitlementVerifiedAt
        )
      )
    );

    console.log(
      "PASS: Signed deleted webhook removes paid entitlement and records verification time."
    );

    const invalidResponse =
      await fetch(
        `${baseUrl}/api/billing/webhook`,
        {
          method: "POST",
          headers: {
            "content-type":
              "application/json",
            "stripe-signature":
              "invalid"
          },
          body:
            JSON.stringify({
              type:
                "customer.subscription.updated"
            })
        }
      );

    assert.equal(
      invalidResponse.status,
      400
    );

    console.log(
      "PASS: Invalid webhook signature is rejected."
    );

    console.log(
      "ALL STRIPE WEBHOOK TESTS PASSED."
    );
  } finally {
    await new Promise(
      (resolve, reject) => {
        server.close(
          (error) => {
            if (error) {
              reject(error);
              return;
            }

            resolve();
          }
        );
      }
    );

    await fs.rm(
      projectRoot,
      {
        recursive: true,
        force: true
      }
    );

    if (
      originalEnvironment.secretKey ===
      undefined
    ) {
      delete process.env.STRIPE_SECRET_KEY;
    } else {
      process.env.STRIPE_SECRET_KEY =
        originalEnvironment.secretKey;
    }

    if (
      originalEnvironment.webhookSecret ===
      undefined
    ) {
      delete process.env.STRIPE_WEBHOOK_SECRET;
    } else {
      process.env.STRIPE_WEBHOOK_SECRET =
        originalEnvironment.webhookSecret;
    }

    if (
      originalEnvironment.starterPriceId ===
      undefined
    ) {
      delete process.env.STRIPE_STARTER_PRICE_ID;
    } else {
      process.env.STRIPE_STARTER_PRICE_ID =
        originalEnvironment.starterPriceId;
    }

    if (
      originalEnvironment.proPriceId ===
      undefined
    ) {
      delete process.env.STRIPE_PRO_PRICE_ID;
    } else {
      process.env.STRIPE_PRO_PRICE_ID =
        originalEnvironment.proPriceId;
    }
  }
}

await main();