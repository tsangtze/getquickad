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
  requireUser
} = await import("../authRoutes.mjs");

function makeResponse() {
  return {
    statusCode: 200,
    body: null,
    cookies: [],
    cleared: [],
    headers: {},

    set(name, value) {
      this.headers[name] = value;
      return this;
    },

    status(code) {
      this.statusCode = code;
      return this;
    },

    json(body) {
      this.body = body;
      return this;
    },

    cookie(name, value, options) {
      this.cookies.push({
        name,
        value,
        options
      });
      return this;
    },

    clearCookie(name, options) {
      this.cleared.push({
        name,
        options
      });
      return this;
    }
  };
}

async function runRequireUser({
  cookies = {},
  getUser,
  refreshSession
}) {
  const request = {
    cookies
  };

  const response =
    makeResponse();

  let nextCalls = 0;

  const next = () => {
    nextCalls += 1;
  };

  const client = {
    auth: {
      getUser:
        getUser ||
        (async () => ({
          data: {
            user: null
          },
          error: null
        })),

      refreshSession:
        refreshSession ||
        (async () => ({
          data: {
            session: null,
            user: null
          },
          error: {
            status: 401
          }
        }))
    }
  };

  await requireUser(
    request,
    response,
    next,
    () => client
  );

  return {
    request,
    response,
    nextCalls
  };
}

{
  let refreshCalls = 0;

  const result =
    await runRequireUser({
      cookies: {
        quickad_access: "valid-access",
        quickad_refresh: "valid-refresh"
      },

      getUser: async (token) => {
        assert.equal(
          token,
          "valid-access"
        );

        return {
          data: {
            user: {
              id: "user-valid",
              email: "valid@example.com"
            }
          },
          error: null
        };
      },

      refreshSession: async () => {
        refreshCalls += 1;
        return {
          data: {},
          error: null
        };
      }
    });

  assert.equal(result.nextCalls, 1);
  assert.equal(refreshCalls, 0);

  assert.deepEqual(
    result.request.authUser,
    {
      id: "user-valid",
      email: "valid@example.com"
    }
  );

  console.log(
    "PASS: Valid access token proceeds without refresh."
  );
}

{
  const result =
    await runRequireUser({
      cookies: {
        quickad_refresh: "refresh-only"
      },

      refreshSession: async ({
        refresh_token
      }) => {
        assert.equal(
          refresh_token,
          "refresh-only"
        );

        return {
          data: {
            session: {
              access_token: "new-access",
              refresh_token: "new-refresh",
              expires_at: Math.floor(Date.now() / 1000) + 3600
            },
            user: {
              id: "user-refresh",
              email: "refresh@example.com"
            }
          },
          error: null
        };
      }
    });

  assert.equal(result.nextCalls, 1);

  assert.deepEqual(
    result.response.cookies.map(
      (item) => [
        item.name,
        item.value
      ]
    ),
    [
      [
        "quickad_access",
        "new-access"
      ],
      [
        "quickad_refresh",
        "new-refresh"
      ]
    ]
  );

  console.log(
    "PASS: Missing access token silently refreshes and continues."
  );
}

{
  let refreshCalls = 0;

  const result =
    await runRequireUser({
      cookies: {
        quickad_access: "expired-access",
        quickad_refresh: "refresh-after-expiry"
      },

      getUser: async () => ({
        data: {
          user: null
        },
        error: {
          status: 401
        }
      }),

      refreshSession: async ({
        refresh_token
      }) => {
        refreshCalls += 1;

        assert.equal(
          refresh_token,
          "refresh-after-expiry"
        );

        return {
          data: {
            session: {
              access_token: "rotated-access",
              refresh_token: "rotated-refresh",
              expires_at: Math.floor(Date.now() / 1000) + 3600
            },
            user: {
              id: "user-rotated",
              email: "rotated@example.com"
            }
          },
          error: null
        };
      }
    });

  assert.equal(refreshCalls, 1);
  assert.equal(result.nextCalls, 1);
  assert.equal(result.response.statusCode, 200);

  console.log(
    "PASS: Expired access token refreshes instead of logging out."
  );
}

{
  const result =
    await runRequireUser({
      cookies: {
        quickad_access: "expired-access",
        quickad_refresh: "invalid-refresh"
      },

      getUser: async () => ({
        data: {
          user: null
        },
        error: {
          status: 401
        }
      }),

      refreshSession: async () => ({
        data: {
          session: null,
          user: null
        },
        error: {
          status: 401
        }
      })
    });

  assert.equal(result.nextCalls, 0);
  assert.equal(result.response.statusCode, 401);

  assert.equal(
    result.response.body?.code,
    "AUTH_SESSION_EXPIRED"
  );

  assert.deepEqual(
    result.response.cleared.map(
      (item) => item.name
    ),
    [
      "quickad_access",
      "quickad_refresh"
    ]
  );

  console.log(
    "PASS: Invalid refresh token clears login and returns 401."
  );
}

{
  let refreshCalls = 0;

  const result =
    await runRequireUser({
      cookies: {
        quickad_access: "temporary-failure",
        quickad_refresh: "still-valid"
      },

      getUser: async () => ({
        data: {
          user: null
        },
        error: {
          status: 503
        }
      }),

      refreshSession: async () => {
        refreshCalls += 1;
        return {
          data: {},
          error: null
        };
      }
    });

  assert.equal(result.nextCalls, 0);
  assert.equal(result.response.statusCode, 503);

  assert.equal(
    result.response.body?.code,
    "AUTH_UNAVAILABLE"
  );

  assert.equal(refreshCalls, 0);
  assert.equal(result.response.cleared.length, 0);

  console.log(
    "PASS: Upstream validation outage returns 503 without logout."
  );
}

{
  const result =
    await runRequireUser({
      cookies: {}
    });

  assert.equal(result.nextCalls, 0);
  assert.equal(result.response.statusCode, 401);

  assert.equal(
    result.response.body?.code,
    "AUTH_SIGN_IN_REQUIRED"
  );

  console.log(
    "PASS: Missing both credentials still requires sign-in."
  );
}

console.log(
  "PASS: requireUser persistent-session refresh contract is valid."
);