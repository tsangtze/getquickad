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

const requestContextPosition =
  source.indexOf(
    "isTrustedApplicationRequest("
  );

const checkoutRoutePosition =
  source.indexOf(
    '"/checkout"'
  );

const earlyRenewalRoutePosition =
  source.indexOf(
    '"/early-renewal"'
  );

const portalRoutePosition =
  source.indexOf(
    '"/portal"'
  );

assert.ok(
  requestContextPosition >= 0 &&
  requestContextPosition < checkoutRoutePosition,
  "Billing request-context guard must run before Checkout."
);

assert.ok(
  requestContextPosition >= 0 &&
  requestContextPosition < portalRoutePosition,
  "Billing request-context guard must run before Portal."
);

assert.match(
  source,
  /code:\s*"BILLING_ORIGIN_REQUIRED"/
);

const checkout =
  sectionBetween(
    '"/checkout"',
    '"/early-renewal"'
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

assert.ok(
  requestContextPosition >= 0 &&
  requestContextPosition <
    earlyRenewalRoutePosition,
  "Billing request-context guard must run before Early Renewal."
);

assert.ok(
  checkoutRoutePosition >= 0 &&
  checkoutRoutePosition <
    earlyRenewalRoutePosition &&
  earlyRenewalRoutePosition <
    portalRoutePosition,
  "Billing routes must keep Checkout, Early Renewal, then Portal ordering."
);

const earlyRenewal =
  sectionBetween(
    '"/early-renewal"',
    '"/portal"'
  );

assert.equal(
  (
    earlyRenewal.match(
      /reconcilePaidEntitlement\(/g
    ) || []
  ).length,
  1,
  "Early Renewal must reconcile entitlement exactly once."
);

assert.match(
  earlyRenewal,
  /force:\s*true/
);

assert.match(
  earlyRenewal,
  /requireFreshVerification:\s*true/
);

assert.match(
  earlyRenewal,
  /PLAN_IDS\.STARTER/
);

assert.match(
  earlyRenewal,
  /PLAN_IDS\.PRO/
);

assert.match(
  earlyRenewal,
  /subscriptionStatus\s*===\s*"active"/
);

assert.match(
  earlyRenewal,
  /subscriptionStatus\s*===\s*"trialing"/
);

assert.match(
  earlyRenewal,
  /creditsRemaining\s*!==\s*0/
);

assert.match(
  earlyRenewal,
  /"EARLY_RENEWAL_CREDITS_REMAINING"/
);

assert.match(
  earlyRenewal,
  /"EARLY_RENEWAL_NOT_ACTIVE_PAID"/
);

assert.doesNotMatch(
  earlyRenewal,
  /"EARLY_RENEWAL_PAYMENT_NOT_WIRED"/
);

assert.match(
  earlyRenewal,
  /reserveEarlyRenewalOperation\(/
);

assert.match(
  earlyRenewal,
  /startEarlyRenewalStripePeriod\(/
);

assert.match(
  earlyRenewal,
  /stripe\.subscriptions\.update\(/
);

assert.match(
  earlyRenewal,
  /randomUUID\(/
);

assert.match(
  earlyRenewal,
  /operation\.operationId/
);

assert.match(
  earlyRenewal,
  /status\(202\)/
);

assert.match(
  earlyRenewal,
  /renewalStarted:\s*true/
);

assert.match(
  earlyRenewal,
  /"EARLY_RENEWAL_PAYMENT_UNAVAILABLE"/
);

assert.match(
  earlyRenewal,
  /Stripe Early Renewal payment failed:/
);

const earlyReservationPosition =
  earlyRenewal.indexOf(
    "reserveEarlyRenewalOperation("
  );

const earlyStripeUpdatePosition =
  earlyRenewal.indexOf(
    "startEarlyRenewalStripePeriod("
  );

const earlyPaymentFailurePosition =
  earlyRenewal.indexOf(
    "EARLY_RENEWAL_PAYMENT_UNAVAILABLE"
  );

assert.ok(
  earlyReservationPosition >= 0 &&
  earlyReservationPosition <
    earlyStripeUpdatePosition,
  "Early Renewal must reserve its durable operation before calling Stripe."
);

assert.ok(
  earlyStripeUpdatePosition >= 0 &&
  earlyStripeUpdatePosition <
    earlyPaymentFailurePosition,
  "Stripe Early Renewal failures must be handled by the payment-stage boundary."
);

const earlyStrictPosition =
  earlyRenewal.indexOf(
    "requireFreshVerification: true"
  );

const earlyCreditGatePosition =
  earlyRenewal.indexOf(
    "creditsRemaining !== 0"
  );

const earlyPaymentStagePosition =
  earlyRenewal.indexOf(
    "reserveEarlyRenewalOperation("
  );

assert.ok(
  earlyStrictPosition >= 0 &&
  earlyStrictPosition <
    earlyCreditGatePosition,
  "Fresh Stripe verification must happen before the Early Renewal credit gate."
);

assert.ok(
  earlyCreditGatePosition >= 0 &&
  earlyCreditGatePosition <
    earlyPaymentStagePosition,
  "Zero-credit eligibility must be enforced before the Early Renewal payment stage."
);

console.log(
  "PASS: Early Renewal requires fresh paid entitlement and exactly zero remaining credits."
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
