import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  PLAN_IDS,
  FREE_VIDEO_PLANS,
  canGenerateVideoPlan,
  recordSuccessfulVideoPlan,
  getVideoCreditCost,
  canGenerateFinalVideo,
  recordSuccessfulFinalVideo,
  completeEarlyRenewalOperation,
  getEarlyRenewalOperation,
  reserveEarlyRenewalOperation,
  updateStripeSubscription
} from "../usageLimits.mjs";

function project() {
  return {
    status: "storyboard_ready",
    video: null
  };
}

function usage(
  planId,
  {
    finalVideoCount = 0,
    monthlyCreditsUsed = 0
  } = {}
) {
  return {
    planId,
    finalVideoCount,
    monthlyCreditsUsed
  };
}

// Credit-price boundaries.
assert.equal(getVideoCreditCost(30), 10);
assert.equal(getVideoCreditCost(31), 15);
assert.equal(getVideoCreditCost(45), 15);
assert.equal(getVideoCreditCost(46), 20);
assert.equal(getVideoCreditCost(60), 20);

console.log("PASS: Credit boundaries are 10 / 15 / 20.");

// Free duration boundary.
let result =
  canGenerateFinalVideo(
    usage(PLAN_IDS.FREE),
    project(),
    30
  );

assert.equal(result.ok, true);
assert.equal(result.creditCost, 0);

result =
  canGenerateFinalVideo(
    usage(PLAN_IDS.FREE),
    project(),
    31
  );

assert.equal(result.ok, false);
assert.equal(
  result.code,
  "VIDEO_DURATION_LIMIT_EXCEEDED"
);

console.log("PASS: Free accepts 30 seconds and rejects 31.");

// Free lifetime Video Plan limit.
for (const count of [0, FREE_VIDEO_PLANS - 1]) {
  result = canGenerateVideoPlan({ planId: PLAN_IDS.FREE, freeVideoPlanCount: count });
  assert.equal(result.ok, true);
}

result = canGenerateVideoPlan({ planId: PLAN_IDS.FREE, freeVideoPlanCount: FREE_VIDEO_PLANS });
assert.equal(result.ok, false);
assert.equal(result.code, "FREE_VIDEO_PLAN_LIMIT_REACHED");
assert.equal(result.status, 403);

for (const planId of [PLAN_IDS.STARTER, PLAN_IDS.PRO]) {
  result = canGenerateVideoPlan({ planId, freeVideoPlanCount: FREE_VIDEO_PLANS });
  assert.equal(result.ok, true);
}

console.log("PASS: Free Video Plan lifetime limit enforced at 10; paid plans exempt.");

// Free lifetime-video limit.
result =
  canGenerateFinalVideo(
    usage(
      PLAN_IDS.FREE,
      { finalVideoCount: 2 }
    ),
    project(),
    30
  );

assert.equal(result.ok, false);
assert.equal(
  result.code,
  "FREE_VIDEO_LIMIT_REACHED"
);

console.log("PASS: Free lifetime final-video limit enforced.");

// Starter duration + credit boundaries.
result =
  canGenerateFinalVideo(
    usage(PLAN_IDS.STARTER),
    project(),
    30
  );

assert.equal(result.ok, true);
assert.equal(result.creditCost, 10);

result =
  canGenerateFinalVideo(
    usage(PLAN_IDS.STARTER),
    project(),
    31
  );

assert.equal(result.ok, true);
assert.equal(result.creditCost, 15);

result =
  canGenerateFinalVideo(
    usage(PLAN_IDS.STARTER),
    project(),
    45
  );

assert.equal(result.ok, true);
assert.equal(result.creditCost, 15);

result =
  canGenerateFinalVideo(
    usage(PLAN_IDS.STARTER),
    project(),
    46
  );

assert.equal(result.ok, true);
assert.equal(result.creditCost, 20);

result =
  canGenerateFinalVideo(
    usage(PLAN_IDS.STARTER),
    project(),
    60
  );

assert.equal(result.ok, true);
assert.equal(result.creditCost, 20);

result =
  canGenerateFinalVideo(
    usage(PLAN_IDS.STARTER),
    project(),
    61
  );

assert.equal(result.ok, false);
assert.equal(
  result.code,
  "VIDEO_DURATION_LIMIT_EXCEEDED"
);

console.log("PASS: Starter duration and credit boundaries enforced.");

// Pro has the same 60-second maximum.
result =
  canGenerateFinalVideo(
    usage(PLAN_IDS.PRO),
    project(),
    60
  );

