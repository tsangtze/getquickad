(() => {
  "use strict";
  // Runs in the head before rendering. Credentials remain in this closure only.
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const type = fragment.get("type");
  const hasError = fragment.has("error") || fragment.has("error_code") || window.location.search.includes("code=");
  let accessToken = !hasError && ["recovery", "invite"].includes(type)
    ? fragment.get("access_token") || "" : "";
  const hadLink = Boolean(window.location.hash || window.location.search);
  window.history.replaceState(null, "", window.location.pathname);
  // Drop all parsed fields, including refresh_token; no refresh token is used.
  for (const key of [...fragment.keys()]) fragment.delete(key);

  document.addEventListener("DOMContentLoaded", async () => {
    const byId = id => document.getElementById(id);
    const status = byId("status");
    const requestPanel = byId("request-panel");
    const updatePanel = byId("update-panel");
    let busy = false;

    function passwordText(key, fallback, params = {}) {
      const translated = window.QuickAdI18n?.t?.(key, params);
      return translated && translated !== key ? translated : fallback;
    }
    function passwordApiText(data, fallbackKey, fallbackText) {
      const codeToKey = {
        PASSWORD_EMAIL_ACCEPTED: "password.api_email_accepted",
        PASSWORD_INVALID_LINK: "password.api_invalid_link",
        PASSWORD_UNAVAILABLE: "password.api_unavailable",
        PASSWORD_EMAIL_INVALID: "password.api_email_invalid",
        PASSWORD_INVALID: "password.api_invalid",
        PASSWORD_WEAK_OR_SAME: "password.api_weak_or_same",
        PASSWORD_UPDATE_RATE_LIMIT: "password.api_update_rate_limit",
        PASSWORD_SAVED: "password.api_saved",
        PASSWORD_CHANGE_UNCERTAIN: "password.api_change_uncertain",
        PASSWORD_EMAIL_RATE_LIMIT: "password.api_email_rate_limit",
        PASSWORD_RATE_LIMIT: "password.api_rate_limit"
      };

      const key =
        typeof data?.code === "string"
          ? codeToKey[data.code]
          : "";

      return key
        ? passwordText(key, fallbackText)
        : passwordText(fallbackKey, fallbackText);
    }

    const invalid = () => passwordText(
      "password.invalid_link",
      "This link is invalid, expired, or already used. Request a new password email below."
    );
    function setBusy(value) {
      busy = value;
      for (const control of document.querySelectorAll("input, button")) control.disabled = value;
    }
    function clearPasswords() {
      byId("password").value = "";
      byId("confirmation").value = "";
    }
    async function api(path, body) {
      const response = await fetch(`/api/auth/${path}`, {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body), signal: AbortSignal.timeout(30000)
      });
      return { response, data: await response.json() };
    }
    window.addEventListener("pagehide", () => { accessToken = ""; clearPasswords(); });
    window.addEventListener("pageshow", event => { if (event.persisted) window.location.reload(); });

    byId("request-form").addEventListener("submit", async event => {
      event.preventDefault();
      if (busy || !event.currentTarget.reportValidity()) return;
      setBusy(true);
      status.textContent = passwordText("password.requesting", "Requesting password email...");
      try {
        const { response, data } = await api("recover", { email: byId("email").value.trim() });
        status.textContent = response.status === 202 && data.ok
          ? passwordApiText(
              data,
              "password.request_uncertain",
              "The request could not be confirmed. Check your inbox before requesting another email."
            )
          : passwordApiText(
              data,
              "password.request_failed",
              "Could not request an email. Please try later."
            );
      } catch {
        status.textContent = passwordText("password.request_uncertain", "The request could not be confirmed. Check your inbox before requesting another email.");
      } finally { setBusy(false); }
    });
    byId("update-form").addEventListener("submit", async event => {
      event.preventDefault();
      if (busy || !event.currentTarget.reportValidity()) return;
      if (byId("password").value !== byId("confirmation").value) {
        status.textContent = passwordText("password.must_match", "The two passwords must match.");
        byId("confirmation").focus(); return;
      }
      if (!accessToken) { status.textContent = invalid(); return; }
      setBusy(true);
      status.textContent = passwordText("password.saving", "Saving your password...");
      try {
        const { response, data } = await api("password-update", {
          accessToken, password: byId("password").value
        });
        if (response.ok && data.ok) {
          accessToken = "";
          updatePanel.hidden = true;
          requestPanel.hidden = true;
          status.textContent = passwordApiText(
            data,
            "password.change_uncertain",
            "The change could not be confirmed. Try signing in with your new password before requesting another link."
          );
          byId("title").textContent = passwordText("password.saved_title", "Password saved");
        } else {
          status.textContent = passwordApiText(
            data,
            "password.invalid_link",
            "This link is invalid, expired, or already used. Request a new password email below."
          );
          if (response.status === 401) {
            accessToken = ""; updatePanel.hidden = true; requestPanel.hidden = false;
          }
        }
      } catch {
        status.textContent = passwordText("password.change_uncertain", "The change could not be confirmed. Try signing in with your new password before requesting another link.");
      } finally { clearPasswords(); setBusy(false); }
    });
    if (!accessToken) {
      if (hadLink) status.textContent = invalid();
      return;
    }
    requestPanel.hidden = true;
    status.textContent = passwordText("password.verifying", "Verifying your password link...");
    setBusy(true);
    try {
      const { response, data } = await api("password-link", { accessToken });
      if (response.ok && data.ok && typeof data.email === "string") {
        byId("title").textContent = passwordText("password.set_title", "Set your password");
        byId("identity").textContent = data.email;
        byId("email").value = data.email;
        status.textContent = passwordText("password.link_verified", "Link verified. Choose a new QuickAd AI password.");
        updatePanel.hidden = false;
      } else {
        accessToken = ""; requestPanel.hidden = false;
        status.textContent = passwordApiText(
          data,
          "password.invalid_link",
          "This link is invalid, expired, or already used. Request a new password email below."
        );
      }
    } catch {
      accessToken = ""; requestPanel.hidden = false;
      status.textContent = passwordText("password.verify_failed", "The link could not be verified. Reopen the newest email link or request another email.");
    } finally { setBusy(false); }
  });
})();
