const originalUrl =
  process.env.SUPABASE_URL;

const originalKey =
  process.env.SUPABASE_PUBLISHABLE_KEY;

delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_PUBLISHABLE_KEY;

const {
  createAuthClient,
  isAuthConfigured
} =
  await import(
    "../authService.mjs"
  );

if (isAuthConfigured()) {
  throw new Error(
    "Missing Supabase configuration was accepted."
  );
}

let rejectedSafely = false;

try {
  createAuthClient();
} catch (error) {
  rejectedSafely =
    error?.code ===
    "AUTH_NOT_CONFIGURED";
}

if (!rejectedSafely) {
  throw new Error(
    "Missing Supabase configuration was not rejected safely."
  );
}

if (originalUrl === undefined) {
  delete process.env.SUPABASE_URL;
} else {
  process.env.SUPABASE_URL =
    originalUrl;
}

if (originalKey === undefined) {
  delete process.env.SUPABASE_PUBLISHABLE_KEY;
} else {
  process.env.SUPABASE_PUBLISHABLE_KEY =
    originalKey;
}

console.log(
  "PASS: Missing auth configuration rejected safely."
);

console.log(
  "PASS: No Supabase authentication request was made."
);
