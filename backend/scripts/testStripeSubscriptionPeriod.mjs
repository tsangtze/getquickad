import assert from "node:assert/strict";

import {
  stripeSubscriptionPeriodEnd,
  stripeSubscriptionPeriodStart
} from "../stripeSubscriptionPeriod.mjs";

function runTest(name, fn) {
  fn();
  console.log(`PASS: ${name}`);
}

runTest(
  "reads Stripe 22 item-level subscription period",
  () => {
    const subscription = {
      items: {
        data: [
          {
            current_period_start: 1788220800,
            current_period_end: 1790812800
          }
        ]
      }
    };

    assert.equal(
      stripeSubscriptionPeriodStart(subscription),
      1788220800
    );

    assert.equal(
      stripeSubscriptionPeriodEnd(subscription),
      1790812800
    );
  }
);

runTest(
  "uses Stripe multi-item period semantics",
  () => {
    const subscription = {
      items: {
        data: [
          {
            current_period_start: 1788220800,
            current_period_end: 1790900000
          },
          {
            current_period_start: 1788307200,
            current_period_end: 1790812800
          }
        ]
      }
    };

    assert.equal(
      stripeSubscriptionPeriodStart(subscription),
      1788307200
    );

    assert.equal(
      stripeSubscriptionPeriodEnd(subscription),
      1790812800
    );
  }
);

runTest(
  "keeps legacy top-level period compatibility",
  () => {
    const subscription = {
      current_period_start: 100,
      current_period_end: 200,
      items: {
        data: [
          {
            current_period_start: 300,
            current_period_end: 400
          }
        ]
      }
    };

    assert.equal(
      stripeSubscriptionPeriodStart(subscription),
      100
    );

    assert.equal(
      stripeSubscriptionPeriodEnd(subscription),
      200
    );
  }
);

runTest(
  "fails closed when no valid period exists",
  () => {
    assert.equal(
      stripeSubscriptionPeriodStart({}),
      null
    );

    assert.equal(
      stripeSubscriptionPeriodEnd({}),
      null
    );

    assert.equal(
      stripeSubscriptionPeriodStart({
        items: {
          data: [
            {
              current_period_start: 0
            }
          ]
        }
      }),
      null
    );
  }
);

runTest(
  "fails closed when any subscription item period is missing",
  () => {
    const missingStart = {
      items: {
        data: [
          {
            current_period_start: 1788220800,
            current_period_end: 1790812800
          },
          {
            current_period_end: 1790812800
          }
        ]
      }
    };

    assert.equal(
      stripeSubscriptionPeriodStart(missingStart),
      null
    );

    const missingEnd = {
      items: {
        data: [
          {
            current_period_start: 1788220800,
            current_period_end: 1790812800
          },
          {
            current_period_start: 1788220800
          }
        ]
      }
    };

    assert.equal(
      stripeSubscriptionPeriodEnd(missingEnd),
      null
    );
  }
);
console.log(
  "All Stripe subscription period compatibility tests passed."
);