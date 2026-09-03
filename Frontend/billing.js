"use strict";

const planName =
  document.getElementById("current-plan-name");

const planUsage =
  document.getElementById("current-plan-usage");

const planCancellation =
  document.getElementById("current-plan-cancellation");

const usageBar =
  document.getElementById("usage-bar");

const message =
  document.getElementById("billing-message");

const manageSubscriptionButton =
  document.getElementById("manage-subscription-button");

function billingText(key, fallback, params = {}) {
  const translated = window.QuickAdI18n?.t?.(key, params);

  return translated && translated !== key
    ? translated
    : fallback;
}

function billingApiText(data, fallbackKey, fallbackText) {
  const codeToMessage = {
    BILLING_PLAN_INVALID: {
      key: "billing.api_plan_invalid",
      fallback: "Choose Starter or Pro."
    },
    BILLING_PLAN_UNAVAILABLE: {
      key: "billing.api_plan_unavailable",
      fallback: "This QuickAd AI plan is not configured for checkout."
    },
    BILLING_ACTIVE_SUBSCRIPTION_EXISTS: {
      key: "billing.api_active_subscription_exists",
      fallback: "You already have an active subscription. Use Manage Subscription to change or cancel your plan."
    },
    BILLING_CHECKOUT_UNAVAILABLE: {
      key: "billing.api_checkout_unavailable",
      fallback: "Checkout is temporarily unavailable. Please try again."
    },
    BILLING_NO_PAID_SUBSCRIPTION: {
      key: "billing.api_no_paid_subscription",
      fallback: "No paid subscription was found for this account."
    },
    BILLING_PORTAL_UNAVAILABLE: {
      key: "billing.api_portal_unavailable",
      fallback: "Subscription management is temporarily unavailable. Please try again."
    }
  };

  const mapped =
    typeof data?.code === "string"
      ? codeToMessage[data.code]
      : null;

  return mapped
    ? billingText(mapped.key, mapped.fallback)
    : billingText(fallbackKey, fallbackText);
}

function setMessage(text) {
  if (message) {
    message.textContent = text;
  }
}

function markCurrentPlan(planId, cancelAtPeriodEnd = false, currentPeriodEnd = null) {
  const hasPaidPlan =
    planId === "starter" ||
    planId === "pro";

  if (manageSubscriptionButton) {
    manageSubscriptionButton.hidden = !hasPaidPlan;
  }

  for (const card of document.querySelectorAll("[data-plan]")) {
    const cardPlanId = card.dataset.plan;
    const isCurrent = cardPlanId === planId;

    card.classList.toggle("current", isCurrent);

    const button =
      card.querySelector("[data-plan-button]");

    if (!button) continue;

    button.onclick = null;

    if (isCurrent) {
      button.textContent = billingText("billing.current_plan", "Current Plan");
      button.disabled = true;
      button.dataset.action = "current";
    } else if (hasPaidPlan && cardPlanId === "free") {
      const freePlanDate =
        currentPeriodEnd
          ? new Date(currentPeriodEnd)
          : null;

      const hasValidFreePlanDate =
        freePlanDate &&
        !Number.isNaN(freePlanDate.getTime());

      if (cancelAtPeriodEnd && hasValidFreePlanDate) {
        const formattedFreePlanDate =
          freePlanDate.toLocaleDateString(
            window.QuickAdI18n?.currentLang || "en",
            {
              month: "short",
              day: "numeric",
              timeZone: "UTC"
            }
          );

        button.textContent =
          billingText(
            "billing.free_plan_starts",
            `Free Plan Starts ${formattedFreePlanDate}`,
            {
              date: formattedFreePlanDate
            }
          );
        button.disabled = true;
        button.dataset.action = "scheduled-free";
      } else {
        button.textContent = billingText("billing.cancel_to_free", "Cancel to Free Plan");
        button.disabled = false;
        button.dataset.action = "portal";
      }
    } else if (hasPaidPlan) {
      button.textContent = billingText("billing.change_plan", "Change Plan");
      button.disabled = false;
      button.dataset.action = "portal";
    } else {
      button.textContent =
        cardPlanId === "starter"
          ? billingText("billing.choose_starter", "Choose Starter")
          : billingText("billing.choose_pro", "Choose Pro");
      button.disabled = false;
      button.dataset.action = "checkout";
    }
  }
}