assert.equal(result.ok, true);
assert.equal(result.creditCost, 20);

result =
  canGenerateFinalVideo(
    usage(PLAN_IDS.PRO),
    project(),
    61
  );

assert.equal(result.ok, false);
assert.equal(
  result.code,
  "VIDEO_DURATION_LIMIT_EXCEEDED"
);

console.log("PASS: Pro accepts 60 seconds and rejects 61.");

// Any positive paid balance may fund one final video.
result =
  canGenerateFinalVideo(
    usage(
      PLAN_IDS.STARTER,
      { monthlyCreditsUsed: 90 }
    ),
    project(),
    60
  );

assert.equal(result.ok, true);
assert.equal(result.creditCost, 10);

result =
  canGenerateFinalVideo(
    usage(
      PLAN_IDS.STARTER,
      { monthlyCreditsUsed: 99 }
    ),
    project(),
    60
  );

assert.equal(result.ok, true);
assert.equal(result.creditCost, 1);

result =
  canGenerateFinalVideo(
    usage(
      PLAN_IDS.STARTER,
      { monthlyCreditsUsed: 100 }
    ),
    project(),
    60
  );

assert.equal(result.ok, false);
assert.equal(
  result.code,
  "CREDIT_LIMIT_REACHED"
);

console.log("PASS: Positive last-credit balance is allowed; zero is blocked.");

// Exactly enough credits must work.
result =
  canGenerateFinalVideo(
    usage(
      PLAN_IDS.STARTER,
      { monthlyCreditsUsed: 85 }
    ),
    project(),
    45
  );

assert.equal(result.ok, true);
assert.equal(result.creditCost, 15);

console.log("PASS: Exactly enough credits allow generation.");

// Invalid and too-short durations fail closed at entitlement layer.
for (const duration of [
  NaN,
  "invalid",
  0,
  19
]) {
  result =
    canGenerateFinalVideo(
      usage(PLAN_IDS.STARTER),
      project(),
      duration
    );

  assert.equal(result.ok, false);
  assert.equal(
    result.code,
    "VIDEO_DURATION_LIMIT_EXCEEDED"
  );
}

console.log("PASS: Invalid and sub-20-second durations rejected.");

console.log(
  "PASS: All QuickAd usage entitlement tests passed."
);

// Actual usage-accounting tests.
const temporaryRoot =
  await fs.mkdtemp(
    path.join(os.tmpdir(), "quickad-usage-test-")
  );

