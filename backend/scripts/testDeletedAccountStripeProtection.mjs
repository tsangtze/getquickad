import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  PLAN_IDS,
  getStripeBillingState,
  markUserAccountDeleted,
  updateStripeSubscription
} from "../usageLimits.mjs";

const root =
  await fs.mkdtemp(
    path.join(
      os.tmpdir(),
      "pix2vid-deleted-stripe-protection-"
    )
  );

try {
  const deletedUserId =
    "deleted-stripe-user";

  const activeUserId =
    "active-stripe-user";

  await markUserAccountDeleted(
    root,
    deletedUserId
  );

  const deletedUsageFile =
    path.join(
      root,
      "users",
      `${deletedUserId}.json`
    );

  await assert.rejects(
    updateStripeSubscription(
      root,
      deletedUserId,
      {
        planId:
          PLAN_IDS.FREE,
        stripeCustomerId:
          "cus_deleted",
        stripeSubscriptionId:
          "sub_deleted",
        stripeSubscriptionStatus:
          "canceled",
        currentPeriodStart:
          null,
        currentPeriodEnd:
          null,
        cancelAtPeriodEnd:
          false
      }
    ),
    (error) =>
      error?.code ===
      "ACCOUNT_DELETED"
  );

  await assert.rejects(
    fs.access(
      deletedUsageFile
    )
  );

  await updateStripeSubscription(
    root,
    activeUserId,
    {
      planId:
        PLAN_IDS.STARTER,
      stripeCustomerId:
        "cus_active",
      stripeSubscriptionId:
        "sub_active",
      stripeSubscriptionStatus:
        "active",
      currentPeriodStart:
        "2026-10-01T00:00:00.000Z",
      currentPeriodEnd:
        "2026-11-01T00:00:00.000Z",
      cancelAtPeriodEnd:
        false
    }
  );

  const activeBilling =
    await getStripeBillingState(
      root,
      activeUserId
    );

  assert.equal(
    activeBilling.stripeCustomerId,
    "cus_active"
  );

  assert.equal(
    activeBilling.stripeSubscriptionId,
    "sub_active"
  );

  assert.equal(
    activeBilling.stripeSubscriptionStatus,
    "active"
  );

  await fs.access(
    path.join(
      root,
      "users",
      `${activeUserId}.json`
    )
  );

  console.log(
    "PASS: Deleted account rejects Stripe state updates"
  );

  console.log(
    "PASS: Deleted usage file is not recreated"
  );

  console.log(
    "PASS: Active account still accepts Stripe updates"
  );

  console.log(
    "ALL DELETED ACCOUNT STRIPE PROTECTION TESTS PASSED."
  );
} finally {
  await fs.rm(
    root,
    {
      recursive: true,
      force: true
    }
  );
}
