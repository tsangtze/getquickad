import assert from "node:assert/strict";

import {
  beginUserAccountDeletion,
  beginUserAccountOperation,
  endUserAccountDeletion,
  endUserAccountOperation,
  getActiveUserAccountOperations,
  hasActiveUserAccountOperation,
  isUserAccountDeletionInProgress
} from "../accountOperationGuard.mjs";

const userId =
  "user-account-operation-test";

assert.equal(
  hasActiveUserAccountOperation(userId),
  false
);

assert.equal(
  isUserAccountDeletionInProgress(userId),
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

assert.equal(
  beginUserAccountDeletion(userId),
  false
);

assert.equal(
  isUserAccountDeletionInProgress(userId),
  false
);

beginUserAccountOperation(
  userId,
  "video-finalize"
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

endUserAccountOperation(
  userId,
  "project-create"
);

assert.equal(
  hasActiveUserAccountOperation(userId),
  false
);

assert.equal(
  beginUserAccountDeletion(userId),
  true
);

assert.equal(
  isUserAccountDeletionInProgress(userId),
  true
);

assert.equal(
  beginUserAccountDeletion(userId),
  false
);

assert.throws(
  () =>
    beginUserAccountOperation(
      userId,
      "project-create"
    ),
  (error) =>
    error?.code ===
    "ACCOUNT_DELETION_IN_PROGRESS"
);

assert.deepEqual(
  getActiveUserAccountOperations(userId),
  []
);

endUserAccountDeletion(userId);

assert.equal(
  isUserAccountDeletionInProgress(userId),
  false
);

beginUserAccountOperation(
  userId,
  "project-create"
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

endUserAccountOperation(
  userId,
  "not-active"
);

endUserAccountDeletion(
  "not-active-user"
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

assert.throws(
  () =>
    beginUserAccountDeletion(""),
  /required/
);

console.log(
  "PASS: Active operations block account deletion"
);

console.log(
  "PASS: Account deletion blocks new operations"
);

console.log(
  "PASS: Duplicate operations remain reference counted"
);

console.log(
  "PASS: Ending deletion re-enables account operations"
);

console.log(
  "ALL ACCOUNT OPERATION GUARD TESTS PASSED."
);
