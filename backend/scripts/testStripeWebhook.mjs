import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import Stripe from "stripe";

import {
  PLAN_IDS,
  getEarlyRenewalOperation,
  getStripeBillingState,
  getUserUsage,
  recordSuccessfulFinalVideo,
  reserveEarlyRenewalOperation
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
          current_period_start: 1788220800,
          current_period_end: 1790812800,
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

  const retrievedSubscriptions =
    new Map();

  const webhookStripeClient = {
    webhooks: stripe.webhooks,
    subscriptions: {
      async retrieve(subscriptionId) {
        if (!retrievedSubscriptions.has(subscriptionId)) {
          throw new Error(
            `Unexpected subscription retrieval: ${subscriptionId}`
          );
        }

        return retrievedSubscriptions.get(
          subscriptionId
        );
      }
    }
  };

  app.post(
    "/api/billing/webhook",
    ...createStripeWebhookHandler({
      projectRoot,
      stripeClient: webhookStripeClient
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

    const invoiceUserId =
      "invoice-reset-user";

    const invoiceSubscription =
      subscription({
        userId: invoiceUserId,
        id: "sub_invoice_reset",
        customer: "cus_invoice_reset",
        status: "active"
      });

    retrievedSubscriptions.set(
      invoiceSubscription.id,
      invoiceSubscription
    );

    const invoiceSubscriptionResult =
      await sendSignedWebhook(
        baseUrl,
        {
          id: "evt_invoice_subscription",
          object: "event",
          type:
            "customer.subscription.updated",
          data: {
            object: invoiceSubscription
          }
        }
      );

    assert.equal(
      invoiceSubscriptionResult.status,
      200
    );

    for (let index = 0; index < 5; index += 1) {
      await recordSuccessfulFinalVideo(
        projectRoot,
        invoiceUserId,
        60
      );
    }

    const exhaustedUsage =
      await getUserUsage(
        projectRoot,
        invoiceUserId
      );

    assert.equal(
      exhaustedUsage.monthlyCreditsUsed,
      100
    );

    const successfulInvoiceEvent = {
      id: "evt_invoice_paid",
      object: "event",
      type: "invoice.payment_succeeded",
      data: {
        object: {
          id: "in_invoice_reset_once",
          billing_reason:
            "subscription_cycle",
          parent: {
            subscription_details: {
              subscription:
                invoiceSubscription.id
            }
          }
        }
      }
    };

    const firstInvoiceResult =
      await sendSignedWebhook(
        baseUrl,
        successfulInvoiceEvent
      );

    assert.equal(
      firstInvoiceResult.status,
      200
    );

    const resetUsage =
      await getUserUsage(
        projectRoot,
        invoiceUserId
      );

    assert.equal(
      resetUsage.monthlyCreditsUsed,
      0
    );

    await recordSuccessfulFinalVideo(
      projectRoot,
      invoiceUserId,
      30
    );

    const spentAfterReset =
      await getUserUsage(
        projectRoot,
        invoiceUserId
      );

    assert.equal(
      spentAfterReset.monthlyCreditsUsed,
      10
    );

    const duplicateInvoiceResult =
      await sendSignedWebhook(
        baseUrl,
        successfulInvoiceEvent
      );

    assert.equal(
      duplicateInvoiceResult.status,
      200
    );

    const afterDuplicate =
      await getUserUsage(
        projectRoot,
        invoiceUserId
      );

    assert.equal(
      afterDuplicate.monthlyCreditsUsed,
      10
    );

    const usageBeforeUnrelatedUpdate =
      await getUserUsage(
        projectRoot,
        invoiceUserId
      );

    assert.equal(
      usageBeforeUnrelatedUpdate.monthlyCreditsUsed,
      10
    );

    const unrelatedUpdateInvoiceResult =
      await sendSignedWebhook(
        baseUrl,
        {
          id:
            "evt_unrelated_subscription_update_invoice",
          object: "event",
          type: "invoice.payment_succeeded",
          data: {
            object: {
              id:
                "in_unrelated_subscription_update",
              billing_reason:
                "subscription_update",
              parent: {
                subscription_details: {
                  subscription:
                    invoiceSubscription.id
                }
              }
            }
          }
        }
      );

    assert.equal(
      unrelatedUpdateInvoiceResult.status,
      200
    );

    const usageAfterUnrelatedUpdate =
      await getUserUsage(
        projectRoot,
        invoiceUserId
      );

    assert.equal(
      usageAfterUnrelatedUpdate.monthlyCreditsUsed,
      10,
      "An unrelated subscription_update invoice must not reset monthly credits."
    );

    console.log(
      "PASS: Uncorrelated subscription_update invoice does not reset credits."
    );

    const correlatedOperation =
      await reserveEarlyRenewalOperation(
        projectRoot,
        invoiceUserId,
        {
          operationId:
            "webhook-early-renewal-operation",
          stripeSubscriptionId:
            invoiceSubscription.id,
          periodStart:
            new Date(
              invoiceSubscription.items.data[0].current_period_start *
                1000
            ).toISOString()
        }
      );

    assert.equal(
      correlatedOperation.created,
      true
    );

    const renewedSubscription = {
      ...invoiceSubscription,

      items: {
        ...invoiceSubscription.items,

        data:
          invoiceSubscription.items.data.map(
            (item) => ({
              ...item,

              current_period_start:
                item.current_period_start +
                86400,

              current_period_end:
                item.current_period_end +
                86400
            })
          )
      }
    };

    retrievedSubscriptions.set(
      renewedSubscription.id,
      renewedSubscription
    );

    const correlatedEarlyRenewalResult =
      await sendSignedWebhook(
        baseUrl,
        {
          id:
            "evt_correlated_early_renewal",

          object: "event",

          type:
            "invoice.payment_succeeded",

          data: {
            object: {
              id:
                "in_correlated_early_renewal",

              billing_reason:
                "subscription_update",

              parent: {
                subscription_details: {
                  subscription:
                    renewedSubscription.id
                }
              }
            }
          }
        }
      );

    assert.equal(
      correlatedEarlyRenewalResult.status,
      200
    );

    const usageAfterCorrelatedEarlyRenewal =
      await getUserUsage(
        projectRoot,
        invoiceUserId
      );

    assert.equal(
      usageAfterCorrelatedEarlyRenewal.monthlyCreditsUsed,
      0,
      "A correlated Early Renewal subscription_update invoice must reset monthly credits."
    );

    console.log(
      "PASS: Correlated Early Renewal subscription_update invoice resets credits."
    );

    const completedWebhookOperation =
      await getEarlyRenewalOperation(
        projectRoot,
        invoiceUserId
      );

    assert.equal(
      completedWebhookOperation.status,
      "completed",
      "Successful correlated Early Renewal invoice must consume its reservation."
    );

    assert.ok(
      completedWebhookOperation.completedAt,
      "Completed Early Renewal operation must record completedAt."
    );

    await recordSuccessfulFinalVideo(
      projectRoot,
      invoiceUserId,
      30
    );

    const usageBeforeConsumedReplay =
      await getUserUsage(
        projectRoot,
        invoiceUserId
      );

    assert.equal(
      usageBeforeConsumedReplay.monthlyCreditsUsed,
      10
    );

    const consumedReservationReplay =
      await sendSignedWebhook(
        baseUrl,
        {
          id:
            "evt_consumed_early_renewal_replay",

          object:
            "event",

          type:
            "invoice.payment_succeeded",

          data: {
            object: {
              id:
                "in_consumed_early_renewal_replay",

              billing_reason:
                "subscription_update",

              parent: {
                subscription_details: {
                  subscription:
                    renewedSubscription.id
                }
              }
            }
          }
        }
      );

    assert.equal(
      consumedReservationReplay.status,
      200
    );

    const usageAfterConsumedReplay =
      await getUserUsage(
        projectRoot,
        invoiceUserId
      );

    assert.equal(
      usageAfterConsumedReplay.monthlyCreditsUsed,
      10,
      "A completed Early Renewal reservation must not authorize another subscription_update credit reset."
    );

    console.log(
      "PASS: Completed Early Renewal reservation cannot authorize another subscription_update invoice."
    );

    console.log(
      "PASS: Successful invoice resets credits once and duplicate delivery cannot reset spent credits."
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
