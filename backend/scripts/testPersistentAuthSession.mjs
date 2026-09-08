import assert from "node:assert/strict";

process.env.SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://example.supabase.co";

process.env.SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  "test-anon-key";

process.env.APPLICATION_ORIGIN =
  process.env.APPLICATION_ORIGIN ||
  "http://localhost:4100";

const {
  __persistentAuthTestHelpers
} = await import("../authRoutes.mjs");

const {
  accessCookieName,
  refreshCookieName,
  persistentSessionMilliseconds,
  writeLogin,
  clearLogin
} = __persistentAuthTestHelpers;

function responseRecorder() {
  const cookies = [];
  const cleared = [];

  return {
    cookies,
    cleared,

    cookie(name, value, options) {
      cookies.push({
        name,
        value,
        options
      });
    },

    clearCookie(name, options) {
      cleared.push({
        name,
        options
      });
    }
  };
}

assert.equal(
  accessCookieName,
  "quickad_access"
);

assert.equal(
  refreshCookieName,
  "quickad_refresh"
);

assert.equal(
  persistentSessionMilliseconds,
  30 * 24 * 60 * 60 * 1000
);

{
  const response = responseRecorder();

  writeLogin(response, {
    access_token: "access-one",
    refresh_token: "refresh-one",
    expires_at: Math.floor(Date.now() / 1000) + 3600
  });

  assert.equal(response.cookies.length, 2);

  assert.deepEqual(
    response.cookies.map((item) => item.name),
    [
      "quickad_access",
      "quickad_refresh"
    ]
  );

  assert.deepEqual(
    response.cookies.map((item) => item.value),
    [
      "access-one",
      "refresh-one"
    ]
  );

  for (const item of response.cookies) {
    assert.equal(item.options.httpOnly, true);
    assert.equal(item.options.sameSite, "lax");
    assert.equal(item.options.path, "/");
  }

  const accessCookie =
    response.cookies.find(
      (item) => item.name === "quickad_access"
    );

  const refreshCookie =
    response.cookies.find(
      (item) => item.name === "quickad_refresh"
    );

  assert(accessCookie);
  assert(refreshCookie);

  assert(
    accessCookie.options.maxAge > 0 &&
    accessCookie.options.maxAge <= 60 * 60 * 1000
  );

  assert.equal(
    refreshCookie.options.maxAge,
    persistentSessionMilliseconds
  );

  console.log(
    "PASS: Login writes access and refresh HttpOnly cookies."
  );
}

{
  const response = responseRecorder();

  writeLogin(response, {
    access_token: "rotated-access",
    refresh_token: "rotated-refresh",
    expires_at: Math.floor(Date.now() / 1000) + 3600
  });

  assert.equal(
    response.cookies.find(
      (item) => item.name === "quickad_access"
    )?.value,
    "rotated-access"
  );

  assert.equal(
    response.cookies.find(
      (item) => item.name === "quickad_refresh"
    )?.value,
    "rotated-refresh"
  );

  console.log(
    "PASS: Refreshed Supabase credentials rotate both cookies."
  );
}

{
  const response = responseRecorder();

  clearLogin(response);

  assert.deepEqual(
    response.cleared.map((item) => item.name),
    [
      "quickad_access",
      "quickad_refresh"
    ]
  );

  console.log(
    "PASS: Logout clears both authentication cookies."
  );
}

{
  const response = responseRecorder();

  assert.throws(
    () => {
      writeLogin(response, {
        access_token: "access-only"
      });
    },
    /Invalid authentication session/
  );

  assert.equal(response.cookies.length, 0);

  console.log(
    "PASS: Incomplete sessions cannot create persistent login cookies."
  );
}

console.log(
  "PASS: Persistent authentication cookie contract is valid."
);