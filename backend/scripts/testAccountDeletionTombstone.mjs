import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import {
  isUserAccountDeleted,
  markUserAccountDeleted
} from "../usageLimits.mjs";

const root =
  await fs.mkdtemp(
    path.join(
      os.tmpdir(),
      "pix2vid-account-tombstone-"
    )
  );

try {
  const userId =
    "deleted-user";

  const otherUserId =
    "other-user";

  assert.equal(
    await isUserAccountDeleted(
      root,
      userId
    ),
    false
  );

  assert.equal(
    await isUserAccountDeleted(
      root,
      otherUserId
    ),
    false
  );

  const result =
    await markUserAccountDeleted(
      root,
      userId
    );

  assert.deepEqual(
    result,
    {
      marked: true
    }
  );

  assert.equal(
    await isUserAccountDeleted(
      root,
      userId
    ),
    true
  );

  assert.equal(
    await isUserAccountDeleted(
      root,
      otherUserId
    ),
    false
  );

  const tombstone =
    JSON.parse(
      await fs.readFile(
        path.join(
          root,
          "users",
          `${createHash("sha256").update(userId).digest("hex")}.json.deleted`
        ),
        "utf8"
      )
    );

  assert.ok(
    typeof tombstone.deletedAt === "string" &&
    tombstone.deletedAt.length > 0
  );

  await markUserAccountDeleted(
    root,
    userId
  );

  assert.equal(
    await isUserAccountDeleted(
      root,
      userId
    ),
    true
  );

  console.log(
    "PASS: Deleted account starts unmarked"
  );

  console.log(
    "PASS: Account deletion tombstone persists"
  );

  console.log(
    "PASS: Other users are unaffected"
  );

  console.log(
    "PASS: Repeated tombstone marking is safe"
  );

  console.log(
    "ALL ACCOUNT DELETION TOMBSTONE TESTS PASSED."
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
