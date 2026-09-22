import express from "express";
import cookieParser from "cookie-parser";
import Stripe from "stripe";
import { randomUUID } from "node:crypto";

import { requireUser } from "./authRoutes.mjs";
import {
  reconcilePaidEntitlement
} from "./stripeEntitlement.mjs";
import { authConfiguration } from "./authService.mjs";
import {
  startEarlyRenewalStripePeriod
} from "./earlyRenewalStripe.mjs";
import { isTrustedApplicationRequest } from "./requestContext.mjs";
import {
  getPlan,
  getStripeBillingState,
  getUserUsage,
  PLAN_IDS,
  reserveEarlyRenewalOperation
} from "./usageLimits.mjs";

function cleanEnvironmentValue(value) {
  return String(value ?? "").trim();
}

function stripeConfiguration() {
  return {
    secretKey:
      cleanEnvironmentValue(
        process.env.STRIPE_SECRET_KEY
      ),

    starterPriceId:
      cleanEnvironmentValue(
        process.env.STRIPE_STARTER_PRICE_ID
      ),

    proPriceId:
      cleanEnvironmentValue(
        process.env.STRIPE_PRO_PRICE_ID
      )
  };
}

function createStripeClient() {
  const configuration =
    stripeConfiguration();

  if (!configuration.secretKey) {
    const error =
      new Error("Stripe billing is not configured.");

    error.code = "STRIPE_NOT_CONFIGURED";
    throw error;
  }

  return new Stripe(configuration.secretKey);
}

function priceForPlan(planId) {
  const configuration =
    stripeConfiguration();

  if (planId === "starter") {
    return configuration.starterPriceId;
  }

  if (planId === "pro") {
    return configuration.proPriceId;
  }

  return "";
}

function applicationUrl(pathname) {
  const origin =
    authConfiguration().applicationOrigin;

  return new URL(pathname, origin).toString();
}

function stripeLocaleForLanguage(language) {
  if (language === "zh-TW") {
    return "zh-Hant-TW";
  }

  const supported = new Set([
    "en",
    "es",
    "pt",
    "fr",
    "de",
    "it",
    "ja",
    "ko",
    "zh",
    "tr"
  ]);

  return supported.has(language)
    ? language
    : "auto";
}

