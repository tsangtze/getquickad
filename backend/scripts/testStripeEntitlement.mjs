import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  PLAN_IDS,
  getUserUsage,
  getStripeBillingState,
  updateStripeSubscription,
  recordSuccessfulFinalVideo
} from "../usageLimits.mjs";

import {
  reconcilePaidEntitlement
} from "../stripeEntitlement.mjs";

process.env.STRIPE_STARTER_PRICE_ID =
  "price_test_starter";

process.env.STRIPE_PRO_PRICE_ID =
  "price_test_pro";

async function createRoot() {
  return fs.mkdtemp(
    path.join(
      os.tmpdir(),
      "quickad-stripe-entitlement-"
    )
  );
}

async function seedPaidUser(
  root,
  userId,
  {
    planId = PLAN_IDS.STARTER,
    customerId = "cus_test",
    subscriptionId = "sub_test",
    status = "active",
    periodStart = "2026-09-01T00:00:00.000Z",
    periodEnd = "2026-10-01T00:00:00.000Z"
  } = {}
) {
  await updateStripeSubscription(
    root,
    userId,
    {
      planId,
      stripeCustomerId: customerId,
      stripeSubscriptionId: subscriptionId,
      stripeSubscriptionStatus: status,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false
    }
  );

  const file =
    path.join(
      root,
      "users",
      `${userId}.json`
    );

  const data =
    JSON.parse(
      await fs.readFile(file, "utf8")
    );

  data.finalVideoCount = 7;
  data.monthlyCreditsUsed = 35;

  await fs.writeFile(
    file,
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

function subscription({
  id = "sub_test",
  customer = "cus_test",
  status = "active",
  priceId = "price_test_starter",
  planId = "starter",
  periodStart = 1788220800,
  periodEnd = 1790812800,
  cancelAtPeriodEnd = false,
  cancelAt = null
} = {}) {
  return {
    id,
    customer,
    status,
    items: {
      data: [
        {
          price: {
            id: priceId
          }
        }
      ]
    },
    metadata: {
      planId
    },
    current_period_start: periodStart,
    current_period_end: periodEnd,
    cancel_at_period_end: cancelAtPeriodEnd,
    cancel_at: cancelAt
  };
}

async function runTest(name, fn) {
  const root = await createRoot();

  try {
    await fn(root);
    console.log(`PASS: ${name}`);
  } finally {
    await fs.rm(
      root,
      {
        recursive: true,
        force: true
      }
    );
  }
}

await runTest(
  "Free account does not query Stripe",
  async (root) => {
    let called = false;

    const usage =
      await reconcilePaidEntitlement(
        root,
        "free-user",
        {
          retrieveSubscription: async () => {
            called = true;
            throw new Error(
              "Stripe should not be queried"
            );
          }
        }
      );

    assert.equal(usage.planId, PLAN_IDS.FREE);
    assert.equal(called, false);
  }
);

await runTest(
  "Free stale subscription is cleared when Stripe reports resource_missing",
  async (root) => {
    const userId =
      "free-stale-subscription";

    await seedPaidUser(
      root,
      userId,
      {
        planId: PLAN_IDS.FREE,
        customerId: "cus_stale_free",
        subscriptionId: "sub_stale_free",
        status: "active"
      }
    );

    const error =
      Object.assign(
        new Error("No such subscription"),
        {
          code: "resource_missing",
          statusCode: 404
        }
      );

    let called = false;

    const usage =
      await reconcilePaidEntitlement(
        root,
        userId,
        {
          retrieveSubscription:
            async (id) => {
              called = true;

              assert.equal(
                id,
                "sub_stale_free"
              );

              throw error;
            }
        }
      );

    assert.equal(
      called,
      true
    );

    assert.equal(
      usage.planId,
      PLAN_IDS.FREE
    );

    assert.equal(
      usage.finalVideoCount,
      7
    );

    assert.equal(
      usage.monthlyCreditsUsed,
      35
    );

    const billing =
      await getStripeBillingState(
        root,
        userId
      );

    assert.equal(
      billing.stripeCustomerId,
      null
    );

    assert.equal(
      billing.stripeSubscriptionId,
      null
    );

    assert.equal(
      billing.stripeSubscriptionStatus,
      null
    );
  }
);

await runTest(
  "Free local record is restored when Stripe subscription is active",
  async (root) => {
    const userId =
      "free-active-subscription";

    await seedPaidUser(
      root,
      userId,
      {
        planId: PLAN_IDS.FREE,
        customerId: "cus_active_free",
        subscriptionId: "sub_active_free",
        status: "active"
      }
    );

    const usage =
      await reconcilePaidEntitlement(
        root,
        userId,
        {
          retrieveSubscription:
            async (id) => {
              assert.equal(
                id,
                "sub_active_free"
              );

              return subscription({
                id: "sub_active_free",
                customer: "cus_active_free",
                status: "active",
                priceId: "price_test_starter",
                planId: "starter"
              });
            }
        }
      );

    assert.equal(
      usage.planId,
      PLAN_IDS.STARTER
    );

    assert.equal(
      usage.finalVideoCount,
      7
    );

    assert.equal(
      usage.monthlyCreditsUsed,
      35
    );

    const billing =
      await getStripeBillingState(
        root,
        userId
      );

    assert.equal(
      billing.stripeCustomerId,
      "cus_active_free"
    );

    assert.equal(
      billing.stripeSubscriptionId,
      "sub_active_free"
    );

    assert.equal(
      billing.stripeSubscriptionStatus,
      "active"
    );
  }
);
await runTest(
  "Paid account without subscription ID is preserved",
  async (root) => {
    await seedPaidUser(
      root,
      "missing-id",
      {
        subscriptionId: null
      }
    );

    const usage =
      await reconcilePaidEntitlement(
        root,
        "missing-id",
        {
          retrieveSubscription: async () => {
            throw new Error(
              "Retriever should not run"
            );
          }
        }
      );

    assert.equal(
      usage.planId,
      PLAN_IDS.STARTER
    );

    assert.equal(
      usage.monthlyCreditsUsed,
      35
    );
  }
);

await runTest(
  "Stripe resource_missing removes stale paid entitlement",
  async (root) => {
    await seedPaidUser(
      root,
      "stale-user"
    );

    const error =
      Object.assign(
        new Error("No such subscription"),
        {
          code: "resource_missing",
          statusCode: 404
        }
      );

    const usage =
      await reconcilePaidEntitlement(
        root,
        "stale-user",
        {
          retrieveSubscription:
            async () => {
              throw error;
            }
        }
      );

    assert.equal(
      usage.planId,
      PLAN_IDS.FREE
    );

    assert.equal(
      usage.finalVideoCount,
      7
    );

    assert.equal(
      usage.monthlyCreditsUsed,
      35
    );

    const billing =
      await getStripeBillingState(
        root,
        "stale-user"
      );

    assert.equal(
      billing.stripeCustomerId,
      null
    );

    assert.equal(
      billing.stripeSubscriptionId,
      null
    );

    assert.equal(
      billing.stripeSubscriptionStatus,
      null
    );
  }
);

await runTest(
  "Temporary Stripe failure preserves paid entitlement",
  async (root) => {
    await seedPaidUser(
      root,
      "temporary-error"
    );

    const usage =
      await reconcilePaidEntitlement(
        root,
        "temporary-error",
        {
          retrieveSubscription:
            async () => {
              const error =
                new Error(
                  "Temporary Stripe failure"
                );

              error.code = "api_connection_error";
              throw error;
            }
        }
      );

    assert.equal(
      usage.planId,
      PLAN_IDS.STARTER
    );

    assert.equal(
      usage.monthlyCreditsUsed,
      35
    );
  }
);

await runTest(
  "Active Starter remains Starter",
  async (root) => {
    await seedPaidUser(
      root,
      "starter-user"
    );

    const usage =
      await reconcilePaidEntitlement(
        root,
        "starter-user",
        {
          retrieveSubscription:
            async () =>
              subscription()
        }
      );

    assert.equal(
      usage.planId,
      PLAN_IDS.STARTER
    );

    assert.equal(
      usage.finalVideoCount,
      7
    );

    assert.equal(
      usage.monthlyCreditsUsed,
      35
    );
  }
);

await runTest(
  "Active Pro synchronizes to Pro",
  async (root) => {
    await seedPaidUser(
      root,
      "pro-user"
    );

    const usage =
      await reconcilePaidEntitlement(
        root,
        "pro-user",
        {
          retrieveSubscription:
            async () =>
              subscription({
                priceId: "price_test_pro",
                planId: "pro"
              })
        }
      );

    assert.equal(
      usage.planId,
      PLAN_IDS.PRO
    );

    assert.equal(
      usage.finalVideoCount,
      7
    );

    assert.equal(
      usage.monthlyCreditsUsed,
      35
    );
  }
);

await runTest(
  "Cancel at period end remains paid while active",
  async (root) => {
    await seedPaidUser(
      root,
      "cancel-later"
    );

    const usage =
      await reconcilePaidEntitlement(
        root,
        "cancel-later",
        {
          retrieveSubscription:
            async () =>
              subscription({
                status: "active",
                cancelAtPeriodEnd: true
              })
        }
      );

    assert.equal(
      usage.planId,
      PLAN_IDS.STARTER
    );

    assert.equal(
      usage.cancelAtPeriodEnd,
      true
    );
  }
);

await runTest(
  "Canceled subscription becomes Free",
  async (root) => {
    await seedPaidUser(
      root,
      "canceled-user"
    );

    const usage =
      await reconcilePaidEntitlement(
        root,
        "canceled-user",
        {
          retrieveSubscription:
            async () =>
              subscription({
                status: "canceled"
              })
        }
      );

    assert.equal(
      usage.planId,
      PLAN_IDS.FREE
    );

    assert.equal(
      usage.finalVideoCount,
      7
    );

    assert.equal(
      usage.monthlyCreditsUsed,
      35
    );
  }
);

await runTest(
  "Successful Stripe verification records a timestamp",
  async (root) => {
    const userId =
      "verification-timestamp-success";

    await seedPaidUser(
      root,
      userId
    );

    const before =
      Date.now();

    await reconcilePaidEntitlement(
      root,
      userId,
      {
        retrieveSubscription:
          async () => subscription()
      }
    );

    const billing =
      await getStripeBillingState(
        root,
        userId
      );

    assert.ok(
      billing.stripeEntitlementVerifiedAt
    );

    const verifiedAt =
      Date.parse(
        billing.stripeEntitlementVerifiedAt
      );

    assert.ok(
      Number.isFinite(verifiedAt)
    );

    assert.ok(
      verifiedAt >= before
    );

    assert.ok(
      verifiedAt <= Date.now()
    );
  }
);

await runTest(
  "Temporary Stripe failure does not create a verification timestamp",
  async (root) => {
    const userId =
      "verification-timestamp-failure";

    await seedPaidUser(
      root,
      userId
    );

    await reconcilePaidEntitlement(
      root,
      userId,
      {
        retrieveSubscription:
          async () => {
            const error =
              new Error(
                "Temporary Stripe failure"
              );

            error.code =
              "api_connection_error";

            throw error;
          }
      }
    );

    const billing =
      await getStripeBillingState(
        root,
        userId
      );

    assert.equal(
      billing.stripeEntitlementVerifiedAt,
      null
    );
  }
);

await runTest(
  "Temporary Stripe failure preserves an existing verification timestamp",
  async (root) => {
    const userId =
      "verification-timestamp-preserve";

    await seedPaidUser(
      root,
      userId
    );

    const originalTimestamp =
      "2026-09-06T12:00:00.000Z";

    const billingBefore =
      await getStripeBillingState(
        root,
        userId
      );

    await updateStripeSubscription(
      root,
      userId,
      {
        planId: PLAN_IDS.STARTER,
        stripeCustomerId:
          billingBefore.stripeCustomerId,
        stripeSubscriptionId:
          billingBefore.stripeSubscriptionId,
        stripeSubscriptionStatus:
          billingBefore.stripeSubscriptionStatus,
        currentPeriodStart:
          "2026-09-01T00:00:00.000Z",
        currentPeriodEnd:
          "2026-10-01T00:00:00.000Z",
        cancelAtPeriodEnd: false,
        stripeEntitlementVerifiedAt:
          originalTimestamp
      }
    );

    await reconcilePaidEntitlement(
      root,
      userId,
      {
        retrieveSubscription:
          async () => {
            const error =
              new Error(
                "Temporary Stripe failure"
              );

            error.code =
              "api_connection_error";

            throw error;
          }
      }
    );

    const billingAfter =
      await getStripeBillingState(
        root,
        userId
      );

    assert.equal(
      billingAfter.stripeEntitlementVerifiedAt,
      originalTimestamp
    );
  }
);

await runTest(
  "Stripe resource_missing clears verification timestamp with stale entitlement",
  async (root) => {
    const userId =
      "verification-timestamp-missing";

    await seedPaidUser(
      root,
      userId
    );

    const billingBefore =
      await getStripeBillingState(
        root,
        userId
      );

    await updateStripeSubscription(
      root,
      userId,
      {
        planId: PLAN_IDS.STARTER,
        stripeCustomerId:
          billingBefore.stripeCustomerId,
        stripeSubscriptionId:
          billingBefore.stripeSubscriptionId,
        stripeSubscriptionStatus:
          billingBefore.stripeSubscriptionStatus,
        currentPeriodStart:
          "2026-09-01T00:00:00.000Z",
        currentPeriodEnd:
          "2026-10-01T00:00:00.000Z",
        cancelAtPeriodEnd: false,
        stripeEntitlementVerifiedAt:
          "2026-09-06T12:00:00.000Z"
      }
    );

    await reconcilePaidEntitlement(
      root,
      userId,
      {
        retrieveSubscription:
          async () => {
            const error =
              new Error(
                "No such subscription"
              );

            error.code =
              "resource_missing";

            throw error;
          }
      }
    );

    const usage =
      await getUserUsage(
        root,
        userId
      );

    const billingAfter =
      await getStripeBillingState(
        root,
        userId
      );

    assert.equal(
      usage.planId,
      PLAN_IDS.FREE
    );

    assert.equal(
      billingAfter.stripeSubscriptionId,
      null
    );

    assert.equal(
      billingAfter.stripeEntitlementVerifiedAt,
      null
    );
  }
);

await runTest(
  "Fresh Stripe verification skips retrieval",
  async (root) => {
    const userId =
      "fresh-cache-skip";

    await seedPaidUser(
      root,
      userId
    );

    const billingBefore =
      await getStripeBillingState(
        root,
        userId
      );

    await updateStripeSubscription(
      root,
      userId,
      {
        planId: PLAN_IDS.STARTER,
        stripeCustomerId:
          billingBefore.stripeCustomerId,
        stripeSubscriptionId:
          billingBefore.stripeSubscriptionId,
        stripeSubscriptionStatus:
          billingBefore.stripeSubscriptionStatus,
        currentPeriodStart:
          "2026-09-01T00:00:00.000Z",
        currentPeriodEnd:
          "2026-10-01T00:00:00.000Z",
        cancelAtPeriodEnd: false,
        stripeEntitlementVerifiedAt:
          new Date().toISOString()
      }
    );

    let retrievalCount = 0;

    const usage =
      await reconcilePaidEntitlement(
        root,
        userId,
        {
          retrieveSubscription:
            async () => {
              retrievalCount++;
              return subscription();
            }
        }
      );

    assert.equal(
      retrievalCount,
      0
    );

    assert.equal(
      usage.planId,
      PLAN_IDS.STARTER
    );
  }
);

await runTest(
  "Expired Stripe verification performs retrieval",
  async (root) => {
    const userId =
      "expired-cache-refresh";

    await seedPaidUser(
      root,
      userId
    );

    const billingBefore =
      await getStripeBillingState(
        root,
        userId
      );

    await updateStripeSubscription(
      root,
      userId,
      {
        planId: PLAN_IDS.STARTER,
        stripeCustomerId:
          billingBefore.stripeCustomerId,
        stripeSubscriptionId:
          billingBefore.stripeSubscriptionId,
        stripeSubscriptionStatus:
          billingBefore.stripeSubscriptionStatus,
        currentPeriodStart:
          "2026-09-01T00:00:00.000Z",
        currentPeriodEnd:
          "2026-10-01T00:00:00.000Z",
        cancelAtPeriodEnd: false,
        stripeEntitlementVerifiedAt:
          new Date(
            Date.now() - 16 * 60 * 1000
          ).toISOString()
      }
    );

    let retrievalCount = 0;

    await reconcilePaidEntitlement(
      root,
      userId,
      {
        retrieveSubscription:
          async () => {
            retrievalCount++;
            return subscription();
          }
      }
    );

    assert.equal(
      retrievalCount,
      1
    );
  }
);

await runTest(
  "Forced reconciliation bypasses fresh cache",
  async (root) => {
    const userId =
      "forced-cache-refresh";

    await seedPaidUser(
      root,
      userId
    );

    const billingBefore =
      await getStripeBillingState(
        root,
        userId
      );

    await updateStripeSubscription(
      root,
      userId,
      {
        planId: PLAN_IDS.STARTER,
        stripeCustomerId:
          billingBefore.stripeCustomerId,
        stripeSubscriptionId:
          billingBefore.stripeSubscriptionId,
        stripeSubscriptionStatus:
          billingBefore.stripeSubscriptionStatus,
        currentPeriodStart:
          "2026-09-01T00:00:00.000Z",
        currentPeriodEnd:
          "2026-10-01T00:00:00.000Z",
        cancelAtPeriodEnd: false,
        stripeEntitlementVerifiedAt:
          new Date().toISOString()
      }
    );

    let retrievalCount = 0;

    await reconcilePaidEntitlement(
      root,
      userId,
      {
        retrieveSubscription:
          async () => {
            retrievalCount++;
            return subscription();
          },
        force: true
      }
    );

    assert.equal(
      retrievalCount,
      1
    );
  }
);

await runTest(
  "Invalid and future verification timestamps do not bypass Stripe",
  async (root) => {
    const cases = [
      {
        suffix: "invalid",
        timestamp: "not-a-date"
      },
      {
        suffix: "future",
        timestamp:
          new Date(
            Date.now() + 60 * 60 * 1000
          ).toISOString()
      }
    ];

    for (const testCase of cases) {
      const userId =
        `cache-${testCase.suffix}`;

      await seedPaidUser(
        root,
        userId
      );

      const billingBefore =
        await getStripeBillingState(
          root,
          userId
        );

      await updateStripeSubscription(
        root,
        userId,
        {
          planId: PLAN_IDS.STARTER,
          stripeCustomerId:
            billingBefore.stripeCustomerId,
          stripeSubscriptionId:
            billingBefore.stripeSubscriptionId,
          stripeSubscriptionStatus:
            billingBefore.stripeSubscriptionStatus,
          currentPeriodStart:
            "2026-09-01T00:00:00.000Z",
          currentPeriodEnd:
            "2026-10-01T00:00:00.000Z",
          cancelAtPeriodEnd: false,
          stripeEntitlementVerifiedAt:
            testCase.timestamp
        }
      );

      let retrievalCount = 0;

      await reconcilePaidEntitlement(
        root,
        userId,
        {
          retrieveSubscription:
            async () => {
              retrievalCount++;
              return subscription();
            }
        }
      );

      assert.equal(
        retrievalCount,
        1
      );
    }
  }
);

await runTest(
  "Stripe reconciliation and final-video accounting preserve both updates",
  async (root) => {
    const userId =
      "stripe-accounting-race";

    await seedPaidUser(
      root,
      userId
    );

    let releaseStripe;

    const stripeMayReturn =
      new Promise((resolve) => {
        releaseStripe = resolve;
      });

    let stripeStartedResolve;

    const stripeStarted =
      new Promise((resolve) => {
        stripeStartedResolve = resolve;
      });

    const reconciliation =
      reconcilePaidEntitlement(
        root,
        userId,
        {
          retrieveSubscription:
            async () => {
              stripeStartedResolve();
              await stripeMayReturn;
              return subscription();
            }
        }
      );

    await stripeStarted;

    const accounting =
      recordSuccessfulFinalVideo(
        root,
        userId,
        30
      );

    releaseStripe();

    await Promise.all([
      reconciliation,
      accounting
    ]);

    const usage =
      await getUserUsage(
        root,
        userId
      );

    assert.equal(
      usage.planId,
      PLAN_IDS.STARTER
    );

    assert.equal(
      usage.monthlyCreditsUsed,
      45
    );


    assert.equal(
      usage.finalVideoCount,
      7
    );
  }
);
await runTest(
  "Strict mode accepts fresh cached verification",
  async (root) => {
    const userId =
      "strict-fresh-cache";

    await seedPaidUser(
      root,
      userId
    );

    const filePath =
      path.join(
        root,
        "users",
        `${userId}.json`
      );

    const data =
      JSON.parse(
        await fs.readFile(
          filePath,
          "utf8"
        )
      );

    data.stripeEntitlementVerifiedAt =
      new Date().toISOString();

    await fs.writeFile(
      filePath,
      JSON.stringify(data, null, 2),
      "utf8"
    );

    let retrievals = 0;

    const usage =
      await reconcilePaidEntitlement(
        root,
        userId,
        {
          requireFreshVerification: true,
          retrieveSubscription:
            async () => {
              retrievals++;

              throw new Error(
                "Fresh cache should avoid Stripe."
              );
            }
        }
      );

    assert.equal(
      usage.planId,
      PLAN_IDS.STARTER
    );

    assert.equal(
      retrievals,
      0
    );
  }
);

await runTest(
  "Strict mode refreshes expired verification",
  async (root) => {
    const userId =
      "strict-expired-success";

    await seedPaidUser(
      root,
      userId
    );

    const filePath =
      path.join(
        root,
        "users",
        `${userId}.json`
      );

    const data =
      JSON.parse(
        await fs.readFile(
          filePath,
          "utf8"
        )
      );

    data.stripeEntitlementVerifiedAt =
      new Date(
        Date.now() -
        60 * 60 * 1000
      ).toISOString();

    await fs.writeFile(
      filePath,
      JSON.stringify(data, null, 2),
      "utf8"
    );

    let retrievals = 0;
    const before = Date.now();

    const usage =
      await reconcilePaidEntitlement(
        root,
        userId,
        {
          requireFreshVerification: true,
          retrieveSubscription:
            async () => {
              retrievals++;
              return subscription();
            }
        }
      );

    const billing =
      await getStripeBillingState(
        root,
        userId
      );

    assert.equal(
      usage.planId,
      PLAN_IDS.STARTER
    );

    assert.equal(
      retrievals,
      1
    );

    assert.ok(
      Date.parse(
        billing.stripeEntitlementVerifiedAt
      ) >= before
    );
  }
);

await runTest(
  "Strict mode blocks temporary Stripe failure without downgrading",
  async (root) => {
    const userId =
      "strict-temporary-failure";

    await seedPaidUser(
      root,
      userId
    );

    const filePath =
      path.join(
        root,
        "users",
        `${userId}.json`
      );

    const data =
      JSON.parse(
        await fs.readFile(
          filePath,
          "utf8"
        )
      );

    data.stripeEntitlementVerifiedAt =
      new Date(
        Date.now() -
        60 * 60 * 1000
      ).toISOString();

    await fs.writeFile(
      filePath,
      JSON.stringify(data, null, 2),
      "utf8"
    );

    await assert.rejects(
      () =>
        reconcilePaidEntitlement(
          root,
          userId,
          {
            requireFreshVerification: true,
            retrieveSubscription:
              async () => {
                const error =
                  new Error(
                    "temporary Stripe outage"
                  );

                error.code =
                  "api_connection_error";

                throw error;
              }
          }
        ),
      error =>
        error?.code ===
        "STRIPE_ENTITLEMENT_UNAVAILABLE"
    );

    const usage =
      await getUserUsage(
        root,
        userId
      );

    const billing =
      await getStripeBillingState(
        root,
        userId
      );

    assert.equal(
      usage.planId,
      PLAN_IDS.STARTER
    );

    assert.equal(
      billing.stripeSubscriptionId,
      "sub_test"
    );

    assert.equal(
      billing.stripeSubscriptionStatus,
      "active"
    );

    assert.equal(
      billing.stripeEntitlementVerifiedAt,
      data.stripeEntitlementVerifiedAt
    );
  }
);

await runTest(
  "Strict mode treats resource_missing as authoritative",
  async (root) => {
    const userId =
      "strict-resource-missing";

    await seedPaidUser(
      root,
      userId
    );

    const filePath =
      path.join(
        root,
        "users",
        `${userId}.json`
      );

    const data =
      JSON.parse(
        await fs.readFile(
          filePath,
          "utf8"
        )
      );

    data.stripeEntitlementVerifiedAt =
      new Date(
        Date.now() -
        60 * 60 * 1000
      ).toISOString();

    await fs.writeFile(
      filePath,
      JSON.stringify(data, null, 2),
      "utf8"
    );

    const usage =
      await reconcilePaidEntitlement(
        root,
        userId,
        {
          requireFreshVerification: true,
          retrieveSubscription:
            async () => {
              const error =
                new Error(
                  "No such subscription"
                );

              error.code =
                "resource_missing";

              throw error;
            }
        }
      );

    const billing =
      await getStripeBillingState(
        root,
        userId
      );

    assert.equal(
      usage.planId,
      PLAN_IDS.FREE
    );

    assert.equal(
      billing.stripeSubscriptionId,
      null
    );

    assert.equal(
      billing.stripeCustomerId,
      null
    );

    assert.equal(
      billing.stripeEntitlementVerifiedAt,
      null
    );
  }
);

await runTest(
  "Strict mode rejects paid account without subscription ID without downgrading",
  async (root) => {
    const userId =
      "strict-missing-subscription-id";

    await seedPaidUser(
      root,
      userId,
      {
        subscriptionId: null
      }
    );

    await assert.rejects(
      () =>
        reconcilePaidEntitlement(
          root,
          userId,
          {
            requireFreshVerification:
              true,

            retrieveSubscription:
              async () => {
                throw new Error(
                  "Retriever should not run"
                );
              }
          }
        ),
      error =>
        error?.code ===
        "STRIPE_ENTITLEMENT_UNAVAILABLE"
    );

    const usage =
      await getUserUsage(
        root,
        userId
      );

    const billing =
      await getStripeBillingState(
        root,
        userId
      );

    assert.equal(
      usage.planId,
      PLAN_IDS.STARTER
    );

    assert.equal(
      usage.monthlyCreditsUsed,
      35
    );

    assert.equal(
      usage.finalVideoCount,
      7
    );

    assert.equal(
      billing.stripeSubscriptionId,
      null
    );

    assert.equal(
      billing.stripeCustomerId,
      "cus_test"
    );
  }
);

console.log(
  "`nALL STRIPE ENTITLEMENT TESTS PASSED."
);
