import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";

import {
  createBillingRouter
} from "../billingRoutes.mjs";

import {
  getEarlyRenewalOperation,
  getUserUsage
} from "../usageLimits.mjs";

const originalEnvironment = {
  applicationOrigin:
    process.env.APPLICATION_ORIGIN,
  appOrigin:
    process.env.APP_ORIGIN,
  starterPriceId:
    process.env.STRIPE_STARTER_PRICE_ID,
  proPriceId:
    process.env.STRIPE_PRO_PRICE_ID,
  stripeSecretKey:
    process.env.STRIPE_SECRET_KEY
};

const applicationOrigin =
  "http://127.0.0.1";

const starterPriceId =
  "price_test_early_renewal_starter";

const subscriptionId =
  "sub_test_early_renewal";

const customerId =
  "cus_test_early_renewal";

const periodStart =
  "2026-09-01T00:00:00.000Z";

const periodEnd =
  "2026-10-01T00:00:00.000Z";

const periodStartSeconds =
  Math.floor(
    new Date(periodStart).getTime() / 1000
  );

const periodEndSeconds =
  Math.floor(
    new Date(periodEnd).getTime() / 1000
  );

function restoreEnvironment() {
  const values = {
    APPLICATION_ORIGIN:
      originalEnvironment.applicationOrigin,
    APP_ORIGIN:
      originalEnvironment.appOrigin,
    STRIPE_STARTER_PRICE_ID:
      originalEnvironment.starterPriceId,
    STRIPE_PRO_PRICE_ID:
      originalEnvironment.proPriceId,
    STRIPE_SECRET_KEY:
      originalEnvironment.stripeSecretKey
  };

  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function fakeSubscription() {
  return {
    id: subscriptionId,
    customer: customerId,
    status: "active",
    cancel_at_period_end: false,
    items: {
      data: [
        {
          current_period_start: periodStartSeconds,
          current_period_end: periodEndSeconds,
          price: {
            id: starterPriceId
          }
        }
      ]
    }
  };
}

async function writeUser(
  projectRoot,
  userId
) {
  const usersDirectory =
    path.join(projectRoot, "users");

  await fs.mkdir(
    usersDirectory,
    { recursive: true }
  );

  const user = {
    id: userId,
    email: `${userId}@example.test`,
    planId: "starter",
    monthlyCreditsUsed: 100,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    stripeSubscriptionStatus: "active",
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: false
  };

  await fs.writeFile(
    path.join(
      usersDirectory,
      `${userId}.json`
    ),
    JSON.stringify(user, null, 2),
    "utf8"
  );
}

function fakeAuth(userId) {
  return (
    request,
    _response,
    next
  ) => {
    request.authUser = {
      id: userId,
      email: `${userId}@example.test`
    };

    next();
  };
}

async function startApplication({
  projectRoot,
  userId,
  stripe
}) {
  const app = express();

  app.use(express.json());

  app.use(
    "/api/billing",
    createBillingRouter({
      projectRoot,

      stripeClientFactory:
        () => stripe,

      requireUserMiddleware:
        fakeAuth(userId)
    })
  );

  const server =
    await new Promise(
      (resolve, reject) => {
        const listener =
          app.listen(
            0,
            "127.0.0.1",
            () => resolve(listener)
          );

        listener.once(
          "error",
          reject
        );
      }
    );

  const address =
    server.address();

  return {
    server,
    origin:
      `http://127.0.0.1:${address.port}`
  };
}

async function stopServer(server) {
  await new Promise(
    (resolve, reject) => {
      server.close(
        (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        }
      );
    }
  );
}

async function postEarlyRenewal(origin) {
  return fetch(
    `${origin}/api/billing/early-renewal`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",

        Origin:
          applicationOrigin
      },
      body: "{}"
    }
  );
}

async function successfulRouteTest(
  projectRoot
) {
  const userId =
    "early-renewal-success";

  await writeUser(
    projectRoot,
    userId
  );

  const retrieveCalls = [];
  const updateCalls = [];

  const stripe = {
    subscriptions: {
      async retrieve(id) {
        retrieveCalls.push(id);

        return fakeSubscription();
      },

      async update(
        id,
        parameters,
        options
      ) {
        updateCalls.push({
          id,
          parameters,
          options
        });

        return {
          id
        };
      }
    }
  };

  const {
    server,
    origin
  } = await startApplication({
    projectRoot,
    userId,
    stripe
  });

  try {
    const response =
      await postEarlyRenewal(origin);

    const body =
      await response.json();

    assert.equal(
      response.status,
      202
    );

    assert.equal(
      body.ok,
      true
    );

    assert.equal(
      body.renewalStarted,
      true
    );

    assert.equal(
      body.subscriptionId,
      subscriptionId
    );

    assert.equal(
      retrieveCalls.length,
      1
    );

    assert.equal(
      retrieveCalls[0],
      subscriptionId
    );

    assert.equal(
      updateCalls.length,
      1
    );

    const firstCall =
      updateCalls[0];

    assert.equal(
      firstCall.id,
      subscriptionId
    );

    assert.deepEqual(
      firstCall.parameters,
      {
        billing_cycle_anchor:
          "now",
        proration_behavior:
          "none",
        payment_behavior:
          "error_if_incomplete"
      }
    );

    assert.equal(
      typeof firstCall.options
        ?.idempotencyKey,
      "string"
    );

    assert.equal(
      firstCall.options.idempotencyKey,
      `pix2vid-early-renewal-${body.operationId}`
    );

    const operation =
      await getEarlyRenewalOperation(
        projectRoot,
        userId
      );

    assert(operation);

    assert.equal(
      operation.status,
      "reserved"
    );

    assert.equal(
      operation.operationId,
      body.operationId
    );

    assert.equal(
      operation.stripeSubscriptionId,
      subscriptionId
    );

    assert.equal(
      operation.periodStart,
      periodStart
    );

    const usage =
      await getUserUsage(
        projectRoot,
        userId
      );

    assert.equal(
      usage.monthlyCreditsUsed,
      100,
      "Route must not reset credits before webhook confirmation."
    );

    const retryResponse =
      await postEarlyRenewal(origin);

    const retryBody =
      await retryResponse.json();

    assert.equal(
      retryResponse.status,
      202
    );

    assert.equal(
      retryBody.operationId,
      body.operationId
    );

    assert.equal(
      updateCalls.length,
      2
    );

    assert.equal(
      updateCalls[1]
        .options
        .idempotencyKey,
      firstCall
        .options
        .idempotencyKey
    );

    const usageAfterRetry =
      await getUserUsage(
        projectRoot,
        userId
      );

    assert.equal(
      usageAfterRetry.monthlyCreditsUsed,
      100,
      "Retry must not reset credits."
    );

    console.log(
      "PASS: Successful Early Renewal route returns 202 and preserves credits until webhook."
    );

    console.log(
      "PASS: Retry reuses the durable operation and Stripe idempotency key."
    );
  } finally {
    await stopServer(server);
  }
}