export function createBillingRouter({
  projectRoot,
  stripeClientFactory = createStripeClient,
  requireUserMiddleware = requireUser
}) {
  const router = express.Router();

  router.use(cookieParser());

  router.use((_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
  });

  router.use((request, response, next) => {
    if (
      !isTrustedApplicationRequest(
        request,
        authConfiguration().applicationOrigin
      )
    ) {
      return response.status(403).json({
        ok: false,
        code: "BILLING_ORIGIN_REQUIRED",
        error: "This request must come from Pix2Vid."
      });
    }

    next();
  });

  router.post(
    "/checkout",
    requireUserMiddleware,
    async (request, response) => {
      try {
        const planId =
          String(request.body?.planId || "")
            .trim()
            .toLowerCase();

        const stripeLocale =
          stripeLocaleForLanguage(
            String(request.body?.language || "")
              .trim()
          );

        if (
          planId !== "starter" &&
          planId !== "pro"
        ) {
          return response.status(400).json({
            ok: false,
            code: "BILLING_PLAN_INVALID",
            error: "Choose Starter or Pro."
          });
        }

        const priceId =
          priceForPlan(planId);

        if (!priceId) {
          return response.status(503).json({
            ok: false,
            code: "BILLING_PLAN_UNAVAILABLE",
            error:
              "This Pix2Vid plan is not configured for checkout."
          });
        }

        const stripe =
          stripeClientFactory();

        const userId =
          String(request.authUser.id);
        await reconcilePaidEntitlement(
          projectRoot,
          userId,
          {
            retrieveSubscription:
              (id) =>
                stripe.subscriptions.retrieve(id),
            force: true,
            requireFreshVerification: true
          }
        );

        const billingState =
          await getStripeBillingState(
            projectRoot,
            userId
          );

        const subscriptionStatus =
          String(
            billingState.stripeSubscriptionStatus ||
            ""
          )
            .trim()
            .toLowerCase();

        if (
          subscriptionStatus === "active" ||
          subscriptionStatus === "trialing"
        ) {
          return response.status(409).json({
            ok: false,
            code: "BILLING_ACTIVE_SUBSCRIPTION_EXISTS",
            error:
              "You already have an active subscription. Use Manage Subscription to change or cancel your plan."
          });
        }

        const session =
          await stripe.checkout.sessions.create({
            mode: "subscription",
            locale: stripeLocale,

            line_items: [
              {
                price: priceId,
                quantity: 1
              }
            ],

            customer_email:
              request.authUser.email || undefined,

            client_reference_id:
              userId,

            metadata: {
              quickadUserId: userId,
              planId
            },

            subscription_data: {
              metadata: {
                quickadUserId: userId,
                planId
              }
            },

            success_url:
              applicationUrl(
                "/billing.html?checkout=success"
              ),

            cancel_url:
              applicationUrl(
                "/billing.html?checkout=cancelled"
              )
          });

        if (!session.url) {
          throw new Error(
            "Stripe did not return a Checkout URL."
          );
        }

        response.json({
          ok: true,
          url: session.url
        });
      } catch (error) {
        if (
          error?.code ===
          "STRIPE_ENTITLEMENT_UNAVAILABLE"
        ) {
          response.status(503).json({
            ok: false,
            code:
              "STRIPE_ENTITLEMENT_UNAVAILABLE",
            error:
              "Subscription verification is temporarily unavailable. Please try again."
          });
          return;
        }

        console.error(
          "Stripe Checkout session failed:",
          error
        );

        response.status(503).json({
          ok: false,
          code: "BILLING_CHECKOUT_UNAVAILABLE",
          error:
            "Checkout is temporarily unavailable. Please try again."
        });
      }
    }
  );

  router.post(
    "/early-renewal",
    requireUserMiddleware,
    async (request, response) => {
      try {
        const stripe =
          stripeClientFactory();

        const userId =
          String(request.authUser.id);

        await reconcilePaidEntitlement(
          projectRoot,
          userId,
          {
            retrieveSubscription:
              (id) =>
                stripe.subscriptions.retrieve(id),
            force: true,
            requireFreshVerification: true
          }
        );

        const [
          usage,
          billingState
        ] = await Promise.all([
          getUserUsage(
            projectRoot,
            userId
          ),
          getStripeBillingState(
            projectRoot,
            userId
          )
        ]);

        const plan =
          getPlan(usage.planId);

        const creditsRemaining =
          Math.max(
            0,
            Number(plan.monthlyCredits) -
              Number(
                usage.monthlyCreditsUsed
              )
          );

        const subscriptionStatus =
          String(
            billingState
              .stripeSubscriptionStatus ||
            ""
          )
            .trim()
            .toLowerCase();

        const activePaidSubscription =
          (
            usage.planId ===
              PLAN_IDS.STARTER ||
            usage.planId ===
              PLAN_IDS.PRO
          ) &&
          (
            subscriptionStatus ===
              "active" ||
            subscriptionStatus ===
              "trialing"
          ) &&
          Boolean(
            billingState
              .stripeSubscriptionId
          );

        if (!activePaidSubscription) {
          return response.status(409).json({
            ok: false,
            code:
              "EARLY_RENEWAL_NOT_ACTIVE_PAID",
            error:
              "An active paid subscription is required."
          });
        }

        if (creditsRemaining !== 0) {
          return response.status(409).json({
            ok: false,
            code:
              "EARLY_RENEWAL_CREDITS_REMAINING",
            error:
              "Early renewal is available only after all monthly credits have been used.",
            creditsRemaining
          });
        }

        const stripeSubscriptionId =
          String(
            billingState.stripeSubscriptionId ||
              ""
          ).trim();

        const periodStart =
          String(
            usage.currentPeriodStart ||
              billingState.currentPeriodStart ||
              ""
          ).trim();

        if (!periodStart) {
          return response.status(409).json({
            ok: false,
            code:
              "EARLY_RENEWAL_PERIOD_START_MISSING",
            error:
              "The current subscription period could not be verified."
          });
        }

        const reservation =
          await reserveEarlyRenewalOperation(
            projectRoot,
            userId,
            {
              operationId:
                randomUUID(),

              stripeSubscriptionId,
              periodStart
            }
          );

        const operation =
          reservation.operation;

        if (
          !operation ||
          operation.status !== "reserved"
        ) {
          return response.status(409).json({
            ok: false,
            code:
              "EARLY_RENEWAL_OPERATION_UNAVAILABLE",
            error:
              "Early renewal is not available for this subscription period."
          });
        }

        let updatedSubscription;

        try {
          updatedSubscription =
            await startEarlyRenewalStripePeriod({
              stripeSubscriptionId:
                operation.stripeSubscriptionId,

              operationId:
                operation.operationId,

              updateSubscription:
                (subscriptionId, parameters, options) =>
                  stripe.subscriptions.update(
                    subscriptionId,
                    parameters,
                    options
                  )
            });
        } catch (error) {
          console.error(
            "Stripe Early Renewal payment failed:",
            error
          );

          return response.status(503).json({
            ok: false,
            code:
              "EARLY_RENEWAL_PAYMENT_UNAVAILABLE",
            error:
              "Early renewal could not be completed. Please try again."
          });
        }

        return response.status(202).json({
          ok: true,
          renewalStarted: true,
          operationId:
            operation.operationId,
          subscriptionId:
            updatedSubscription?.id ||
            operation.stripeSubscriptionId
        });
      } catch (error) {
        console.error(
          "Early Renewal request failed before payment:",
          error
        );

        const unavailable =
          error?.code ===
            "STRIPE_ENTITLEMENT_UNAVAILABLE";

        return response
          .status(unavailable ? 503 : 500)
          .json({
            ok: false,
            code:
              unavailable
                ? "BILLING_VERIFICATION_UNAVAILABLE"
                : "EARLY_RENEWAL_ELIGIBILITY_FAILED",
            error:
              unavailable
                ? "Subscription verification is temporarily unavailable."
                : "Unable to verify early renewal eligibility."
          });
      }
    }
  );
  router.post(
    "/portal",
    requireUserMiddleware,
    async (request, response) => {
      try {
        const userId =
          String(request.authUser.id);

        const stripeLocale =
          stripeLocaleForLanguage(
            String(request.body?.language || "")
              .trim()
          );
        const stripe =
          stripeClientFactory();

        await reconcilePaidEntitlement(
          projectRoot,
          userId,
          {
            retrieveSubscription:
              (id) =>
                stripe.subscriptions.retrieve(id),
            force: true
          }
        );

        const billingState =
          await getStripeBillingState(
            projectRoot,
            userId
          );
        if (
          !billingState.stripeCustomerId ||
          !billingState.stripeSubscriptionId
        ) {
          return response.status(400).json({
            ok: false,
            code: "BILLING_NO_PAID_SUBSCRIPTION",
            error:
              "No paid subscription was found for this account."
          });
        }

        const session =
          await stripe.billingPortal.sessions.create({
            customer: billingState.stripeCustomerId,
            locale: stripeLocale,
            return_url:
              applicationUrl("/billing.html")
          });

        if (!session.url) {
          throw new Error(
            "Stripe did not return a Customer Portal URL."
          );
        }

        response.json({
          ok: true,
          url: session.url
        });
      } catch (error) {
        console.error(
          "Stripe Customer Portal session failed:",
          error
        );

        response.status(503).json({
          ok: false,
          code: "BILLING_PORTAL_UNAVAILABLE",
          error:
            "Subscription management is temporarily unavailable. Please try again."
        });
      }
    }
  );

  return router;
}
