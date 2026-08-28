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

  const emailLinkMessage = emailLinkFailed
    ? "The email link could not be completed. It may have expired. Request a fresh confirmation email."
    : "You returned from an email link. Sign in with your QuickAd AI password. Invited users who have not set a password need a password-setup flow.";

  const button = document.querySelector(".account-button");
  if (!button) return;

  const dialog = document.createElement("dialog");
  dialog.className = "qa-account-dialog";
  dialog.setAttribute("aria-labelledby", "qa-account-title");

  // Static markup only. User data is inserted with textContent.
  dialog.innerHTML = `
    <div class="qa-account-header">
      <h2 id="qa-account-title">Your account</h2>
      <button type="button" class="qa-account-close"
        aria-label="Close account dialog">Close</button>
    </div>
    <p class="qa-account-status" role="status" aria-live="polite"></p>
    <form class="qa-account-form" hidden>
      <label for="qa-account-email">Email</label>
      <input id="qa-account-email" name="email" type="email"
        autocomplete="username" maxlength="254" required>
      <label for="qa-account-password">Password</label>
      <input id="qa-account-password" name="password" type="password"
        autocomplete="current-password" maxlength="1024" required>
      <button type="submit" class="qa-account-primary">Sign in</button>
      <button type="button" class="qa-account-mode">Create an account instead</button>
      <a href="/password.html">Forgot password or need to set one?</a>
      <p class="qa-account-note">
        Use your QuickAd AI test account.
        Self-service signup is not available yet.
        Signing in reloads this page and discards unsaved edits.
      </p>
    </form>
    <div class="qa-account-signed-in" hidden>
      <p class="qa-account-identity"></p>
      <button type="button" class="qa-account-logout">Sign out</button>
    </div>
  `;

  document.body.append(dialog);

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
    submitButton.textContent = signup ? "Create account" : "Sign in";
    modeButton.textContent = signup
      ? "Already have an account? Sign in"
      : "Create an account instead";
    note.textContent = signup
      ? "Choose a unique QuickAd AI password of at least 12 characters. Confirm your email, then return here to sign in."
      : "Use your QuickAd AI password, not your Gmail password. Signing in reloads this page and discards unsaved edits.";
  }

  setMode(false);

  modeButton.addEventListener("click", () => {
    if (busy) return;
    setMode(!signupMode);
    status.textContent = signupMode
      ? "Create your QuickAd AI account."
      : "Sign in to QuickAd AI.";
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
    identity.textContent = signedIn ? (user.email || "Signed in") : "";
    button.textContent = signedIn ? "My Account" : "Sign in";
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
    status.textContent = "Checking your session...";
    dialog.showModal();
    setBusy(true);

    try {
      const { response, data } = await request("session");

      if (response.status === 401) {
        showUser(null);
        setMode(false);
        status.textContent = returnedFromEmail
          ? emailLinkMessage
          : "Sign in to QuickAd AI.";
      } else if (response.ok && data.ok && data.user?.id) {
        showUser(data.user);
        status.textContent = "You are signed in.";
      } else {
        status.textContent =
          "Cannot verify your session right now. Close and try again.";
      }
    } catch {
      status.textContent =
        "Cannot reach the server. Close and try again.";
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
      ? "Creating your account..."
      : "Signing in...";

    try {
      const { response, data } = await request(signupMode ? "signup" : "login", {
        email: emailInput.value.trim(),
        password: passwordInput.value
      });

      if (signupMode && response.status === 202 && data.ok) {
        setMode(false);
        status.textContent = typeof data.message === "string"
          ? data.message
          : "Check your email for a confirmation link, then sign in.";
      } else if (!signupMode && response.ok && data.ok && data.user?.id) {
        window.quickAdNotifyAccountChange?.();
        showUser(data.user);
        status.textContent = "You are signed in.";
      } else {
        status.textContent = typeof data.error === "string"
          ? data.error
          : "The request failed. Please try again.";
      }
    } catch {
      status.textContent =
        "The request could not be confirmed. Check your email or reopen Account before retrying.";
    } finally {
      passwordInput.value = "";
      setBusy(false);
    }
  });

  logoutButton.addEventListener("click", async () => {
    if (busy) return;
    if (!window.confirm(
      "Sign out and clear this page? Unsaved edits will be discarded. Saved project files will remain."
    )) return;
    setBusy(true);
    status.textContent = "Signing out...";

    try {
      const { response, data } = await request("logout", {});

      if (response.ok && data.ok) {
        window.quickAdNotifyAccountChange?.();
        showUser(null);
        status.textContent = "You have signed out of this browser.";
      } else {
        status.textContent = "Sign-out failed. Please try again.";
      }
    } catch {
      status.textContent =
        "Sign-out could not be confirmed. Close and reopen Account to check.";
    } finally {
      setBusy(false);
    }
  });
  if (returnedFromEmail) button.click();
})();
