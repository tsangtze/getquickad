import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  deleteUserUsageForAccountDeletion,
  getUserUsage
} from "../usageLimits.mjs";

const root =
  await fs.mkdtemp(
    path.join(
      os.tmpdir(),
      "pix2vid-account-usage-delete-"
    )
  );

try {
  const usersDirectory =
    path.join(root, "users");

  await fs.mkdir(
    usersDirectory,
    {
      recursive: true
    }
  );

  const targetUserId =
    "target-user";

  const otherUserId =
    "other-user";

  const targetFile =
    path.join(
      usersDirectory,
      `${targetUserId}.json`
    );

  const otherFile =
    path.join(
      usersDirectory,
      `${otherUserId}.json`
    );

  await fs.writeFile(
    targetFile,
    JSON.stringify({
      finalVideoCount: 2,
      planId: "pro"
    }),
    "utf8"
  );

  await fs.writeFile(
    otherFile,
    JSON.stringify({
      finalVideoCount: 1,
      planId: "starter"
    }),
    "utf8"
  );

  const result =
    await deleteUserUsageForAccountDeletion(
      root,
      targetUserId
    );

  assert.deepEqual(
    result,
    {
      deleted: true
    }
  );

  await assert.rejects(
    fs.access(targetFile)
  );

  await fs.access(otherFile);

  const otherUsage =
    await getUserUsage(
      root,
      otherUserId
    );

  assert.equal(
    otherUsage.finalVideoCount,
    1
  );

  assert.equal(
    otherUsage.planId,
    "starter"
  );

  const secondResult =
    await deleteUserUsageForAccountDeletion(
      root,
      targetUserId
    );

  assert.deepEqual(
    secondResult,
    {
      deleted: true
    }
  );

  await fs.access(otherFile);

  console.log(
    "PASS: Target usage file deleted"
  );

  console.log(
    "PASS: Other user's usage file preserved"
  );

  console.log(
    "PASS: Repeated deletion is safe"
  );

  console.log(
    "ALL ACCOUNT USAGE DELETION TESTS PASSED."
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
