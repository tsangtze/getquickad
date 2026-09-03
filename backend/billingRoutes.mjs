import express from "express";
import cookieParser from "cookie-parser";
import Stripe from "stripe";

import { requireUser } from "./authRoutes.mjs";
import { authConfiguration } from "./authService.mjs";
import { getStripeBillingState } from "./usageLimits.mjs";

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
  projectRoot
}) {
  const router = express.Router();

  router.use(cookieParser());

  router.use((_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
  });

  router.post(
    "/checkout",
    requireUser,
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
              "This QuickAd AI plan is not configured for checkout."
          });
        }

        const stripe =
          createStripeClient();

        const userId =
          String(request.authUser.id);

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
    "/portal",
    requireUser,
    async (request, response) => {
      try {
        const userId =
          String(request.authUser.id);

        const stripeLocale =
          stripeLocaleForLanguage(
            String(request.body?.language || "")
              .trim()
          );

        const billingState =
          await getStripeBillingState(
            projectRoot,
            userId
          );
        if (!billingState.stripeCustomerId) {
          return response.status(400).json({
            ok: false,
            code: "BILLING_NO_PAID_SUBSCRIPTION",
            error:
              "No paid subscription was found for this account."
          });
        }

        const stripe =
          createStripeClient();

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
