"use strict";

const planName =
  document.getElementById("current-plan-name");

const planUsage =
  document.getElementById("current-plan-usage");

const usageBar =
  document.getElementById("usage-bar");

const message =
  document.getElementById("billing-message");

function setMessage(text) {
  if (message) {
    message.textContent = text;
  }
}

function markCurrentPlan(planId) {
  for (const card of document.querySelectorAll("[data-plan]")) {
    const isCurrent =
      card.dataset.plan === planId;

    card.classList.toggle("current", isCurrent);

    const button =
      card.querySelector("[data-plan-button]");

    if (!button) continue;

    if (isCurrent) {
      button.textContent = "Current Plan";
      button.disabled = true;
    }
  }
}

function renderUsage(usage) {
  const id =
    usage.planId || "free";

  planName.textContent =
    usage.planName || "Free";

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
    startCheckout(button);
  });
}

loadBilling();