async function failedPaymentTest(
  projectRoot
) {
  const userId =
    "early-renewal-payment-failure";

  await writeUser(
    projectRoot,
    userId
  );

  const updateCalls = [];

  const stripe = {
    subscriptions: {
      async retrieve() {
        return fakeSubscription();
      },

      async update(
        id,
        parameters,
        options
      ) {
        updateCalls.push({
          id,
          parameters,
          options
        });

        const error =
          new Error(
            "Simulated Stripe payment failure."
          );

        error.code =
          "card_declined";

        throw error;
      }
    }
  };

  const {
    server,
    origin
  } = await startApplication({
    projectRoot,
    userId,
    stripe
  });

  try {
    const response =
      await postEarlyRenewal(origin);

    const body =
      await response.json();

    assert.equal(
      response.status,
      503
    );

    assert.equal(
      body.ok,
      false
    );

    assert.equal(
      body.code,
      "EARLY_RENEWAL_PAYMENT_UNAVAILABLE"
    );

    assert.equal(
      updateCalls.length,
      1
    );

    const operation =
      await getEarlyRenewalOperation(
        projectRoot,
        userId
      );

    assert(operation);

    assert.equal(
      operation.status,
      "reserved"
    );

    const firstOperationId =
      operation.operationId;

    const firstIdempotencyKey =
      updateCalls[0]
        .options
        .idempotencyKey;

    assert.equal(
      firstIdempotencyKey,
      `pix2vid-early-renewal-${firstOperationId}`
    );

    const usage =
      await getUserUsage(
        projectRoot,
        userId
      );

    assert.equal(
      usage.monthlyCreditsUsed,
      100,
      "Failed payment must not reset credits."
    );

    const retryResponse =
      await postEarlyRenewal(origin);

    const retryBody =
      await retryResponse.json();

    assert.equal(
      retryResponse.status,
      503
    );

    assert.equal(
      retryBody.code,
      "EARLY_RENEWAL_PAYMENT_UNAVAILABLE"
    );

    assert.equal(
      updateCalls.length,
      2
    );

    assert.equal(
      updateCalls[1]
        .options
        .idempotencyKey,
      firstIdempotencyKey
    );

    const operationAfterRetry =
      await getEarlyRenewalOperation(
        projectRoot,
        userId
      );

    assert.equal(
      operationAfterRetry.operationId,
      firstOperationId
    );

    assert.equal(
      operationAfterRetry.status,
      "reserved"
    );

    const usageAfterRetry =
      await getUserUsage(
        projectRoot,
        userId
      );

    assert.equal(
      usageAfterRetry.monthlyCreditsUsed,
      100
    );

    console.log(
      "PASS: Stripe payment failure returns 503 and leaves credits unchanged."
    );

    console.log(
      "PASS: Failed-payment retry preserves the durable operation and idempotency key."
    );
  } finally {
    await stopServer(server);
  }
}

let projectRoot;

try {
  /*
   * Intentionally use fake Stripe configuration only.
   * The injected stripeClientFactory prevents construction
   * of the real Stripe SDK client.
   */
  process.env.APPLICATION_ORIGIN =
    applicationOrigin;

  process.env.APP_ORIGIN =
    applicationOrigin;

  process.env.STRIPE_STARTER_PRICE_ID =
    starterPriceId;

  process.env.STRIPE_PRO_PRICE_ID =
    "price_test_early_renewal_pro";

  delete process.env.STRIPE_SECRET_KEY;

  projectRoot =
    await fs.mkdtemp(
      path.join(
        os.tmpdir(),
        "pix2vid-early-renewal-route-"
      )
    );

  await successfulRouteTest(
    projectRoot
  );

  await failedPaymentTest(
    projectRoot
  );

  console.log(
    "PASS: Mocked HTTP test constructed no real Stripe client and made no real Stripe API call."
  );

  console.log(
    "ALL EARLY RENEWAL ROUTE TESTS PASSED."
  );
} finally {
  if (projectRoot) {
    await fs.rm(
      projectRoot,
      {
        recursive: true,
        force: true
      }
    );
  }

  restoreEnvironment();
}
