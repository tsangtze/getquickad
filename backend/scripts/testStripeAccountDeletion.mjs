import assert from "node:assert/strict";

import {
  cancelStripeSubscriptionForAccountDeletion
} from "../stripeService.mjs";

async function runTest(name, fn) {
  await fn();
  console.log(`PASS: ${name}`);
}

await runTest(
  "Missing subscription ID does not call Stripe",
  async () => {
    let calls = 0;

    const result =
      await cancelStripeSubscriptionForAccountDeletion(
        "   ",
        {
          cancelSubscription:
            async () => {
              calls++;
              throw new Error(
                "Cancellation should not run"
              );
            }
        }
      );

    assert.equal(calls, 0);

    assert.deepEqual(
      result,
      {
        canceled: false,
        missing: false
      }
    );
  }
);

await runTest(
  "Existing subscription is canceled immediately",
  async () => {
    const canceledIds = [];

    const result =
      await cancelStripeSubscriptionForAccountDeletion(
        "  sub_account_delete  ",
        {
          cancelSubscription:
            async (subscriptionId) => {
              canceledIds.push(
                subscriptionId
              );
            }
        }
      );

    assert.deepEqual(
      canceledIds,
      [
        "sub_account_delete"
      ]
    );

    assert.deepEqual(
      result,
      {
        canceled: true,
        missing: false
      }
    );
  }
);

await runTest(
  "resource_missing is treated as already deleted",
  async () => {
    const result =
      await cancelStripeSubscriptionForAccountDeletion(
        "sub_missing",
        {
          cancelSubscription:
            async () => {
              const error =
                new Error(
                  "No such subscription"
                );

              error.code =
                "resource_missing";

              throw error;
            }
        }
      );

    assert.deepEqual(
      result,
      {
        canceled: false,
        missing: true
      }
    );
  }
);

await runTest(
  "Real Stripe failure blocks account deletion",
  async () => {
    const stripeError =
      new Error(
        "Temporary Stripe outage"
      );

    stripeError.code =
      "api_connection_error";

    await assert.rejects(
      () =>
        cancelStripeSubscriptionForAccountDeletion(
          "sub_failure",
          {
            cancelSubscription:
              async () => {
                throw stripeError;
              }
          }
        ),
      error =>
        error === stripeError
    );
  }
);

console.log(
  "\nALL STRIPE ACCOUNT DELETION TESTS PASSED."
);
