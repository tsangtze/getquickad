// No admin key: every password update is authorized by the user's bearer token.
export function createPasswordHandlers({ createAuthClient, authConfiguration, fetchImpl = fetch }) {
  const accepted = { ok: true, code: "PASSWORD_EMAIL_ACCEPTED", message: "If this address is eligible, a password email will be sent. Check your inbox and spam folder, and use the newest link. A previous request may already have sent one." };
  const invalidLink = { ok: false, code: "PASSWORD_INVALID_LINK", error: "This link is invalid or expired. Request a new password email below." };
  const unavailable = { ok: false, code: "PASSWORD_UNAVAILABLE", error: "Password service is temporarily unavailable. Please try again later." };
  const validEmail = value => typeof value === "string" && value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  const validToken = value => typeof value === "string" && value.length > 0 && value.length <= 8192 && !/\s/.test(value);

  async function verifiedUser(request, response) {
    const token = request.body?.accessToken;
    if (!validToken(token)) {
      response.status(401).json(invalidLink);
      return null;
    }
    const { data, error } = await createAuthClient().auth.getUser(token);
    if (error) {
      response.status([400, 401, 403].includes(error.status) ? 401 : 503)
        .json([400, 401, 403].includes(error.status) ? invalidLink : unavailable);
      return null;
    }
    if (!data?.user?.id || !data.user.email) {
      response.status(401).json(invalidLink);
      return null;
    }
    return data.user;
  }

  return {
    async recover(request, response) {
      if (!validEmail(request.body?.email)) {
        return response.status(400).json({ ok: false, code: "PASSWORD_EMAIL_INVALID", error: "Enter a valid email address." });
      }
      try {
        const origin = new URL(authConfiguration().applicationOrigin);
        if (!["http:", "https:"].includes(origin.protocol) ||
            (process.env.NODE_ENV === "production" && origin.protocol !== "https:")) {
          return response.status(503).json(unavailable);
        }
        const { error } = await createAuthClient().auth.resetPasswordForEmail(
          request.body.email.trim(), { redirectTo: `${origin.origin}/password.html` }
        );
        // Keep account-specific outcomes and cooldowns indistinguishable.
        if (error && !(error.status >= 400 && error.status < 500)) {
          return response.status(503).json(unavailable);
        }
        return response.status(202).json(accepted);
      } catch {
        return response.status(503).json(unavailable);
      }
    },
    async link(request, response) {
      try {
        const user = await verifiedUser(request, response);
        if (!user) return;
        return response.json({ ok: true, email: user.email });
      } catch {
        return response.status(503).json(unavailable);
      }
    },
    async update(request, response) {
      const password = request.body?.password;
      if (typeof password !== "string" || password.length < 12 || password.length > 1024) {
        return response.status(400).json({ ok: false, code: "PASSWORD_INVALID", error: "Choose a unique password of 12–1024 characters." });
      }
      try {
        const user = await verifiedUser(request, response);
        if (!user) return;
        const config = authConfiguration();
        const base = new URL(config.supabaseUrl);
        if (base.protocol !== "https:") return response.status(503).json(unavailable);
        const result = await fetchImpl(new URL("/auth/v1/user", base), {
          method: "PUT",
          redirect: "error",
          headers: {
            apikey: config.publishableKey,
            Authorization: `Bearer ${request.body.accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ password }),
          signal: AbortSignal.timeout(30000)
        });
        const data = await result.json();
        if (!result.ok) {
          if (result.status === 401 || result.status === 403) return response.status(401).json(invalidLink);
          if (["weak_password", "same_password"].includes(data.code || data.error_code)) {
            return response.status(400).json({ ok: false, code: "PASSWORD_WEAK_OR_SAME", error: "Choose a stronger password that differs from your current password." });
          }
          if (result.status === 429) return response.status(429).json({ ok: false, code: "PASSWORD_UPDATE_RATE_LIMIT", error: "Too many password attempts. Please wait before trying again." });
          return response.status(503).json(unavailable);
        }
        if (data.id !== user.id) return response.status(503).json(unavailable);
        // Do not create a login session or return credentials here.
        const appOrigin = new URL(config.applicationOrigin);
        response.clearCookie("quickad_access", {
          httpOnly: true, secure: appOrigin.protocol === "https:", sameSite: "lax", path: "/"
        });
        return response.json({ ok: true, code: "PASSWORD_SAVED", message: "Password saved. Return to QuickAd AI and sign in with your new password." });
      } catch {
        return response.status(503).json({ ok: false, code: "PASSWORD_CHANGE_UNCERTAIN", error: "The password change could not be confirmed. Try signing in with your new password before requesting another link." });
      }
    }
  };
}
