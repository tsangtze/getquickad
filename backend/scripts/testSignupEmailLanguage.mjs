import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function buildFixture({
  signUpError = null,
  signUpData = { session: null },
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
        signUp: async (payload) => {
          calls.push(payload);

          return {
            data: signUpData,
            error: signUpError
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
        entry.path === "/signup"
    );

  assert(route, "Signup route was not registered.");

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
    handler: route.handlers.at(-1),
    calls,
    response
  };
}

async function submitSignup(
  fixture,
  language
) {
  const response = fixture.response();

  await fixture.handler(
    {
      body: {
        email: " owner@example.com ",
        password: "12345678",
        language
      }
    },
    response
  );

  return response;
}

test(
  "signup stores supported zh-TW language in Supabase metadata",
  async () => {
    const fixture = buildFixture();

    const response =
      await submitSignup(
        fixture,
        "zh-TW"
      );

    assert.equal(response.statusCode, 202);
    assert.equal(fixture.calls.length, 1);

    assert.deepEqual(
      JSON.parse(
        JSON.stringify(fixture.calls[0])
      ),
      {
        email: "owner@example.com",
        password: "12345678",
        options: {
          emailRedirectTo:
            "http://localhost:4100/",
          data: {
            language: "zh-TW"
          }
        }
      }
    );
  }
);

test(
  "signup falls back to English for unsupported language",
  async () => {
    const fixture = buildFixture();

    const response =
      await submitSignup(
        fixture,
        "not-a-language"
      );

    assert.equal(response.statusCode, 202);
    assert.equal(fixture.calls.length, 1);

    assert.equal(
      fixture.calls[0].options.data.language,
      "en"
    );
  }
);

test(
  "signup falls back to English when language is missing",
  async () => {
    const fixture = buildFixture();

    const response =
      await submitSignup(
        fixture,
        undefined
      );

    assert.equal(response.statusCode, 202);
    assert.equal(fixture.calls.length, 1);

    assert.equal(
      fixture.calls[0].options.data.language,
      "en"
    );
  }
);

test(
  "signup accepts every QuickAd email language",
  async () => {
    const supported = [
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
    ];

    for (const language of supported) {
      const fixture = buildFixture();

      const response =
        await submitSignup(
          fixture,
          language
        );

      assert.equal(
        response.statusCode,
        202,
        language
      );

      assert.equal(
        fixture.calls.length,
        1,
        language
      );

      assert.equal(
        fixture.calls[0].options.data.language,
        language,
        language
      );
    }
  }
);
