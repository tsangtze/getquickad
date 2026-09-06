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
  recordSuccessfulFinalVideo
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

  console.log("PASS: All usage accounting tests passed.");
} finally {
  await fs.rm(temporaryRoot, {
    recursive: true,
    force: true
  });
}
