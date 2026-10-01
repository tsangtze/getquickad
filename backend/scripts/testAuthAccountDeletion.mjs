import assert from "node:assert/strict";

import {
  deleteAuthUserForAccountDeletion
} from "../authService.mjs";

const calls =
  [];

const result =
  await deleteAuthUserForAccountDeletion(
    "  auth-user-123  ",
    {
      deleteUser:
        async (userId) => {
          calls.push(userId);

          return {
            data: {
              user: null
            },
            error: null
          };
        }
    }
  );

assert.deepEqual(
  calls,
  [
    "auth-user-123"
  ]
);

assert.deepEqual(
  result,
  {
    deleted: true
  }
);

console.log(
  "PASS: Auth deletion trims and deletes requested user"
);

const supabaseError =
  new Error(
    "Injected Supabase deletion failure"
  );

await assert.rejects(
  deleteAuthUserForAccountDeletion(
    "auth-user-456",
    {
      deleteUser:
        async () => ({
          data: null,
          error: supabaseError
        })
    }
  ),
  (error) =>
    error === supabaseError
);

console.log(
  "PASS: Supabase deletion error is propagated"
);

await assert.rejects(
  deleteAuthUserForAccountDeletion(
    "   ",
    {
      deleteUser:
        async () => {
          throw new Error(
            "Delete function should not run for blank user ID."
          );
        }
    }
  ),
  /user ID is required/i
);

console.log(
  "PASS: Blank user ID is rejected before deletion"
);

console.log(
  "ALL AUTH ACCOUNT DELETION TESTS PASSED."
);