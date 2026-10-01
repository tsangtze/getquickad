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
  createDeleteAccountHandler
} =
  await import(
    "../authRoutes.mjs"
  );

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    cleared: [],

    status(code) {
      this.statusCode = code;
      return this;
    },

    json(body) {
      this.body = body;
      return this;
    },

    clearCookie(name, options) {
      this.cleared.push({
        name,
        options
      });
    }
  };
}

{
  const calls = [];

  const handler =
    createDeleteAccountHandler({
      projectRoot:
        "TEST_PROJECT_ROOT",

      deleteAccount:
        async (root, userId) => {
          calls.push({
            root,
            userId
          });

          return {
            deleted: true,
            deletedProjects: 2,
            subscriptionCanceled: true,
            subscriptionMissing: false
          };
        }
    });

  const response =
    responseRecorder();

  await handler(
    {
      authUser: {
        id: "user-123"
      }
    },
    response
  );

  assert.deepEqual(
    calls,
    [
      {
        root: "TEST_PROJECT_ROOT",
        userId: "user-123"
      }
    ]
  );

  assert.equal(
    response.statusCode,
    200
  );

  assert.deepEqual(
    response.body,
    {
      ok: true,
      deleted: true,
      deletedProjects: 2,
      subscriptionCanceled: true,
      subscriptionMissing: false
    }
  );

  assert.deepEqual(
    response.cleared.map(
      (item) => item.name
    ),
    [
      "quickad_access",
      "quickad_refresh"
    ]
  );

  console.log(
    "PASS: Successful account deletion clears both login cookies"
  );
}

{
  const busyError =
    new Error(
      "Account busy"
    );

  busyError.code =
    "ACCOUNT_DELETE_BUSY";

  const handler =
    createDeleteAccountHandler({
      projectRoot:
        "TEST_PROJECT_ROOT",

      deleteAccount:
        async () => {
          throw busyError;
        }
    });

  const response =
    responseRecorder();

  await handler(
    {
      authUser: {
        id: "user-456"
      }
    },
    response
  );

  assert.equal(
    response.statusCode,
    409
  );

  assert.equal(
    response.body?.code,
    "ACCOUNT_DELETE_BUSY"
  );

  assert.equal(
    response.cleared.length,
    0
  );

  console.log(
    "PASS: Busy deletion preserves login cookies for retry"
  );
}

{
  const handler =
    createDeleteAccountHandler({
      projectRoot:
        "TEST_PROJECT_ROOT",

      deleteAccount:
        async () => {
          throw new Error(
            "Injected deletion failure"
          );
        }
    });

  const response =
    responseRecorder();

  const originalConsoleError =
    console.error;

  console.error =
    () => {};

  try {
    await handler(
      {
        authUser: {
          id: "user-789"
        }
      },
      response
    );
  } finally {
    console.error =
      originalConsoleError;
  }

  assert.equal(
    response.statusCode,
    503
  );

  assert.equal(
    response.body?.code,
    "ACCOUNT_DELETE_UNAVAILABLE"
  );

  assert.equal(
    response.cleared.length,
    0
  );

  console.log(
    "PASS: Failed deletion preserves login cookies"
  );
}

assert.throws(
  () =>
    createDeleteAccountHandler({
      projectRoot: ""
    }),
  /project root is required/i
);

console.log(
  "PASS: Missing project root is rejected"
);

console.log(
  "ALL ACCOUNT DELETION HTTP HANDLER TESTS PASSED."
);