import assert from "node:assert/strict";

import {
  beginUserAccountOperation,
  endUserAccountOperation,
  getActiveUserAccountOperations,
  hasActiveUserAccountOperation
} from "../accountOperationGuard.mjs";

const userId =
  "user-account-operation-test";

assert.equal(
  hasActiveUserAccountOperation(userId),
  false
);

assert.deepEqual(
  getActiveUserAccountOperations(userId),
  []
);

beginUserAccountOperation(
  userId,
  "project-create"
);

assert.equal(
  hasActiveUserAccountOperation(userId),
  true
);

assert.deepEqual(
  getActiveUserAccountOperations(userId),
  ["project-create"]
);

beginUserAccountOperation(
  userId,
  "video-finalize"
);

assert.deepEqual(
  getActiveUserAccountOperations(userId),
  [
    "project-create",
    "video-finalize"
  ]
);

beginUserAccountOperation(
  userId,
  "video-finalize"
);

endUserAccountOperation(
  userId,
  "video-finalize"
);

assert.deepEqual(
  getActiveUserAccountOperations(userId),
  [
    "project-create",
    "video-finalize"
  ]
);

endUserAccountOperation(
  userId,
  "video-finalize"
);

assert.deepEqual(
  getActiveUserAccountOperations(userId),
  ["project-create"]
);

endUserAccountOperation(
  userId,
  "project-create"
);

assert.equal(
  hasActiveUserAccountOperation(userId),
  false
);

assert.deepEqual(
  getActiveUserAccountOperations(userId),
  []
);

endUserAccountOperation(
  userId,
  "not-active"
);

assert.throws(
  () =>
    beginUserAccountOperation(
      "",
      "video-finalize"
    ),
  /required/
);

assert.throws(
  () =>
    beginUserAccountOperation(
      userId,
      ""
    ),
  /required/
);

console.log(
  "ALL ACCOUNT OPERATION GUARD TESTS PASSED."
);