function renderUsage(usage) {
  const id =
    usage.planId || "free";

  planName.textContent =
    usage.planName || billingText("billing.free", "Free");

  if (planCancellation) {
    const cancellationDate =
      usage.currentPeriodEnd
        ? new Date(usage.currentPeriodEnd)
        : null;

    const hasValidCancellationDate =
      cancellationDate &&
      !Number.isNaN(cancellationDate.getTime());

    if (
      usage.cancelAtPeriodEnd &&
      hasValidCancellationDate
    ) {
      const formattedCancellationDate =
        cancellationDate.toLocaleDateString(
          window.QuickAdI18n?.currentLang || "en",
          {
            year: "numeric",
            month: "long",
            day: "numeric",
            timeZone: "UTC"
          }
        );

      planCancellation.textContent =
        billingText(
          "billing.cancels_on",
          `Cancels ${formattedCancellationDate}`,
          {
            date: formattedCancellationDate
          }
        );

      planCancellation.hidden = false;
    } else {
      planCancellation.textContent = "";
      planCancellation.hidden = true;
    }
  }

  if (id === "free") {
    const remaining =
      Number(usage.freeVideosRemaining) || 0;

    const used =
      Math.max(0, 2 - remaining);

    planUsage.textContent =
      billingText("billing.free_remaining", "{remaining} of 2 free videos remaining", { remaining });

    usageBar.style.width =
      `${Math.min(100, used / 2 * 100)}%`;
  } else {
    const total =
      Number(usage.monthlyCreditsTotal) || 0;

    const used =
      Number(usage.monthlyCreditsUsed) || 0;

    const remaining =
      Number(usage.monthlyCreditsRemaining) || 0;

    planUsage.textContent =
      billingText("billing.credits_remaining", "{remaining} of {total} credits remaining", { remaining, total });

    usageBar.style.width =
      total > 0
        ? `${Math.min(100, used / total * 100)}%`
        : "0%";
  }

  markCurrentPlan(id, usage.cancelAtPeriodEnd, usage.currentPeriodEnd);
}

async function loadBilling() {
  try {
    const response =
      await fetch(
        "/api/projects/usage",
        {
          credentials: "same-origin",
          cache: "no-store"
        }
      );

    if (response.status === 401) {
      planName.textContent =
        billingText("billing.sign_in_plan", "Sign in to see your plan");

      planUsage.textContent =
        billingText("billing.sign_in_usage", "Your usage appears here after you sign in.");

      usageBar.style.width =
        "0%";

      return;
    }

    const data =
      await response.json();

    if (!response.ok || !data.ok || !data.usage) {
      throw new Error(billingText("billing.usage_load_error", "Usage could not be loaded."));
    }

    renderUsage(data.usage);
  } catch {
    planName.textContent =
      billingText("billing.plan_unavailable", "Plan unavailable");

    planUsage.textContent =
      billingText("billing.try_again", "Please try again shortly.");

    usageBar.style.width =
      "0%";
  }
}

async function openSubscriptionPortal() {
  if (!manageSubscriptionButton) return;

  const originalText =
    manageSubscriptionButton.textContent;

  manageSubscriptionButton.disabled = true;
  manageSubscriptionButton.textContent =
    billingText("billing.opening", "Opening...");

  setMessage("");

  try {
    const response =
      await fetch(
        "/api/billing/portal",
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            language:
              window.QuickAdI18n?.currentLang || "en"
          })
        }
      );

    const data =
      await response.json().catch(() => ({}));

    if (!response.ok || !data.url) {
      throw new Error(
        billingApiText(
          data,
          "billing.portal_error",
          "Unable to open subscription management."
        )
      );
    }

    window.location.assign(data.url);
  } catch (error) {
    setMessage(
      billingText(
        "billing.portal_error",
        "Unable to open subscription management."
      ),
      true
    );

    manageSubscriptionButton.disabled = false;
    manageSubscriptionButton.textContent =
      originalText;
  }
}

async function startCheckout(button) {
  if (button.disabled) return;

  const planId =
    button.dataset.planButton;

  if (
    planId !== "starter" &&
    planId !== "pro"
  ) {
    return;
  }

  const originalText =
    button.textContent;

  button.disabled = true;
  button.textContent = billingText("billing.opening_checkout", "Opening checkout...");

  setMessage("");

  try {
    const response =
      await fetch(
        "/api/billing/checkout",
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            planId,
            language:
              window.QuickAdI18n?.currentLang || "en"
          })
        }
      );

    const data =
      await response.json();

    if (response.status === 401) {
      setMessage(
        billingText("billing.sign_in_choose", "Please sign in before choosing a plan.")
      );
      return;
    }

    if (
      !response.ok ||
      !data.ok ||
      !data.url
    ) {
      throw new Error(
        billingApiText(
          data,
          "billing.checkout_error",
          "Checkout could not be opened."
        )
      );
    }

    window.location.assign(data.url);
  } catch (error) {
    setMessage(
      billingText(
        "billing.checkout_retry",
        "Checkout could not be opened. Please try again."
      )
    );
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

for (
  const button of
  document.querySelectorAll("[data-plan-button]")
) {
  button.addEventListener("click", () => {
    if (button.dataset.action === "portal") {
      openSubscriptionPortal();
      return;
    }

    startCheckout(button);
  });
}

if (manageSubscriptionButton) {
  manageSubscriptionButton.addEventListener(
    "click",
    openSubscriptionPortal
  );
}

loadBilling();
