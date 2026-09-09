import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";

const root =
  await fs.mkdtemp(
    path.join(
      os.tmpdir(),
      "quickad-video-delete-test-"
    )
  );

try {
  const ownerId =
    "delete-test-owner";

  const otherOwnerId =
    "delete-test-other-owner";

  const activeId =
    "11111111-1111-4111-8111-111111111111";

  const otherId =
    "22222222-2222-4222-8222-222222222222";

  const expiredId =
    "33333333-3333-4333-8333-333333333333";

  const now =
    Date.now();

  async function createProject({
    id,
    owner,
    expiresOffsetMs
  }) {
    const directory =
      path.join(
        root,
        "projects",
        id
      );

    await fs.mkdir(
      directory,
      {
        recursive: true
      }
    );

    await fs.writeFile(
      path.join(
        directory,
        "project.json"
      ),
      JSON.stringify(
        {
          id,
          ownerId: owner,
          status: "video_ready",
          video: {
            readyAt:
              new Date(
                now -
                  60 * 60 * 1000
              ).toISOString(),
            expiresAt:
              new Date(
                now +
                  expiresOffsetMs
              ).toISOString(),
            r2Key:
              `videos/${owner}/${id}/final.mp4`,
            r2Url:
              `https://example.invalid/${id}.mp4`
          }
        },
        null,
        2
      )
    );

    return directory;
  }

  const activeDirectory =
    await createProject({
      id: activeId,
      owner: ownerId,
      expiresOffsetMs:
        12 * 60 * 60 * 1000
    });

  const otherDirectory =
    await createProject({
      id: otherId,
      owner: otherOwnerId,
      expiresOffsetMs:
        12 * 60 * 60 * 1000
    });

  const expiredDirectory =
    await createProject({
      id: expiredId,
      owner: ownerId,
      expiresOffsetMs:
        -60 * 60 * 1000
    });

  const routes = {};
  let projectParamHandler = null;

  const router = {
    use() {},

    param(name, handler) {
      if (name === "projectId") {
        projectParamHandler =
          handler;
      }
    },

    get() {},
    post() {},

    delete(route, ...handlers) {
      routes[route] =
        handlers.at(-1);
    }
  };

  const multer =
    () => ({
      fields() {
        return () => {};
      },

      single() {
        return () => {};
      }
    });

  multer.diskStorage =
    () => ({});

  const deletedR2 = [];

  const source =
    (
      await fs.readFile(
        new URL(
          "../projectRoutes.mjs",
          import.meta.url
        ),
        "utf8"
      )
    )
      .replace(
        /^import[\s\S]*?;\s*\n/gm,
        ""
      )
      .replace(
        /export async function /g,
        "async function "
      )
      .replace(
        /export function /g,
        "function "
      );

  const createProjectRouter =
    vm.runInNewContext(
      source +
        "\n;createProjectRouter",
      {
        fs,
        path,
        console,
        crypto: {},
        cookieParser:
          () => () => {},
        requireUser() {},
        authConfiguration() {
          return {
            applicationOrigin:
              "https://getquickad.com"
          };
        },

        express: {
          Router:
            () => router
        },

        multer,

        deleteProjectR2Objects:
          async (
            owner,
            projectId
          ) => {
            deletedR2.push({
              owner,
              projectId
            });
          },

        listRecoverableVideos:
          async () => [],

        canStorePaidRecoverableVideo:
          async () => ({
            ok: true,
            count: 0,
            limit: 10,
            remaining: 10
          }),

        reconcilePaidEntitlement:
          async usage => usage,

        getUserUsage:
          async () => ({
            planId: "pro",
            finalVideoCount: 0,
            monthlyCreditsUsed: 0
          }),

        getPlan:
          () => ({
            id: "pro"
          }),

        canGenerateFinalVideo:
          () => ({
            ok: true,
            freeRerender: false
          }),

        recordSuccessfulFinalVideo:
          async () => ({
            planId: "pro",
            creditCost: 0
          }),

        rollbackSuccessfulFinalVideo:
          async () => {},

        recordSuccessfulVideoPlan:
          async () => {},

        LIMITS: {
          FREE_FINAL_VIDEOS: 2,
          FREE_MAX_VIDEO_SECONDS: 30,
          PAID_MAX_VIDEO_SECONDS: 60
        },

        prepareMusic:
          value => value,

        validateMusicVolume:
          value => value,

        validateStoryboard:
          storyboard => ({
            ok: true,
            storyboard
          }),

        generateStoryboard:
          async () => {
            throw new Error(
              "Unexpected storyboard generation."
            );
          },

        generateNarration:
          async () => {
            throw new Error(
              "Unexpected narration generation."
            );
          },

        renderVideo:
          async () => {
            throw new Error(
              "Unexpected render."
            );
          },

        uploadToR2:
          async () => {
            throw new Error(
              "Unexpected R2 upload."
            );
          },

        GetObjectCommand:
          class {},

        PutObjectCommand:
          class {},

        r2Client: {
          send:
            async () => {
              throw new Error(
                "Unexpected R2 read."
              );
            }
        },

        R2_BUCKET:
          "test-bucket"
      }
    );

  await createProjectRouter({
    projectRoot: root
  });

  assert.equal(
    typeof projectParamHandler,
    "function"
  );

  assert.equal(
    typeof routes["/:projectId/video"],
    "function"
  );

  function makeResponse() {
    return {
      statusCode: 200,
      body: null,

      status(code) {
        this.statusCode =
          code;
        return this;
      },

      json(body) {
        this.body =
          body;
        return this;
      }
    };
  }

  async function runProjectParam(
    projectId,
    authUserId
  ) {
    const response =
      makeResponse();

    let nextCalled =
      false;

    await projectParamHandler(
      {
        authUser: {
          id: authUserId
        }
      },
      response,
      () => {
        nextCalled =
          true;
      },
      projectId
    );

    return {
      response,
      nextCalled
    };
  }

  async function runDelete(
    projectId,
    authUserId
  ) {
    const response =
      makeResponse();

    let nextError = null;

    await routes[
      "/:projectId/video"
    ](
      {
        params: {
          projectId
        },
        authUser: {
          id: authUserId
        }
      },
      response,
      error => {
        nextError =
          error;
      }
    );

    if (nextError) {
      throw nextError;
    }

    return response;
  }

  // Owner passes ownership middleware.
  {
    const result =
      await runProjectParam(
        activeId,
        ownerId
      );

    assert.equal(
      result.nextCalled,
      true
    );

    assert.equal(
      result.response.statusCode,
      200
    );
  }

  // Another owner is hidden with 404.
  {
    const result =
      await runProjectParam(
        otherId,
        ownerId
      );

    assert.equal(
      result.nextCalled,
      false
    );

    assert.equal(
      result.response.statusCode,
      404
    );

    assert.equal(
      result.response.body?.code,
      "PROJECT_NOT_FOUND"
    );

    await fs.access(
      otherDirectory
    );

    assert.equal(
      deletedR2.length,
      0
    );
  }

  // Expired video cannot be deleted manually.
  {
    const response =
      await runDelete(
        expiredId,
        ownerId
      );

    assert.equal(
      response.statusCode,
      409
    );

    assert.equal(
      response.body?.code,
      "VIDEO_NOT_RECOVERABLE"
    );

    await fs.access(
      expiredDirectory
    );

    assert.equal(
      deletedR2.length,
      0
    );
  }

  // Active recoverable video is permanently deleted.
  {
    const response =
      await runDelete(
        activeId,
        ownerId
      );

    assert.equal(
      response.statusCode,
      200
    );

    assert.equal(
      response.body?.ok,
      true
    );

    assert.equal(
      response.body?.deletedProjectId,
      activeId
    );

    assert.deepEqual(
      deletedR2,
      [
        {
          owner:
            ownerId,
          projectId:
            activeId
        }
      ]
    );

    await assert.rejects(
      fs.access(
        activeDirectory
      ),
      error =>
        error?.code ===
        "ENOENT"
    );

    await fs.access(
      otherDirectory
    );

    await fs.access(
      expiredDirectory
    );
  }

  console.log(
    "PASS: Version 1.1.8.39 recoverable video DELETE API tests"
  );
} finally {
  await fs.rm(
    root,
    {
      recursive: true,
      force: true
    }
  );
}