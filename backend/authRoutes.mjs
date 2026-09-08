import { createPasswordHandlers } from "./passwordHandlers.mjs";
import express from "express";
import cookieParser from "cookie-parser";
import { rateLimit } from "express-rate-limit";
import {
  authConfiguration,
  createAuthClient
} from "./authService.mjs";

const accessCookieName = "quickad_access";
const refreshCookieName = "quickad_refresh";

const persistentSessionMilliseconds =
  30 * 24 * 60 * 60 * 1000;

const signupPasswordMinimumLength = 8;
const signupPasswordMaximumLength = 1024;

const signupEmailLanguages = new Set([
  "en",
  "es",
  "pt",
  "fr",
  "de",
  "it",
  "ja",
  "ko",
  "zh",
  "zh-TW",
  "tr",
  "hi"
]);

function signupEmailLanguage(value) {
  return (
    typeof value === "string" &&
    signupEmailLanguages.has(value)
  )
    ? value
    : "en";
}

function validSignupPassword(password) {
  return (
    typeof password === "string" &&
    password.length >= signupPasswordMinimumLength &&
    password.length <= signupPasswordMaximumLength
  );
}

function cookieOptions() {
  const origin = new URL(authConfiguration().applicationOrigin);

  if (
    process.env.NODE_ENV === "production" &&
    origin.protocol !== "https:"
  ) {
    throw new Error("Production authentication requires HTTPS.");
  }

  return {
    httpOnly: true,
    secure: origin.protocol === "https:",
    sameSite: "lax",
    path: "/"
  };
}

function writeLogin(response, session) {
  if (
    typeof session?.access_token !== "string" ||
    !session.access_token ||
    typeof session?.refresh_token !== "string" ||
    !session.refresh_token
  ) {
    throw new Error("Invalid authentication session.");
  }

  const expiresAt =
    Number(session.expires_at);

  const nowSeconds =
    Math.floor(Date.now() / 1000);

  const accessLifetimeMilliseconds =
    (expiresAt - nowSeconds) * 1000;

  if (
    !Number.isFinite(expiresAt) ||
    !Number.isFinite(accessLifetimeMilliseconds) ||
    accessLifetimeMilliseconds <= 0
  ) {
    throw new Error("Invalid authentication session expiry.");
  }

  response.cookie(
    accessCookieName,
    session.access_token,
    {
      ...cookieOptions(),
      maxAge: accessLifetimeMilliseconds
    }
  );

  response.cookie(
    refreshCookieName,
    session.refresh_token,
    {
      ...cookieOptions(),
      maxAge: persistentSessionMilliseconds
    }
  );
}

function clearLogin(response) {
  const options = cookieOptions();

  response.clearCookie(
    accessCookieName,
    options
  );

  response.clearCookie(
    refreshCookieName,
    options
  );
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email ?? null
  };
}

export async function requireUser(
  request,
  response,
  next,
  authClientFactory = createAuthClient
) {
  response.set("Cache-Control", "no-store");

  const accessToken =
    request.cookies?.[accessCookieName];

  const refreshToken =
    request.cookies?.[refreshCookieName];

  const hasAccessToken =
    typeof accessToken === "string" &&
    Boolean(accessToken);

  const hasRefreshToken =
    typeof refreshToken === "string" &&
    Boolean(refreshToken);

  if (!hasAccessToken && !hasRefreshToken) {
    return response.status(401).json({
      ok: false,
      code: "AUTH_SIGN_IN_REQUIRED",
      error: "Please sign in."
    });
  }

  try {
    const client = authClientFactory();

    if (hasAccessToken) {
      const {
        data,
        error
      } = await client.auth.getUser(accessToken);

      if (!error && data.user) {
        request.authUser =
          publicUser(data.user);

        return next();
      }

      if (
        error &&
        error.status !== 400 &&
        error.status !== 401 &&
        error.status !== 403
      ) {
        return response.status(503).json({
          ok: false,
          code: "AUTH_UNAVAILABLE",
          error: "Authentication is temporarily unavailable."
        });
      }
    }

    if (!hasRefreshToken) {
      clearLogin(response);

      return response.status(401).json({
        ok: false,
        code: "AUTH_SESSION_EXPIRED",
        error: "Your session has expired. Please sign in again."
      });
    }

    const {
      data: refreshData,
      error: refreshError
    } = await client.auth.refreshSession({
      refresh_token: refreshToken
    });

    if (refreshError) {
      if (
        refreshError.status === 400 ||
        refreshError.status === 401 ||
        refreshError.status === 403
      ) {
        clearLogin(response);

        return response.status(401).json({
          ok: false,
          code: "AUTH_SESSION_EXPIRED",
          error: "Your session has expired. Please sign in again."
        });
      }

      return response.status(503).json({
        ok: false,
        code: "AUTH_UNAVAILABLE",
        error: "Authentication is temporarily unavailable."
      });
    }

    if (
      !refreshData.session ||
      !refreshData.user
    ) {
      clearLogin(response);

      return response.status(401).json({
        ok: false,
        code: "AUTH_SESSION_EXPIRED",
        error: "Your session has expired. Please sign in again."
      });
    }

    writeLogin(
      response,
      refreshData.session
    );

    request.authUser =
      publicUser(refreshData.user);

    return next();
  } catch {
    return response.status(503).json({
      ok: false,
      code: "AUTH_UNAVAILABLE",
      error: "Authentication is temporarily unavailable."
    });
  }
}

