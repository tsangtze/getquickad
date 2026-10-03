(() => {
  "use strict";

  const measurementId = "G-2Q1SQ7B74W";
  const productionOrigin = "https://pix2vid.net";
  const consentStorageKey = "pix2vid_analytics_consent";

  if (window.location.origin !== productionOrigin) {
    return;
  }

  function readConsent() {
    try {
      return localStorage.getItem(consentStorageKey);
    } catch {
      return null;
    }
  }

  function saveConsent(value) {
    try {
      localStorage.setItem(consentStorageKey, value);
    } catch {
      // Storage may be unavailable. The current choice still applies
      // for this page, but cannot be remembered for a future visit.
    }
  }

  function loadGoogleAnalytics() {
    if (window.__pix2vidGoogleAnalyticsLoaded) {
      return;
    }

    window.__pix2vidGoogleAnalyticsLoaded = true;
    window.dataLayer = window.dataLayer || [];

    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };

    window.gtag("js", new Date());
    window.gtag("config", measurementId);

    const script = document.createElement("script");
    script.async = true;
    script.src =
      `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;

    document.head.appendChild(script);
  }

  function showConsentPanel() {
    if (document.getElementById("analytics-consent")) {
      return;
    }

    const panel = document.createElement("section");
    panel.id = "analytics-consent";
    panel.className = "analytics-consent";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Analytics preferences");

    panel.innerHTML = `
      <p class="analytics-consent-copy">
        Pix2Vid would like to use Google Analytics to understand how
        visitors use our website and improve the service.
        <a href="/privacy.html">Privacy Policy</a>
      </p>
      <div class="analytics-consent-actions">
        <button
          type="button"
          class="analytics-consent-button analytics-consent-decline"
          data-analytics-consent="denied"
        >
          Decline
        </button>
        <button
          type="button"
          class="analytics-consent-button analytics-consent-allow"
          data-analytics-consent="granted"
        >
          Allow analytics
        </button>
      </div>
    `;

    panel.addEventListener("click", event => {
      const button =
        event.target.closest("[data-analytics-consent]");

      if (!button) {
        return;
      }

      const choice =
        button.getAttribute("data-analytics-consent");

      if (choice !== "granted" && choice !== "denied") {
        return;
      }

      saveConsent(choice);
      panel.remove();

      if (choice === "granted") {
        loadGoogleAnalytics();
      }
    });

    document.body.appendChild(panel);
  }

  const consent = readConsent();

  if (consent === "granted") {
    loadGoogleAnalytics();
  } else if (consent !== "denied") {
    if (document.readyState === "loading") {
      document.addEventListener(
        "DOMContentLoaded",
        showConsentPanel,
        { once: true }
      );
    } else {
      showConsentPanel();
    }
  }

  window.Pix2VidAnalytics = Object.freeze({
    consentStorageKey,
    loadGoogleAnalytics
  });
})();
