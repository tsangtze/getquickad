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

function setMessage(text) {
  if (message) {
    message.textContent = text;
  }
}

function markCurrentPlan(planId) {
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
      button.textContent = "Current Plan";
      button.disabled = true;
      button.dataset.action = "current";
    } else if (hasPaidPlan && cardPlanId === "free") {
      button.textContent = "Cancel to Free Plan";
      button.disabled = false;
      button.dataset.action = "portal";
    } else if (hasPaidPlan) {
      button.textContent = "Change Plan";
      button.disabled = false;
      button.dataset.action = "portal";
    } else {
      button.textContent =
        cardPlanId === "starter"
          ? "Choose Starter"
          : "Choose Pro";
      button.disabled = false;
      button.dataset.action = "checkout";
    }
  }
}

function renderUsage(usage) {
  const id =
    usage.planId || "free";

  planName.textContent =
    usage.planName || "Free";

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
      planCancellation.textContent =
        `Cancels ${cancellationDate.toLocaleDateString(
          undefined,
          {
            year: "numeric",
            month: "long",
            day: "numeric",
            timeZone: "UTC"
          }
        )}`;

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
      `${remaining} of 2 free videos remaining`;

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
      `${remaining} of ${total} credits remaining`;

    usageBar.style.width =
      total > 0
        ? `${Math.min(100, used / total * 100)}%`
        : "0%";
  }

  markCurrentPlan(id);
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
        "Sign in to see your plan";

      planUsage.textContent =
        "Your usage appears here after you sign in.";

      usageBar.style.width =
        "0%";

      return;
    }

    const data =
      await response.json();

    if (!response.ok || !data.ok || !data.usage) {
      throw new Error("Usage could not be loaded.");
    }

    renderUsage(data.usage);
  } catch {
    planName.textContent =
      "Plan unavailable";

    planUsage.textContent =
      "Please try again shortly.";

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
    "Opening...";

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
          }
        }
      );

    const data =
      await response.json().catch(() => ({}));

    if (!response.ok || !data.url) {
      throw new Error(
        data.error ||
        "Unable to open subscription management."
      );
    }

    window.location.assign(data.url);
  } catch (error) {
    setMessage(
      error.message ||
      "Unable to open subscription management.",
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
  button.textContent = "Opening checkout...";

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
            planId
          })
        }
      );

    const data =
      await response.json();

    if (response.status === 401) {
      setMessage(
        "Please sign in before choosing a plan."
      );
      return;
    }

    if (
      !response.ok ||
      !data.ok ||
      !data.url
    ) {
      throw new Error(
        data.error ||
        "Checkout could not be opened."
      );
    }

    window.location.assign(data.url);
  } catch (error) {
    setMessage(
      error.message ||
      "Checkout could not be opened. Please try again."
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
