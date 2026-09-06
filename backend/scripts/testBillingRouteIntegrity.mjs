import assert from "node:assert/strict";
import fs from "node:fs/promises";

const routeUrl =
  new URL(
    "../billingRoutes.mjs",
    import.meta.url
  );

const source =
  await fs.readFile(
    routeUrl,
    "utf8"
  );

function sectionBetween(
  startMarker,
  endMarker
) {
  const start =
    source.indexOf(startMarker);

  assert.notEqual(
    start,
    -1,
    `Missing start marker: ${startMarker}`
  );

  const end =
    source.indexOf(
      endMarker,
      start + startMarker.length
    );

  assert.notEqual(
    end,
    -1,
    `Missing end marker: ${endMarker}`
  );

  return source.slice(
    start,
    end
  );
}

const checkout =
  sectionBetween(
    '"/checkout"',
    '"/portal"'
  );

assert.equal(
  (
    checkout.match(
      /reconcilePaidEntitlement\(/g
    ) || []
  ).length,
  1,
  "Checkout must reconcile entitlement exactly once."
);

assert.match(
  checkout,
  /force:\s*true/
);

assert.match(
  checkout,
  /requireFreshVerification:\s*true/
);

assert.match(
  checkout,
  /error\?\.code\s*===\s*"STRIPE_ENTITLEMENT_UNAVAILABLE"/
);

assert.match(
  checkout,
  /status\(503\)/
);

assert.match(
  checkout,
  /code:\s*"STRIPE_ENTITLEMENT_UNAVAILABLE"/
);

assert.match(
  checkout,
  /subscriptionStatus\s*===\s*"active"/
);

assert.match(
  checkout,
  /subscriptionStatus\s*===\s*"trialing"/
);

assert.match(
  checkout,
  /status\(409\)/
);

assert.match(
  checkout,
  /"BILLING_ACTIVE_SUBSCRIPTION_EXISTS"/
);

const strictPosition =
  checkout.indexOf(
    "requireFreshVerification: true"
  );

const duplicateBlockPosition =
  checkout.indexOf(
    "BILLING_ACTIVE_SUBSCRIPTION_EXISTS"
  );

const sessionCreatePosition =
  checkout.indexOf(
    "stripe.checkout.sessions.create"
  );

assert.ok(
  strictPosition >= 0 &&
  strictPosition < duplicateBlockPosition,
  "Strict verification must happen before duplicate-subscription decision."
);

assert.ok(
  duplicateBlockPosition >= 0 &&
  duplicateBlockPosition <
    sessionCreatePosition,
  "Duplicate-subscription block must happen before Checkout session creation."
);

console.log(
  "PASS: Checkout strictly verifies entitlement before allowing a new subscription."
);

const portalStart =
  source.indexOf(
    '"/portal"'
  );

assert.notEqual(
  portalStart,
  -1,
  "Missing Portal route."
);

const portal =
  source.slice(portalStart);

assert.equal(
  (
    portal.match(
      /reconcilePaidEntitlement\(/g
    ) || []
  ).length,
  1,
  "Portal must reconcile entitlement exactly once."
);

assert.match(
  portal,
  /force:\s*true/
);

assert.doesNotMatch(
  portal,
  /requireFreshVerification:\s*true/
);

assert.match(
  portal,
  /!billingState\.stripeCustomerId\s*\|\|\s*!billingState\.stripeSubscriptionId/
);

const portalReconcilePosition =
  portal.indexOf(
    "reconcilePaidEntitlement"
  );

const portalIdGatePosition =
  portal.indexOf(
    "!billingState.stripeCustomerId"
  );

const portalSessionPosition =
  portal.indexOf(
    "stripe.billingPortal.sessions.create"
  );

assert.ok(
  portalReconcilePosition >= 0 &&
  portalReconcilePosition <
    portalIdGatePosition,
  "Portal reconciliation must happen before its Stripe-ID gate."
);

assert.ok(
  portalIdGatePosition >= 0 &&
  portalIdGatePosition <
    portalSessionPosition,
  "Portal must require customer and subscription IDs before creating a Portal session."
);

console.log(
  "PASS: Portal reconciles before requiring both Stripe identifiers."
);

console.log(
  "ALL BILLING ROUTE INTEGRITY TESTS PASSED."
);