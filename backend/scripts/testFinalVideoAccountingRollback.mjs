import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  PLAN_IDS,
  getUserUsage,
  recordSuccessfulFinalVideo,
  rollbackSuccessfulFinalVideo
} from "../usageLimits.mjs";

const root =
  await fs.mkdtemp(
    path.join(
      os.tmpdir(),
      "quickad-accounting-rollback-"
    )
  );

async function writeUsage(
  userId,
  data
) {
  const users =
    path.join(root, "users");

  await fs.mkdir(
    users,
    { recursive: true }
  );

  await fs.writeFile(
    path.join(
      users,
      `${userId}.json`
    ),
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

const freeUser = "rollback-free";

await writeUsage(
  freeUser,
  {
    planId: PLAN_IDS.FREE,
    finalVideoCount: 0,
    monthlyCreditsUsed: 0
  }
);

const freeRecorded =
  await recordSuccessfulFinalVideo(
    root,
    freeUser,
    30
  );

assert.equal(
  freeRecorded.usage.finalVideoCount,
  1,
  "Free accounting must first consume one final video."
);

await rollbackSuccessfulFinalVideo(
  root,
  freeUser,
  {
    planId: freeRecorded.planId,
    creditCost: freeRecorded.creditCost
  }
);

let usage =
  await getUserUsage(
    root,
    freeUser
  );

assert.equal(
  usage.finalVideoCount,
  0,
  "Free rollback must restore the consumed final video."
);

assert.equal(
  usage.monthlyCreditsUsed,
  0,
  "Free rollback must not alter paid credits."
);

const paidUser = "rollback-paid";

await writeUsage(
  paidUser,
  {
    planId: PLAN_IDS.STARTER,
    finalVideoCount: 0,
    monthlyCreditsUsed: 40
  }
);

const paidRecorded =
  await recordSuccessfulFinalVideo(
    root,
    paidUser,
    60
  );

assert.equal(
  paidRecorded.creditCost,
  20,
  "60-second Starter accounting must cost 20 credits."
);

assert.equal(
  paidRecorded.usage.monthlyCreditsUsed,
  60,
  "Paid accounting must consume the expected credits."
);

await rollbackSuccessfulFinalVideo(
  root,
  paidUser,
  {
    planId: paidRecorded.planId,
    creditCost: paidRecorded.creditCost
  }
);

usage =
  await getUserUsage(
    root,
    paidUser
  );

assert.equal(
  usage.monthlyCreditsUsed,
  40,
  "Paid rollback must restore exactly the consumed credits."
);

assert.equal(
  usage.finalVideoCount,
  0,
  "Paid rollback must not alter free final-video count."
);

const mismatchUser = "rollback-mismatch";

await writeUsage(
  mismatchUser,
  {
    planId: PLAN_IDS.STARTER,
    finalVideoCount: 0,
    monthlyCreditsUsed: 20
  }
);

await assert.rejects(
  rollbackSuccessfulFinalVideo(
    root,
    mismatchUser,
    {
      planId: PLAN_IDS.PRO,
      creditCost: 20
    }
  ),
  (error) =>
    error?.code ===
      "FINAL_VIDEO_ROLLBACK_PLAN_MISMATCH",
  "Rollback must refuse to mutate usage when the recorded plan no longer matches."
);

usage =
  await getUserUsage(
    root,
    mismatchUser
  );

assert.equal(
  usage.monthlyCreditsUsed,
  20,
  "Rejected rollback must leave usage unchanged."
);

await fs.rm(
  root,
  {
    recursive: true,
    force: true
  }
);

console.log(
  "PASS: Version 1.1.8.38 final video accounting rollback tests"
);