export const __signupPasswordPolicyTestHelpers = {
  signupPasswordMinimumLength,
  signupPasswordMaximumLength,
  validSignupPassword
};

export const __persistentAuthTestHelpers = {
  accessCookieName,
  refreshCookieName,
  persistentSessionMilliseconds,
  writeLogin,
  clearLogin
};

export function createAuthRouter() {
  const router = express.Router();

  router.use(cookieParser());
  router.use((_request, response, next) => {
    response.set("Cache-Control", "no-store");
    next();
  });

  // Cookie-based writes must originate from our own application.
  router.use((request, response, next) => {
    if (request.method !== "POST") {
      return next();
    }

    const expectedOrigin =
      new URL(authConfiguration().applicationOrigin).origin;

    if (request.get("origin") !== expectedOrigin) {
      return response.status(403).json({
        ok: false,
        code: "AUTH_ORIGIN_REQUIRED",
        error: "This request must come from QuickAd AI."
      });
    }

    if (!request.is("application/json")) {
      return response.status(415).json({
        ok: false,
        code: "AUTH_JSON_REQUIRED",
        error: "Use an application/json request."
      });
    }

    next();
  });

  const passwordHandlers = createPasswordHandlers({ createAuthClient, authConfiguration });
  const recoveryLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, limit: 5,
    standardHeaders: "draft-8", legacyHeaders: false,
    message: { ok: false, code: "PASSWORD_EMAIL_RATE_LIMIT", error: "Too many password email requests. Please wait and check your inbox before retrying." }
  });
  const passwordLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, limit: 15,
    standardHeaders: "draft-8", legacyHeaders: false,
    message: { ok: false, code: "PASSWORD_RATE_LIMIT", error: "Too many password attempts. Please try again later." }
  });
  router.post("/recover", recoveryLimiter, passwordHandlers.recover);
  router.post("/password-link", passwordLimiter, passwordHandlers.link);
  router.post("/password-update", passwordLimiter, passwordHandlers.update);

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      ok: false,
      code: "AUTH_LOGIN_RATE_LIMIT",
      error: "Too many sign-in attempts. Please try again later."
    }
  });

  const signupLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      ok: false,
      code: "AUTH_SIGNUP_RATE_LIMIT",
      error: "Too many signup attempts. Please try again later."
    }
  });

  const confirmationResendLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
      ok: false,
      code: "AUTH_CONFIRMATION_RATE_LIMIT",
      error: "Please wait before requesting another confirmation email. Check your inbox and spam folder before trying again."
    }
  });

  router.post("/resend-confirmation", confirmationResendLimiter, async (request, response) => {
    const email = request.body?.email;

    if (
      typeof email !== "string" ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ) {
      return response.status(400).json({
        ok: false,
        code: "AUTH_CONFIRMATION_INVALID",
        error: "Enter a valid email address."
      });
    }

    const acceptedMessage =
      "If this address has an unconfirmed account, a new confirmation email will be sent. " +
      "Check your inbox and spam folder.";

    try {
      const client = createAuthClient();
      const origin = new URL(authConfiguration().applicationOrigin);

      if (
        process.env.NODE_ENV === "production" &&
        origin.protocol !== "https:"
      ) {
        throw new Error("Production confirmation resend requires HTTPS.");
      }

      const { error } = await client.auth.resend({
        type: "signup",
        email: email.trim(),
        options: {
          emailRedirectTo: `${origin.origin}/`
        }
      });

      if (error?.status === 429) {
        return response.status(429).json({
          ok: false,
          code: "AUTH_CONFIRMATION_RATE_LIMIT",
          error: "Please wait before requesting another confirmation email. Check your inbox and spam folder before trying again."
        });
      }

      if (error && (!error.status || error.status >= 500)) {
        return response.status(503).json({
          ok: false,
          code: "AUTH_CONFIRMATION_UNAVAILABLE",
          error: "Confirmation email service is temporarily unavailable. Please try again later."
        });
      }

      // Keep ordinary account-state results neutral so this endpoint
      // cannot disclose whether an address exists or is confirmed.
      return response.status(202).json({
        ok: true,
        code: "AUTH_CONFIRMATION_RESENT",
        message: acceptedMessage
      });
    } catch {
      return response.status(503).json({
        ok: false,
        code: "AUTH_CONFIRMATION_UNAVAILABLE",
        error: "Confirmation email service is temporarily unavailable. Please try again later."
      });
    }
  });
  router.post("/signup", signupLimiter, async (request, response) => {
    const email = request.body?.email;
    const password = request.body?.password;
    const language =
      signupEmailLanguage(request.body?.language);

    if (
      typeof email !== "string" ||
      email.length > 254 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) ||
      !validSignupPassword(password)
    ) {
      return response.status(400).json({
        ok: false,
        code: "AUTH_SIGNUP_INVALID",
        error: "Enter a valid email and a password of 8–1024 characters."
      });
    }

    const acceptedMessage =
      "If this address is eligible, a confirmation email will be sent. " +
      "Check your inbox and spam folder. If you already have an account, sign in.";

    try {
      const client = createAuthClient();
      const origin = new URL(authConfiguration().applicationOrigin);

      if (
        process.env.NODE_ENV === "production" &&
        origin.protocol !== "https:"
      ) {
        throw new Error("Production signup requires HTTPS.");
      }

      const { data, error } = await client.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${origin.origin}/`,
          data: {
            language
          }
        }
      });

      if (error) {
        // Do not disclose whether a particular address already has an account.
        if (
          error.code === "user_already_exists" ||
          error.code === "email_exists"
        ) {
          return response.status(202).json({
            ok: true,
            code: "AUTH_CONFIRMATION_SENT",
            message: acceptedMessage
          });
        }

        if (error.status === 429) {
          return response.status(429).json({
            ok: false,
            code: "AUTH_CONFIRMATION_RATE_LIMIT",
            error: "Please wait before requesting another confirmation email. A previous request may already have sent one: check your inbox and spam folder. If you have confirmed your email, sign in instead."
          });
        }

        if (error.code === "weak_password") {
          return response.status(400).json({
            ok: false,
            code: "AUTH_WEAK_PASSWORD",
            error: "Choose a stronger, unique password of at least 8 characters."
          });
        }

        return response.status(503).json({
          ok: false,
          code: "AUTH_SIGNUP_FAILED",
          error: "Signup could not be completed. Please try again later."
        });
      }

      // With Confirm email enabled, signup should not return a session.
      // Never forward tokens or set a login cookie here.
      if (data.session) {
        return response.status(503).json({
          ok: false,
          code: "AUTH_CONFIRMATION_CONFIG",
          error: "Email-confirmation configuration needs administrator attention."
        });
      }

      response.status(202).json({
        ok: true,
        code: "AUTH_CONFIRMATION_SENT",
        message: acceptedMessage
      });
    } catch {
      response.status(503).json({
        ok: false,
        code: "AUTH_SIGNUP_UNAVAILABLE",
        error: "Signup is temporarily unavailable. Please try again later."
      });
    }
  });

  router.post("/login", loginLimiter, async (request, response) => {
    const email = request.body?.email;
    const password = request.body?.password;

    if (
      typeof email !== "string" ||
      typeof password !== "string" ||
      !email.trim() ||
      email.length > 254 ||
      !password ||
      password.length > 1024
    ) {
      return response.status(400).json({
        ok: false,
        code: "AUTH_LOGIN_INVALID",
        error: "Enter your email and password."
      });
    }

    try {
      const client = createAuthClient();
      const { data, error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password
      });

      if (error) {
        const unavailable = !error.status || error.status >= 500;

        return response.status(unavailable ? 503 : 401).json({
          ok: false,
          code: unavailable ? "AUTH_UNAVAILABLE" : "AUTH_LOGIN_FAILED",
          error: unavailable
            ? "Authentication is temporarily unavailable."
            : "Sign-in failed. Check your details and email confirmation."
        });
      }

      if (!data.session || !data.user) {
        return response.status(401).json({
          ok: false,
          code: "AUTH_LOGIN_FAILED",
          error: "Sign-in could not be completed."
        });
      }

      writeLogin(
        response,
        data.session
      );

      response.json({
        ok: true,
        user: publicUser(data.user)
      });
    } catch {
      response.status(503).json({
        ok: false,
        code: "AUTH_UNAVAILABLE",
        error: "Authentication is temporarily unavailable."
      });
    }
  });

  router.get("/session", requireUser, (request, response) => {
    response.json({
      ok: true,
      user: request.authUser
    });
  });

  // Signs out this browser by removing its login cookie.
  router.post("/logout", (_request, response) => {
    clearLogin(response);
    response.json({ ok: true });
  });

  return router;
}
