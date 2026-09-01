import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  PLAN_IDS,
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

// Starter with only 14 credits remaining cannot make a 31-45 sec video.
result =
  canGenerateFinalVideo(
    usage(
      PLAN_IDS.STARTER,
      { monthlyCreditsUsed: 86 }
    ),
    project(),
    31
  );

assert.equal(result.ok, false);
assert.equal(
  result.code,
  "CREDIT_LIMIT_REACHED"
);

console.log("PASS: Insufficient credits block generation.");

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
