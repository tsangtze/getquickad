import assert from "node:assert/strict";

import {
  deleteUserAccount
} from "../accountDeletionService.mjs";

const projectRoot =
  "TEST_PROJECT_ROOT";

const userId =
  "account-delete-user";

const calls =
  [];

const result =
  await deleteUserAccount(
    projectRoot,
    userId,
    {
      beginDeletion:
        (id) => {
          calls.push(
            `begin:${id}`
          );

          return true;
        },

      endDeletion:
        (id) => {
          calls.push(
            `end:${id}`
          );
        },

      readBillingState:
        async (root, id) => {
          calls.push(
            `billing:${root}:${id}`
          );

          return {
            stripeSubscriptionId:
              "sub_test_123"
          };
        },

      cancelSubscription:
        async (subscriptionId) => {
          calls.push(
            `stripe:${subscriptionId}`
          );

          return {
            canceled: true,
            missing: false
          };
        },

      markDeleted:
        async (root, id) => {
          calls.push(
            `tombstone:${root}:${id}`
          );

          return {
            marked: true
          };
        },

      deleteProjects:
        async (root, id) => {
          calls.push(
            `projects:${root}:${id}`
          );

          return {
            deletedProjects: 3
          };
        },

      deleteUsage:
        async (root, id) => {
          calls.push(
            `usage:${root}:${id}`
          );

          return {
            deleted: true
          };
        },

      deleteAuthUser:
        async (id) => {
          calls.push(
            `auth:${id}`
          );

          return {
            deleted: true
          };
        }
    }
  );

assert.deepEqual(
  calls,
  [
    `begin:${userId}`,
    `billing:${projectRoot}:${userId}`,
    "stripe:sub_test_123",
    `tombstone:${projectRoot}:${userId}`,
    `projects:${projectRoot}:${userId}`,
    `usage:${projectRoot}:${userId}`,
    `auth:${userId}`,
    `end:${userId}`
  ]
);

assert.deepEqual(
  result,
  {
    deleted: true,
    deletedProjects: 3,
    subscriptionCanceled: true,
    subscriptionMissing: false
  }
);

console.log(
  "PASS: Account deletion runs in required order"
);

const busyCalls =
  [];

await assert.rejects(
  deleteUserAccount(
    projectRoot,
    userId,
    {
      beginDeletion:
        () => {
          busyCalls.push(
            "begin"
          );

          return false;
        },

      endDeletion:
        () => {
          busyCalls.push(
            "end"
          );
        },

      readBillingState:
        async () => {
          busyCalls.push(
            "billing"
          );

          return {};
        }
    }
  ),
  (error) =>
    error?.code ===
    "ACCOUNT_DELETE_BUSY"
);

assert.deepEqual(
  busyCalls,
  [
    "begin"
  ]
);

console.log(
  "PASS: Busy account stops before destructive work"
);

const stripeFailure =
  new Error(
    "Injected Stripe failure"
  );

const stripeFailureCalls =
  [];

await assert.rejects(
  deleteUserAccount(
    projectRoot,
    userId,
    {
      beginDeletion:
        () => {
          stripeFailureCalls.push(
            "begin"
          );

          return true;
        },

      endDeletion:
        () => {
          stripeFailureCalls.push(
            "end"
          );
        },

      readBillingState:
        async () => {
          stripeFailureCalls.push(
            "billing"
          );

          return {
            stripeSubscriptionId:
              "sub_failure"
          };
        },

      cancelSubscription:
        async () => {
          stripeFailureCalls.push(
            "stripe"
          );

          throw stripeFailure;
        },

      markDeleted:
        async () => {
          stripeFailureCalls.push(
            "tombstone"
          );
        }
    }
  ),
  (error) =>
    error === stripeFailure
);

assert.deepEqual(
  stripeFailureCalls,
  [
    "begin",
    "billing",
    "stripe",
    "end"
  ]
);

console.log(
  "PASS: Stripe failure stops before tombstone and destructive deletion"
);

const postTombstoneFailure =
  new Error(
    "Injected project deletion failure"
  );

const postTombstoneCalls =
  [];

await assert.rejects(
  deleteUserAccount(
    projectRoot,
    userId,
    {
      beginDeletion:
        () => {
          postTombstoneCalls.push(
            "begin"
          );

          return true;
        },

      endDeletion:
        () => {
          postTombstoneCalls.push(
            "end"
          );
        },

      readBillingState:
        async () => {
          postTombstoneCalls.push(
            "billing"
          );

          return {
            stripeSubscriptionId: null
          };
        },

      cancelSubscription:
        async () => {
          postTombstoneCalls.push(
            "stripe"
          );

          return {
            canceled: false,
            missing: false
          };
        },

      markDeleted:
        async () => {
          postTombstoneCalls.push(
            "tombstone"
          );
        },

      deleteProjects:
        async () => {
          postTombstoneCalls.push(
            "projects"
          );

          throw postTombstoneFailure;
        },

      deleteUsage:
        async () => {
          postTombstoneCalls.push(
            "usage"
          );
        },

      deleteAuthUser:
        async () => {
          postTombstoneCalls.push(
            "auth"
          );
        }
    }
  ),
  (error) =>
    error ===
    postTombstoneFailure
);

assert.deepEqual(
  postTombstoneCalls,
  [
    "begin",
    "billing",
    "stripe",
    "tombstone",
    "projects",
    "end"
  ]
);

console.log(
  "PASS: Post-tombstone failure releases deletion claim for retry"
);

console.log(
  "ALL ACCOUNT DELETION ORCHESTRATOR TESTS PASSED."
);