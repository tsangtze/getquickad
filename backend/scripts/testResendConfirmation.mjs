import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function buildFixture({
  resendError = null,
  resendThrows = null,
  applicationOrigin = "http://localhost:4100"
} = {}) {
  let source =
    fs.readFileSync(
      new URL("../authRoutes.mjs", import.meta.url),
      "utf8"
    );

  source = source
    .replace(/^import[\s\S]*?;\s*/gm, "")
    .replaceAll("export ", "");

  const stack = [];
  const calls = [];

  const router = {
    use: (...handlers) =>
      stack.push({
        kind: "use",
        handlers
      }),

    post: (path, ...handlers) =>
      stack.push({
        kind: "post",
        path,
        handlers
      }),

    get: (path, ...handlers) =>
      stack.push({
        kind: "get",
        path,
        handlers
      })
  };

  const context = {
    express: {
      Router: () => router
    },

    cookieParser: () => () => {},

    rateLimit: (config) =>
      Object.assign(
        () => {},
        { config }
      ),

    createPasswordHandlers: () => ({
      recover() {},
      link() {},
      update() {}
    }),

    authConfiguration: () => ({
      applicationOrigin
    }),

    createAuthClient: () => ({
      auth: {
        resend: async (payload) => {
          calls.push(payload);

          if (resendThrows) {
            throw resendThrows;
          }

          return {
            error: resendError
          };
        }
      }
    }),

    URL,

    process: {
      env: {
        NODE_ENV: "test"
      }
    }
  };

  vm.runInNewContext(
    source + "\ncreateAuthRouter();",
    context
  );

  const route =
    stack.find(
      (entry) =>
        entry.kind === "post" &&
        entry.path === "/resend-confirmation"
    );

  assert(route, "Resend confirmation route was not registered.");
  assert.equal(
    route.handlers.length,
    2,
    "Expected rate limiter followed by route handler."
  );

  function response() {
    return {
      statusCode: 200,
      body: undefined,

      status(code) {
        this.statusCode = code;
        return this;
      },

      json(body) {
        this.body = body;
        return this;
      }
    };
  }

  return {
    route,
    handler: route.handlers.at(-1),
    limiter: route.handlers[0],
    calls,
    response
  };
}

test(
  "resend confirmation validates email before contacting Supabase",
  async () => {
    const fixture = buildFixture();

    for (const email of [
      undefined,
      "",
      "bad",
      "@example.com",
      "a".repeat(255)
    ]) {
      const response = fixture.response();

      await fixture.handler(
        {
          body: {
            email
          }
        },
        response
      );

      assert.equal(response.statusCode, 400);
      assert.equal(
        response.body.code,
        "AUTH_CONFIRMATION_INVALID"
      );
    }

    assert.equal(fixture.calls.length, 0);
  }
);

test(
  "resend confirmation sends only normalized signup email with configured redirect",
  async () => {
    const fixture = buildFixture();
    const response = fixture.response();

    await fixture.handler(
      {
        body: {
          email: " owner@example.com "
        }
      },
      response
    );

    assert.equal(response.statusCode, 202);
    assert.equal(
      response.body.code,
      "AUTH_CONFIRMATION_RESENT"
    );

    assert.equal(fixture.calls.length, 1);

    assert.deepEqual(
      JSON.parse(JSON.stringify(fixture.calls[0])),
      {
        type: "signup",
        email: "owner@example.com",
        options: {
          emailRedirectTo: "http://localhost:4100/"
        }
      }
    );
  }
);

test(
  "resend confirmation keeps ordinary account-state outcomes neutral",
  async () => {
    let expectedBody;

    for (const resendError of [
      null,
      {
        status: 400,
        code: "email_not_confirmed"
      },
      {
        status: 404,
        code: "user_not_found"
      },
      {
        status: 422,
        code: "already_confirmed"
      }
    ]) {
      const fixture =
        buildFixture({
          resendError
        });

      const response =
        fixture.response();

      await fixture.handler(
        {
          body: {
            email: "owner@example.com"
          }
        },
        response
      );

      assert.equal(
        response.statusCode,
        202
      );

      assert.equal(
        response.body.code,
        "AUTH_CONFIRMATION_RESENT"
      );

      if (expectedBody) {
        assert.deepEqual(
          JSON.parse(JSON.stringify(response.body)),
          JSON.parse(JSON.stringify(expectedBody))
        );
      } else {
        expectedBody =
          response.body;
      }
    }
  }
);

test(
  "resend confirmation reports Supabase email rate limiting",
  async () => {
    const fixture =
      buildFixture({
        resendError: {
          status: 429,
          code: "over_email_send_rate_limit"
        }
      });

    const response =
      fixture.response();

    await fixture.handler(
      {
        body: {
          email: "owner@example.com"
        }
      },
      response
    );

    assert.equal(
      response.statusCode,
      429
    );

    assert.equal(
      response.body.code,
      "AUTH_CONFIRMATION_RATE_LIMIT"
    );
  }
);

test(
  "resend confirmation does not report upstream outages as success",
  async () => {
    for (const resendError of [
      {
        status: 503
      },
      {
        status: 500
      },
      {
        code: "network_error"
      }
    ]) {
      const fixture =
        buildFixture({
          resendError
        });

      const response =
        fixture.response();

      await fixture.handler(
        {
          body: {
            email: "owner@example.com"
          }
        },
        response
      );

      assert.equal(
        response.statusCode,
        503
      );

      assert.equal(
        response.body.code,
        "AUTH_CONFIRMATION_UNAVAILABLE"
      );
    }
  }
);

test(
  "resend confirmation handles thrown upstream failures",
  async () => {
    const fixture =
      buildFixture({
        resendThrows:
          new Error("network unavailable")
      });

    const response =
      fixture.response();

    await fixture.handler(
      {
        body: {
          email: "owner@example.com"
        }
      },
      response
    );

    assert.equal(
      response.statusCode,
      503
    );

    assert.equal(
      response.body.code,
      "AUTH_CONFIRMATION_UNAVAILABLE"
    );
  }
);

test(
  "resend confirmation route is rate limited",
  () => {
    const fixture =
      buildFixture();

    assert.equal(
      fixture.limiter.config.limit,
      5
    );

    assert.equal(
      fixture.limiter.config.windowMs,
      60 * 60 * 1000
    );

    assert.equal(
      fixture.limiter.config.message.code,
      "AUTH_CONFIRMATION_RATE_LIMIT"
    );
  }
);