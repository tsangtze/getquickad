(() => {
  "use strict";

  // Route recovery/invite links before the ordinary account code clears tokens.
  const passwordLink = new URLSearchParams(window.location.hash.slice(1));
  if (["recovery", "invite"].includes(passwordLink.get("type"))) {
    window.location.replace("/password.html" + window.location.hash);
    return;
  }

  // Email links confirm at Supabase; this app uses its server login cookie.
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  const returnedFromEmail =
    fragment.has("access_token") ||
    fragment.has("error") ||
    fragment.has("error_code");
  const emailLinkFailed =
    fragment.has("error") || fragment.has("error_code");

  if (returnedFromEmail) {
    window.history.replaceState(
      null, "", window.location.pathname + window.location.search
    );
  }

  function emailLinkMessage() {
    return emailLinkFailed
      ? accountText("account.email_link_failed", "The email link could not be completed. It may have expired. Request a fresh confirmation email.")
      : accountText("account.email_link_returned", "You returned from an email link. Sign in with your QuickAd AI password. Invited users who have not set a password need a password-setup flow.");
  }

  function accountText(key, fallback, params = {}) {
    const translated = window.QuickAdI18n?.t?.(key, params);
    return translated && translated !== key ? translated : fallback;
  }

  function accountApiText(data, fallbackKey, fallbackText) {
    const codeToKey = {
      AUTH_SIGN_IN_REQUIRED: "account.api_sign_in_required",
      AUTH_SESSION_EXPIRED: "account.api_session_expired",
      AUTH_UNAVAILABLE: "account.api_unavailable",
      AUTH_ORIGIN_REQUIRED: "account.api_origin_required",
      AUTH_JSON_REQUIRED: "account.api_json_required",
      AUTH_LOGIN_RATE_LIMIT: "account.api_login_rate_limit",
      AUTH_SIGNUP_RATE_LIMIT: "account.api_signup_rate_limit",
      AUTH_SIGNUP_INVALID: "account.api_signup_invalid",
      AUTH_CONFIRMATION_SENT: "account.api_confirmation_sent",
      AUTH_CONFIRMATION_RATE_LIMIT: "account.api_confirmation_rate_limit",
      AUTH_WEAK_PASSWORD: "account.api_weak_password",
      AUTH_SIGNUP_FAILED: "account.api_signup_failed",
      AUTH_CONFIRMATION_CONFIG: "account.api_confirmation_config",
      AUTH_SIGNUP_UNAVAILABLE: "account.api_signup_unavailable",
      AUTH_LOGIN_INVALID: "account.api_login_invalid",
      AUTH_LOGIN_FAILED: "account.api_login_failed"
    };

    const key = codeToKey[data?.code];

    if (key) {
      return accountText(key, fallbackText);
    }

    return accountText(fallbackKey, fallbackText);
  }

  const button = document.querySelector(".account-button");
  if (!button) return;

  const dialog = document.createElement("dialog");
  dialog.className = "qa-account-dialog";
  dialog.setAttribute("aria-labelledby", "qa-account-title");

  // Static markup only. User data is inserted with textContent.
  dialog.innerHTML = `
    <div class="qa-account-header">
      <h2 id="qa-account-title" data-i18n="account.title">Your account</h2>
      <button type="button" class="qa-account-close"
        aria-label="Close account dialog" data-i18n-aria-label="account.close_aria" data-i18n="account.close">Close</button>
    </div>
    <p class="qa-account-status" role="status" aria-live="polite"></p>
    <form class="qa-account-form" hidden>
      <label for="qa-account-email" data-i18n="account.email">Email</label>
      <input id="qa-account-email" name="email" type="email"
        autocomplete="username" maxlength="254" required>
      <label for="qa-account-password" data-i18n="account.password">Password</label>
      <input id="qa-account-password" name="password" type="password"
        autocomplete="current-password" maxlength="1024" required>
      <button type="submit" class="qa-account-primary" data-i18n="account.sign_in">Sign in</button>
      <button type="button" class="qa-account-mode" data-i18n="account.create_instead">Create an account instead</button>
      <a href="/password.html" data-i18n="account.forgot">Forgot password or need to set one?</a>
      <p class="qa-account-note">
        Use your QuickAd AI test account.
        Self-service signup is not available yet.
        Signing in reloads this page and discards unsaved edits.
      </p>
    </form>
    <div class="qa-account-signed-in" hidden>
      <p class="qa-account-identity"></p>
      <button type="button" class="qa-account-logout" data-i18n="account.sign_out">Sign out</button>
    </div>
  `;

  document.body.append(dialog);
  window.QuickAdI18n?.applyTranslations?.();

  const closeButton = dialog.querySelector(".qa-account-close");
  const status = dialog.querySelector(".qa-account-status");
  const loginForm = dialog.querySelector("form");
  const emailInput = dialog.querySelector('[name="email"]');
  const passwordInput = dialog.querySelector('[name="password"]');
  const signedInPanel = dialog.querySelector(".qa-account-signed-in");
  const identity = dialog.querySelector(".qa-account-identity");
  const logoutButton = dialog.querySelector(".qa-account-logout");
  let busy = false;
  let signupMode = false;
  const modeButton = dialog.querySelector(".qa-account-mode");
  const submitButton = loginForm.querySelector('[type="submit"]');
  const note = dialog.querySelector(".qa-account-note");

  function setMode(signup) {
    signupMode = signup;
    passwordInput.value = "";
    passwordInput.minLength = signup ? 12 : 1;
    passwordInput.autocomplete = signup
      ? "new-password"
      : "current-password";
    submitButton.textContent = signup ? accountText("account.create", "Create account") : accountText("account.sign_in", "Sign in");
    modeButton.textContent = signup
      ? accountText("account.already_sign_in", "Already have an account? Sign in")
      : accountText("account.create_instead", "Create an account instead");
    note.textContent = signup
      ? accountText("account.note_signup", "Choose a unique QuickAd AI password of at least 12 characters. Confirm your email, then return here to sign in.")
      : accountText("account.note_signin", "Use your QuickAd AI password, not your Gmail password. Signing in reloads this page and discards unsaved edits.");
  }

  setMode(false);

  modeButton.addEventListener("click", () => {
    if (busy) return;
    setMode(!signupMode);
    status.textContent = signupMode
      ? accountText("account.create_status", "Create your QuickAd AI account.")
      : accountText("account.sign_in_status", "Sign in to QuickAd AI.");
    emailInput.focus();
  });

  button.setAttribute("aria-haspopup", "dialog");

  function setBusy(value) {
    busy = value;
    dialog.setAttribute("aria-busy", String(value));
    for (const control of dialog.querySelectorAll("input, button")) {
      control.disabled = value;
    }
  }

  function showUser(user) {
    const signedIn = Boolean(user?.id);
    window.quickAdAccountChanged?.(user);
    loginForm.hidden = signedIn;
    signedInPanel.hidden = !signedIn;
    identity.textContent = signedIn ? (user.email || accountText("account.signed_in_fallback", "Signed in")) : "";
    button.textContent = signedIn ? accountText("account.my_account", "My Account") : accountText("account.sign_in", "Sign in");
    passwordInput.value = "";
  }

  async function request(path, body) {
    const options = {
      credentials: "same-origin",
      cache: "no-store",
      signal: AbortSignal.timeout(30000)
    };

    if (body !== undefined) {
      options.method = "POST";
      options.headers = { "Content-Type": "application/json" };
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`/api/auth/${path}`, options);
    const data = await response.json();
    return { response, data };
  }

  button.addEventListener("click", async () => {
    if (dialog.open) return;

    loginForm.hidden = true;
    signedInPanel.hidden = true;
    status.textContent = accountText("account.checking", "Checking your session...");
    dialog.showModal();
    setBusy(true);

    try {
      const { response, data } = await request("session");

      if (response.status === 401) {
        showUser(null);
        setMode(false);
        status.textContent = returnedFromEmail
          ? emailLinkMessage()
          : accountText("account.sign_in_status", "Sign in to QuickAd AI.");
      } else if (response.ok && data.ok && data.user?.id) {
        showUser(data.user);
        status.textContent = accountText("account.signed_in", "You are signed in.");
      } else {
        status.textContent =
          accountText("account.verify_error", "Cannot verify your session right now. Close and try again.");
      }
    } catch {
      status.textContent =
        accountText("account.server_error", "Cannot reach the server. Close and try again.");
    } finally {
      setBusy(false);
      if (!loginForm.hidden) emailInput.focus();
      else closeButton.focus();
    }
  });

  closeButton.addEventListener("click", () => {
    if (!busy) dialog.close();
  });

  dialog.addEventListener("cancel", (event) => {
    if (busy) event.preventDefault();
  });

  dialog.addEventListener("close", () => {
    passwordInput.value = "";
  });

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy || !loginForm.reportValidity()) return;

    setBusy(true);
    status.textContent = signupMode
      ? accountText("account.creating", "Creating your account...")
      : accountText("account.signing_in", "Signing in...");

    try {
      const { response, data } = await request(signupMode ? "signup" : "login", {
        email: emailInput.value.trim(),
        password: passwordInput.value
      });

      if (signupMode && response.status === 202 && data.ok) {
        setMode(false);
        status.textContent = accountApiText(
          data,
          "account.check_email",
          "Check your email for a confirmation link, then sign in."
        );
      } else if (!signupMode && response.ok && data.ok && data.user?.id) {
        window.quickAdNotifyAccountChange?.();
        showUser(data.user);
        status.textContent = accountText("account.signed_in", "You are signed in.");
      } else {
        status.textContent = accountApiText(
          data,
          "account.request_failed",
          "The request failed. Please try again."
        );
      }
    } catch {
      status.textContent =
        accountText("account.request_unconfirmed", "The request could not be confirmed. Check your email or reopen Account before retrying.");
    } finally {
      passwordInput.value = "";
      setBusy(false);
    }
  });

  logoutButton.addEventListener("click", async () => {
    if (busy) return;
    if (!window.confirm(
      accountText("account.sign_out_confirm", "Sign out and clear this page? Unsaved edits will be discarded. Saved project files will remain.")
    )) return;
    setBusy(true);
    status.textContent = accountText("account.signing_out", "Signing out...");

    try {
      const { response, data } = await request("logout", {});

      if (response.ok && data.ok) {
        window.quickAdNotifyAccountChange?.();
        showUser(null);
        status.textContent = accountText("account.signed_out", "You have signed out of this browser.");
      } else {
        status.textContent = accountText("account.sign_out_failed", "Sign-out failed. Please try again.");
      }
    } catch {
      status.textContent =
        accountText("account.sign_out_unconfirmed", "Sign-out could not be confirmed. Close and reopen Account to check.");
    } finally {
      setBusy(false);
    }
  });
  if (returnedFromEmail) button.click();
})();
