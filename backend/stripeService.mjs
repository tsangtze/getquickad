import Stripe from "stripe";

function cleanEnvironmentValue(value) {
  return String(value ?? "").trim();
}

export function createStripeClient() {
  const secretKey =
    cleanEnvironmentValue(
      process.env.STRIPE_SECRET_KEY
    );

  if (!secretKey) {
    const error =
      new Error(
        "Stripe billing is not configured."
      );

    error.code =
      "STRIPE_NOT_CONFIGURED";

    throw error;
  }

  return new Stripe(secretKey);
}
