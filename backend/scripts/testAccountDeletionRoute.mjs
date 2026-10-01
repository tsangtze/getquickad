import assert from "node:assert/strict";
import express from "express";

process.env.APP_ORIGIN =
  "https://route-test.pix2vid.invalid";

const {
  createAuthRouter
} = await import("../authRoutes.mjs");

const projectRoot =
  "TEST_PROJECT_ROOT";

const authenticatedUserId =
  "route-test-user";

const deletionCalls =
  [];

function authenticatedMiddleware(
  request,
  _response,
  next
) {
  request.authUser = {
    id: authenticatedUserId,
    email: "route-test@example.com"
  };

  next();
}

async function fakeDeleteAccount(
  root,
  userId
) {
  deletionCalls.push({
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

const app =
  express();

app.use(
  "/api/auth",
  createAuthRouter({
    projectRoot,
    requireUserMiddleware:
      authenticatedMiddleware,
    deleteAccount:
      fakeDeleteAccount
  })
);

const unauthenticatedApp =
  express();

unauthenticatedApp.use(
  "/api/auth",
  createAuthRouter({
    projectRoot,
    deleteAccount:
      async () => {
        throw new Error(
          "Unauthenticated request must never reach deletion."
        );
      }
  })
);

const unauthenticatedServer =
  await new Promise(
    (resolve, reject) => {
      const instance =
        unauthenticatedApp.listen(
          0,
          "127.0.0.1",
          () => resolve(instance)
        );

      instance.on(
        "error",
        reject
      );
    }
  );

const unauthenticatedAddress =
  unauthenticatedServer.address();

const unauthenticatedBaseUrl =
  `http://127.0.0.1:${unauthenticatedAddress.port}`;

try {
  const response =
    await fetch(
      `${unauthenticatedBaseUrl}/api/auth/delete-account`,
      {
        method: "POST",
        headers: {
          Origin:
            "https://route-test.pix2vid.invalid",
          "Content-Type":
            "application/json"
        },
        body:
          "{}"
      }
    );

  const json =
    await response.json();

  assert.equal(
    response.status,
    401
  );

  assert.equal(
    json.code,
    "AUTH_SIGN_IN_REQUIRED"
  );

  console.log(
    "PASS: Real requireUser rejects unsigned account deletion"
  );
} finally {
  await new Promise(
    (resolve, reject) => {
      unauthenticatedServer.close(
        (error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        }
      );
    }
  );
}
const server =
  await new Promise(
    (resolve, reject) => {
      const instance =
        app.listen(
          0,
          "127.0.0.1",
          () => resolve(instance)
        );

      instance.on(
        "error",
        reject
      );
    }
  );

const address =
  server.address();

const baseUrl =
  `http://127.0.0.1:${address.port}`;

async function postDelete({
  origin,
  contentType = "application/json",
  body = "{}"
} = {}) {
  const headers = {};

  if (origin !== undefined) {
    headers.Origin = origin;
  }

  if (contentType !== null) {
    headers["Content-Type"] =
      contentType;
  }

  const response =
    await fetch(
      `${baseUrl}/api/auth/delete-account`,
      {
        method: "POST",
        headers,
        body
      }
    );

  const json =
    await response.json();

  return {
    response,
    json
  };
}

try {
  {
    const {
      response,
      json
    } =
      await postDelete({
        origin:
          "https://evil.example"
      });

    assert.equal(
      response.status,
      403
    );

    assert.equal(
      json.code,
      "AUTH_ORIGIN_REQUIRED"
    );

    assert.equal(
      deletionCalls.length,
      0
    );

    console.log(
      "PASS: Untrusted origin is rejected before account deletion"
    );
  }

  {
    const {
      response,
      json
    } =
      await postDelete({
        origin:
          "https://route-test.pix2vid.invalid",
        contentType:
          "text/plain",
        body:
          "{}"
      });

    assert.equal(
      response.status,
      415
    );

    assert.equal(
      json.code,
      "AUTH_JSON_REQUIRED"
    );

    assert.equal(
      deletionCalls.length,
      0
    );

    console.log(
      "PASS: Non-JSON request is rejected before account deletion"
    );
  }

  {
    const {
      response,
      json
    } =
      await postDelete({
        origin:
          "https://route-test.pix2vid.invalid"
      });

    assert.equal(
      response.status,
      200
    );

    assert.equal(
      json.ok,
      true
    );

    assert.equal(
      json.deleted,
      true
    );

    assert.equal(
      json.deletedProjects,
      2
    );

    assert.equal(
      json.subscriptionCanceled,
      true
    );

    assert.equal(
      deletionCalls.length,
      1
    );

    assert.deepEqual(
      deletionCalls[0],
      {
        root:
          projectRoot,
        userId:
          authenticatedUserId
      }
    );

    const setCookie =
      response.headers.get(
        "set-cookie"
      ) ?? "";

    assert.match(
      setCookie,
      /quickad_access=/
    );

    assert.match(
      setCookie,
      /quickad_refresh=/
    );

    console.log(
      "PASS: Authenticated trusted JSON request reaches account deletion and clears login"
    );
  }

  console.log(
    "ALL ACCOUNT DELETION ROUTE HTTP TESTS PASSED."
  );
} finally {
  await new Promise(
    (resolve, reject) => {
      server.close(
        (error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        }
      );
    }
  );
}