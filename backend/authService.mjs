import WebSocket from "ws";
import {
  createClient
} from "@supabase/supabase-js";

function cleanEnvironmentValue(value) {
  return String(value ?? "").trim();
}

export function authConfiguration() {
  return {
    supabaseUrl:
      cleanEnvironmentValue(
        process.env.SUPABASE_URL
      ),
    publishableKey:
      cleanEnvironmentValue(
        process.env.SUPABASE_PUBLISHABLE_KEY
      ),
    applicationOrigin:
      cleanEnvironmentValue(
        process.env.APP_ORIGIN
      ) ||
      "http://localhost:4100"
  };
}

export function isAuthConfigured() {
  const configuration =
    authConfiguration();

  if (
    !configuration.supabaseUrl ||
    !configuration.publishableKey
  ) {
    return false;
  }

  try {
    const parsedUrl =
      new URL(
        configuration.supabaseUrl
      );

    return (
      parsedUrl.protocol === "https:" &&
      configuration.publishableKey.length >= 20
    );
  } catch {
    return false;
  }
}

export function createAuthClient() {
  if (!isAuthConfigured()) {
    const error =
      new Error(
        "Supabase authentication is not configured."
      );

    error.code =
      "AUTH_NOT_CONFIGURED";

    throw error;
  }

  const configuration =
    authConfiguration();

  return createClient(
    configuration.supabaseUrl,
    configuration.publishableKey,
    {
      realtime: {
        transport: WebSocket
      },
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false
      }
    }
  );
}
