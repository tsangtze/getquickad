import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import express from "express";
import Stripe from "stripe";

import {
  markUserAccountDeleted
} from "../usageLimits.mjs";

import {
  createStripeWebhookHandler
} from "../stripeWebhook.mjs";

const originalEnvironment = {
  secretKey:
    process.env.STRIPE_SECRET_KEY,
  webhookSecret:
    process.env.STRIPE_WEBHOOK_SECRET,
  starterPriceId:
    process.env.STRIPE_STARTER_PRICE_ID,
  proPriceId:
    process.env.STRIPE_PRO_PRICE_ID
};

process.env.STRIPE_SECRET_KEY =
  "sk_test_deleted_account_webhook";

process.env.STRIPE_WEBHOOK_SECRET =
  "whsec_deleted_account_webhook";

process.env.STRIPE_STARTER_PRICE_ID =
  "price_test_starter";

process.env.STRIPE_PRO_PRICE_ID =
  "price_test_pro";

const stripe =
  new Stripe(
    process.env.STRIPE_SECRET_KEY
  );

const root =
  await fs.mkdtemp(
    path.join(
      os.tmpdir(),
      "pix2vid-deleted-webhook-"
    )
  );

const userId =
  "deleted-webhook-user";

const app =
  express();

app.post(
  "/api/billing/webhook",
  ...createStripeWebhookHandler({
    projectRoot: root
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
  await markUserAccountDeleted(
    root,
    userId
  );

  const address =
    server.address();

  assert.ok(
    address &&
    typeof address === "object"
  );

  const payload =
    JSON.stringify({
      id:
        "evt_deleted_account",
      object:
        "event",
      type:
        "customer.subscription.deleted",
      data: {
        object: {
          id:
            "sub_deleted_account",
          object:
            "subscription",
          customer:
            "cus_deleted_account",
          status:
            "canceled",
          cancel_at_period_end:
            false,
          cancel_at:
            null,
          current_period_start:
            1788220800,
          current_period_end:
            1790812800,
          metadata: {
            quickadUserId:
              userId,
            quickadPlanId:
              "starter"
          },
          items: {
            data: [
              {
                price: {
                  id:
                    "price_test_starter"
                }
              }
            ]
          }
        }
      }
    });

  const signature =
    stripe.webhooks.generateTestHeaderString({
      payload,
      secret:
        process.env.STRIPE_WEBHOOK_SECRET
    });

  const response =
    await fetch(
      `http://127.0.0.1:${address.port}/api/billing/webhook`,
      {
        method:
          "POST",
        headers: {
          "content-type":
            "application/json",
          "stripe-signature":
            signature
        },
        body:
          payload
      }
    );

  assert.equal(
    response.status,
    200
  );

  await assert.rejects(
    fs.access(
      path.join(
        root,
        "users",
        `${userId}.json`
      )
    )
  );

  await fs.access(
    path.join(
      root,
      "users",
      `${createHash("sha256").update(userId).digest("hex")}.json.deleted`
    )
  );

  console.log(
    "PASS: Deleted-account webhook returns HTTP 200"
  );

  console.log(
    "PASS: Deleted-account webhook does not recreate usage"
  );

  console.log(
    "PASS: Account deletion tombstone remains intact"
  );

  console.log(
    "ALL DELETED ACCOUNT WEBHOOK TESTS PASSED."
  );
} finally {
  await new Promise(
    (resolve) =>
      server.close(resolve)
  );

  await fs.rm(
    root,
    {
      recursive: true,
      force: true
    }
  );

  const restore = (
    name,
    value
  ) => {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] =
        value;
    }
  };

  restore(
    "STRIPE_SECRET_KEY",
    originalEnvironment.secretKey
  );

  restore(
    "STRIPE_WEBHOOK_SECRET",
    originalEnvironment.webhookSecret
  );

  restore(
    "STRIPE_STARTER_PRICE_ID",
    originalEnvironment.starterPriceId
  );

  restore(
    "STRIPE_PRO_PRICE_ID",
    originalEnvironment.proPriceId
  );
}