try {
  const usersDirectory =
    path.join(temporaryRoot, "users");

  await fs.mkdir(usersDirectory, {
    recursive: true
  });

  const planUserId = "free-plan-test-user";
  const planUserFile = path.join(usersDirectory, `${planUserId}.json`);
  await fs.writeFile(planUserFile, JSON.stringify({ planId: PLAN_IDS.FREE, finalVideoCount: 0, freeVideoPlanCount: 9, monthlyCreditsUsed: 0 }), "utf8");
  let planAccountingResult = await recordSuccessfulVideoPlan(temporaryRoot, planUserId);
  assert.equal(planAccountingResult.freeVideoPlanCount, 10);
  let storedPlanUser = JSON.parse(await fs.readFile(planUserFile, "utf8"));
  assert.equal(storedPlanUser.freeVideoPlanCount, 10);
  await assert.rejects(recordSuccessfulVideoPlan(temporaryRoot, planUserId), (error) => error.code === "FREE_VIDEO_PLAN_LIMIT_REACHED");
  console.log("PASS: Successful Free Video Plan accounting increments 9 to 10 and blocks the next record.");

  const paidPlanUserId = "starter-plan-test-user";
  const paidPlanUserFile = path.join(usersDirectory, `${paidPlanUserId}.json`);
  await fs.writeFile(paidPlanUserFile, JSON.stringify({ planId: PLAN_IDS.STARTER, finalVideoCount: 0, freeVideoPlanCount: 10, monthlyCreditsUsed: 0 }), "utf8");
  planAccountingResult = await recordSuccessfulVideoPlan(temporaryRoot, paidPlanUserId);
  assert.equal(planAccountingResult.freeVideoPlanCount, 10);
  storedPlanUser = JSON.parse(await fs.readFile(paidPlanUserFile, "utf8"));
  assert.equal(storedPlanUser.freeVideoPlanCount, 10);
  console.log("PASS: Paid Video Plan generation does not increment the Free lifetime counter.");

  const freeUserId = "free-test-user";
  const freeUserFile =
    path.join(usersDirectory, `${freeUserId}.json`);

  await fs.writeFile(
    freeUserFile,
    JSON.stringify({
      planId: PLAN_IDS.FREE,
      finalVideoCount: 1,
      monthlyCreditsUsed: 0
    }),
    "utf8"
  );

  let accountingResult =
    await recordSuccessfulFinalVideo(
      temporaryRoot,
      freeUserId,
      30
    );

  assert.equal(
    accountingResult.usage.finalVideoCount,
    2
  );

  await assert.rejects(
    recordSuccessfulFinalVideo(
      temporaryRoot,
      freeUserId,
      30
    ),
    (error) =>
      error.code === "FREE_VIDEO_LIMIT_REACHED"
  );

  console.log("PASS: Accounting enforces Free lifetime limit.");

  const paidUserId = "starter-test-user";
  const paidUserFile =
    path.join(usersDirectory, `${paidUserId}.json`);

  await fs.writeFile(
    paidUserFile,
    JSON.stringify({
      planId: PLAN_IDS.STARTER,
      finalVideoCount: 0,
      monthlyCreditsUsed: 80
    }),
    "utf8"
  );

  accountingResult =
    await recordSuccessfulFinalVideo(
      temporaryRoot,
      paidUserId,
      60
    );

  assert.equal(accountingResult.creditCost, 20);
  assert.equal(
    accountingResult.usage.monthlyCreditsUsed,
    100
  );

  console.log("PASS: Accounting records 60-second paid credit cost.");

  await assert.rejects(
    recordSuccessfulFinalVideo(
      temporaryRoot,
      paidUserId,
      30
    ),
    (error) =>
      error.code === "CREDIT_LIMIT_REACHED"
  );

  console.log("PASS: Accounting blocks exhausted paid credits.");

  const lastCreditUserId = "starter-last-credit-user";
  const lastCreditUserFile =
    path.join(usersDirectory, `${lastCreditUserId}.json`);

  await fs.writeFile(
    lastCreditUserFile,
    JSON.stringify({
      planId: PLAN_IDS.STARTER,
      finalVideoCount: 0,
      monthlyCreditsUsed: 90
    }),
    "utf8"
  );

  accountingResult =
    await recordSuccessfulFinalVideo(
      temporaryRoot,
      lastCreditUserId,
      60
    );

  assert.equal(accountingResult.creditCost, 10);
  assert.equal(
    accountingResult.usage.monthlyCreditsUsed,
    100
  );

  const storedLastCreditUser =
    JSON.parse(
      await fs.readFile(lastCreditUserFile, "utf8")
    );

  assert.equal(
    storedLastCreditUser.monthlyCreditsUsed,
    100
  );

  await assert.rejects(
    recordSuccessfulFinalVideo(
      temporaryRoot,
      lastCreditUserId,
      30
    ),
    (error) =>
      error.code === "CREDIT_LIMIT_REACHED"
  );

  console.log("PASS: Accounting consumes the final positive balance and blocks zero.");

  const concurrentUserId = "starter-concurrent-last-credit-user";
  const concurrentUserFile =
    path.join(usersDirectory, `${concurrentUserId}.json`);

  await fs.writeFile(
    concurrentUserFile,
    JSON.stringify({
      planId: PLAN_IDS.STARTER,
      finalVideoCount: 0,
      monthlyCreditsUsed: 90
    }),
    "utf8"
  );

  const concurrentResults =
    await Promise.allSettled([
      recordSuccessfulFinalVideo(
        temporaryRoot,
        concurrentUserId,
        60
      ),
      recordSuccessfulFinalVideo(
        temporaryRoot,
        concurrentUserId,
        60
      )
    ]);

  const concurrentSuccesses =
    concurrentResults.filter(
      (entry) => entry.status === "fulfilled"
    );

  const concurrentFailures =
    concurrentResults.filter(
      (entry) => entry.status === "rejected"
    );

  assert.equal(concurrentSuccesses.length, 1);
  assert.equal(concurrentFailures.length, 1);
  assert.equal(
    concurrentSuccesses[0].value.creditCost,
    10
  );
  assert.equal(
    concurrentFailures[0].reason.code,
    "CREDIT_LIMIT_REACHED"
  );

  const storedConcurrentUser =
    JSON.parse(
      await fs.readFile(concurrentUserFile, "utf8")
    );

  assert.equal(
    storedConcurrentUser.monthlyCreditsUsed,
    100
  );

  console.log("PASS: Concurrent final-video accounting consumes the last balance exactly once.");

  // A successful paid invoice resets credits exactly once.
  const invoiceResetUserId =
    "invoice-reset-test-user";

  const invoiceResetUserFile =
    path.join(
      usersDirectory,
      `${invoiceResetUserId}.json`
    );

  await fs.writeFile(
    invoiceResetUserFile,
    JSON.stringify({
      planId: PLAN_IDS.STARTER,
      finalVideoCount: 0,
      monthlyCreditsUsed: 100
    }),
    "utf8"
  );

  const invoiceId =
    "in_credit_reset_test";

  let invoiceResetUsage =
    await updateStripeSubscription(
      temporaryRoot,
      invoiceResetUserId,
      {
        planId: PLAN_IDS.STARTER,
        stripeCustomerId: "cus_credit_reset_test",
        stripeSubscriptionId: "sub_credit_reset_test",
        stripeSubscriptionStatus: "active",
        currentPeriodStart:
          "2026-09-22T00:00:00.000Z",
        currentPeriodEnd:
          "2026-10-22T00:00:00.000Z",
        stripeEntitlementVerifiedAt:
          "2026-09-22T00:00:01.000Z",
        resetMonthlyCredits: true,
        creditsResetInvoiceId: invoiceId
      }
    );

  assert.equal(
    invoiceResetUsage.monthlyCreditsUsed,
    0
  );

  assert.equal(
    invoiceResetUsage.lastCreditsResetInvoiceId,
    invoiceId
  );

  invoiceResetUsage =
    await recordSuccessfulFinalVideo(
      temporaryRoot,
      invoiceResetUserId,
      30
    );

  assert.equal(
    invoiceResetUsage.usage.monthlyCreditsUsed,
    10
  );

  const duplicateReset =
    await updateStripeSubscription(
      temporaryRoot,
      invoiceResetUserId,
      {
        planId: PLAN_IDS.STARTER,
        stripeCustomerId: "cus_credit_reset_test",
        stripeSubscriptionId: "sub_credit_reset_test",
        stripeSubscriptionStatus: "active",
        currentPeriodStart:
          "2026-09-22T00:00:00.000Z",
        currentPeriodEnd:
          "2026-10-22T00:00:00.000Z",
        stripeEntitlementVerifiedAt:
          "2026-09-22T00:00:02.000Z",
        resetMonthlyCredits: true,
        creditsResetInvoiceId: invoiceId
      }
    );

  assert.equal(
    duplicateReset.monthlyCreditsUsed,
    10
  );

  assert.equal(
    duplicateReset.lastCreditsResetInvoiceId,
    invoiceId
  );

  const storedInvoiceResetUser =
    JSON.parse(
      await fs.readFile(
        invoiceResetUserFile,
        "utf8"
      )
    );

  assert.equal(
    storedInvoiceResetUser.monthlyCreditsUsed,
    10
  );

  assert.equal(
    storedInvoiceResetUser.lastCreditsResetInvoiceId,
    invoiceId
  );

  console.log(
    "PASS: Paid invoice resets credits once and duplicate delivery cannot restore spent credits."
  );

  await assert.rejects(
    recordSuccessfulFinalVideo(
      temporaryRoot,
      paidUserId,
      61
    ),
    (error) =>
      error.code === "VIDEO_DURATION_LIMIT_EXCEEDED"
  );

  console.log("PASS: Accounting rejects paid video over 60 seconds.");

  const freeDurationUserId = "free-duration-test-user";

  await assert.rejects(
    recordSuccessfulFinalVideo(
      temporaryRoot,
      freeDurationUserId,
      31
    ),
    (error) =>
      error.code === "VIDEO_DURATION_LIMIT_EXCEEDED"
  );

  console.log("PASS: Accounting rejects Free video over 30 seconds.");


const earlyRenewalUserId =
  "early-renewal-reservation-user";

const earlyRenewalUserFile =
  path.join(
    temporaryRoot,
    "users",
    `${earlyRenewalUserId}.json`
  );

await fs.writeFile(
  earlyRenewalUserFile,
  JSON.stringify(
    {
      planId: PLAN_IDS.STARTER,
      monthlyCreditsUsed: 100,
      stripeSubscriptionId:
        "sub_early_renewal_test",
      stripeSubscriptionStatus:
        "active",
      currentPeriodStart:
        "2026-09-01T00:00:00.000Z",
      currentPeriodEnd:
        "2026-10-01T00:00:00.000Z"
    },
    null,
    2
  ),
  "utf8"
);

const earlyRenewalReservations =
  await Promise.all([
    reserveEarlyRenewalOperation(
      temporaryRoot,
      earlyRenewalUserId,
      {
        operationId:
          "early-renewal-operation-a",
        stripeSubscriptionId:
          "sub_early_renewal_test",
        periodStart:
          "2026-09-01T00:00:00.000Z"
      }
    ),
    reserveEarlyRenewalOperation(
      temporaryRoot,
      earlyRenewalUserId,
      {
        operationId:
          "early-renewal-operation-b",
        stripeSubscriptionId:
          "sub_early_renewal_test",
        periodStart:
          "2026-09-01T00:00:00.000Z"
      }
    )
  ]);

assert.equal(
  earlyRenewalReservations.filter(
    (result) => result.created
  ).length,
  1,
  "Exactly one concurrent Early Renewal reservation must be created."
);

assert.equal(
  earlyRenewalReservations.filter(
    (result) => !result.created
  ).length,
  1,
  "The duplicate concurrent Early Renewal reservation must reuse the existing operation."
);

const earlyRenewalOperationIds =
  new Set(
    earlyRenewalReservations.map(
      (result) =>
        result.operation.operationId
    )
  );

assert.equal(
  earlyRenewalOperationIds.size,
  1,
  "Concurrent Early Renewal reservations must resolve to one operation ID."
);

const storedEarlyRenewalOperation =
  await getEarlyRenewalOperation(
    temporaryRoot,
    earlyRenewalUserId
  );

assert.ok(
  storedEarlyRenewalOperation,
  "Early Renewal operation must be persisted."
);

assert.equal(
  storedEarlyRenewalOperation.operationId,
  earlyRenewalReservations[0]
    .operation.operationId
);

assert.equal(
  storedEarlyRenewalOperation.stripeSubscriptionId,
  "sub_early_renewal_test"
);

assert.equal(
  storedEarlyRenewalOperation.periodStart,
  "2026-09-01T00:00:00.000Z"
);

assert.equal(
  storedEarlyRenewalOperation.status,
  "reserved"
);

const repeatedEarlyRenewal =
  await reserveEarlyRenewalOperation(
    temporaryRoot,
    earlyRenewalUserId,
    {
      operationId:
        "early-renewal-operation-c",
      stripeSubscriptionId:
        "sub_early_renewal_test",
      periodStart:
        "2026-09-01T00:00:00.000Z"
    }
  );

assert.equal(
  repeatedEarlyRenewal.created,
  false,
  "A later retry in the same billing period must not create another operation."
);

assert.equal(
  repeatedEarlyRenewal.operation.operationId,
  storedEarlyRenewalOperation.operationId,
  "A later retry must return the original operation."
);

const completedEarlyRenewal =
  await completeEarlyRenewalOperation(
    temporaryRoot,
    earlyRenewalUserId,
    {
      operationId:
        storedEarlyRenewalOperation.operationId,

      stripeSubscriptionId:
        storedEarlyRenewalOperation.stripeSubscriptionId,

      periodStart:
        storedEarlyRenewalOperation.periodStart
    }
  );

assert.equal(
  completedEarlyRenewal.completed,
  true
);

assert.equal(
  completedEarlyRenewal.operation.status,
  "completed"
);

assert.ok(
  completedEarlyRenewal.operation.completedAt
);

const completedEarlyRenewalAgain =
  await completeEarlyRenewalOperation(
    temporaryRoot,
    earlyRenewalUserId,
    {
      operationId:
        storedEarlyRenewalOperation.operationId,

      stripeSubscriptionId:
        storedEarlyRenewalOperation.stripeSubscriptionId,

      periodStart:
        storedEarlyRenewalOperation.periodStart
    }
  );

assert.equal(
  completedEarlyRenewalAgain.completed,
  false,
  "Completing the same Early Renewal operation twice must be idempotent."
);

const storedCompletedEarlyRenewal =
  await getEarlyRenewalOperation(
    temporaryRoot,
    earlyRenewalUserId
  );

assert.equal(
  storedCompletedEarlyRenewal.status,
  "completed"
);

assert.ok(
  storedCompletedEarlyRenewal.completedAt
);

console.log(
  "PASS: Early Renewal completion consumes the reserved operation exactly once."
);

console.log(
  "PASS: Concurrent Early Renewal reservations create one durable operation per subscription period."
);
console.log("PASS: All usage accounting tests passed.");
} finally {
  await fs.rm(temporaryRoot, {
    recursive: true,
    force: true
  });
}
