import assert from "node:assert/strict";

import {
  earlyRenewalIdempotencyKey,
  startEarlyRenewalStripePeriod
} from "../earlyRenewalStripe.mjs";

assert.equal(
  earlyRenewalIdempotencyKey(
    "operation-123"
  ),
  "pix2vid-early-renewal-operation-123"
);

assert.throws(
  () =>
    earlyRenewalIdempotencyKey(""),
  (error) =>
    error?.code ===
    "EARLY_RENEWAL_OPERATION_ID_REQUIRED"
);

const calls = [];

const fakeUpdateSubscription =
  async (
    subscriptionId,
    parameters,
    options
  ) => {
    calls.push({
      subscriptionId,
      parameters,
      options
    });

    return {
      id: subscriptionId,
      status: "active",
      current_period_start: 123,
      current_period_end: 456
    };
  };

const firstResult =
  await startEarlyRenewalStripePeriod({
    stripeSubscriptionId:
      "sub_early_renewal_test",
    operationId:
      "operation-abc",
    updateSubscription:
      fakeUpdateSubscription
  });

assert.equal(
  calls.length,
  1,
  "Helper must perform exactly one subscription update."
);

assert.deepEqual(
  calls[0],
  {
    subscriptionId:
      "sub_early_renewal_test",

    parameters: {
      billing_cycle_anchor: "now",
      proration_behavior: "none",
      payment_behavior:
        "error_if_incomplete"
    },

    options: {
      idempotencyKey:
        "pix2vid-early-renewal-operation-abc"
    }
  },
  "Stripe update contract must be exact."
);

assert.equal(
  firstResult.id,
  "sub_early_renewal_test"
);

await startEarlyRenewalStripePeriod({
  stripeSubscriptionId:
    "sub_early_renewal_test",
  operationId:
    "operation-abc",
  updateSubscription:
    fakeUpdateSubscription
});

assert.equal(
  calls.length,
  2,
  "A retry may call Stripe again."
);

assert.equal(
  calls[0].options.idempotencyKey,
  calls[1].options.idempotencyKey,
  "Retry must reuse the identical Stripe idempotency key."
);

assert.deepEqual(
  calls[0].parameters,
  calls[1].parameters,
  "Retry must reuse identical Stripe parameters."
);

assert.equal(
  Object.prototype.hasOwnProperty.call(
    calls[0].parameters,
    "price"
  ),
  false,
  "Early Renewal must not change the subscription price."
);

assert.equal(
  Object.prototype.hasOwnProperty.call(
    calls[0].parameters,
    "items"
  ),
  false,
  "Early Renewal must not replace subscription items."
);

await assert.rejects(
  startEarlyRenewalStripePeriod({
    stripeSubscriptionId: "",
    operationId: "operation-x",
    updateSubscription:
      fakeUpdateSubscription
  }),
  (error) =>
    error?.code ===
    "EARLY_RENEWAL_SUBSCRIPTION_ID_REQUIRED"
);

await assert.rejects(
  startEarlyRenewalStripePeriod({
    stripeSubscriptionId:
      "sub_early_renewal_test",
    operationId:
      "operation-x"
  }),
  (error) =>
    error?.code ===
    "EARLY_RENEWAL_STRIPE_UPDATE_REQUIRED"
);

console.log(
  "PASS: Early Renewal Stripe helper uses the exact cycle-reset contract."
);

console.log(
  "PASS: Stripe retries reuse the same idempotency key and parameters."
);

console.log(
  "PASS: Mock test made no Stripe API call and no charge."
);