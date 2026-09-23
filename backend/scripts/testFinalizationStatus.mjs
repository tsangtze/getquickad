import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";

const root =
  await fs.mkdtemp(
    path.join(
      os.tmpdir(),
      "pix2vid-finalization-status-"
    )
  );

try {
  const ownerId =
    "finalization-status-owner";

  const otherOwnerId =
    "finalization-status-other-owner";

  const readyId =
    "11111111-1111-4111-8111-111111111111";

  const renderingId =
    "22222222-2222-4222-8222-222222222222";

  const otherId =
    "33333333-3333-4333-8333-333333333333";

  const missingId =
    "44444444-4444-4444-8444-444444444444";

  const projectsDirectory =
    path.join(
      root,
      "projects"
    );

  async function writeProject(project) {
    const directory =
      path.join(
        projectsDirectory,
        project.id
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
        project,
        null,
        2
      )
    );
  }

  const readyVideo = {
    durationSeconds: 43,
    readyAt:
      "2026-09-22T20:21:46.000Z",
    expiresAt:
      "2026-09-23T20:21:46.000Z",
    r2Key:
      `videos/${ownerId}/${readyId}/final.mp4`,
    r2Url:
      `https://example.invalid/${readyId}.mp4`
  };

  await writeProject({
    id: readyId,
    ownerId,
    status: "video_ready",
    video: readyVideo
  });

  await writeProject({
    id: renderingId,
    ownerId,
    status: "rendering_video"
  });

  await writeProject({
    id: otherId,
    ownerId: otherOwnerId,
    status: "video_ready",
    video: {
      r2Key:
        `videos/${otherOwnerId}/${otherId}/final.mp4`,
      r2Url:
        `https://example.invalid/${otherId}.mp4`
    }
  });

  const routes = {};

  const router = {
    use() {},

    param() {},

    get(route, ...handlers) {
      routes[route] =
        handlers.at(-1);
    },

    delete() {},

    patch() {},

    post() {}
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

  const sourcePath =
    new URL(
      "../projectRoutes.mjs",
      import.meta.url
    );

  let source =
    await fs.readFile(
      sourcePath,
      "utf8"
    );

  source =
    source
      .replace(
        /^import[\s\S]*?;\s*$/gm,
        ""
      )
      .replace(
        /^export\s+(?=(?:async\s+)?function\s+|(?:const|let|var|class)\s+)/gm,
        ""
      );

  const context = {
    console,
    process,
    URL,
    Buffer,
    setTimeout,
    clearTimeout,
    router,
    express: {
      Router() {
        return router;
      }
    },
    multer,
    cookieParser:
      () => (
        (_request, _response, next) =>
          next()
      ),
    requireUser:
      (_request, _response, next) =>
        next(),
    authConfiguration:
      () => ({
        applicationOrigin:
          "http://localhost:4100"
      }),
    isTrustedApplicationRequest:
      () => true,
    crypto: {
      randomUUID() {
        return readyId;
      }
    },
    path,
    fs,

    reconcilePaidEntitlement:
      async () => {},

    getUserUsage:
      async () => ({}),

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
      async () => {
        throw new Error(
          "Unexpected credit accounting."
        );
      },

    rollbackSuccessfulFinalVideo:
      async () => {
        throw new Error(
          "Unexpected credit rollback."
        );
      },

    recordSuccessfulVideoPlan:
      async () => {
        throw new Error(
          "Unexpected video-plan accounting."
        );
      },

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
            "Unexpected R2 request."
          );
        }
    },

    R2_BUCKET:
      "test-bucket"
  };

  vm.createContext(context);

  vm.runInContext(
    `${source}
this.__createProjectRouter =
  createProjectRouter;`,
    context,
    {
      filename:
        "projectRoutes.test.mjs"
    }
  );

  await context.__createProjectRouter({
    projectRoot: root
  });

  const statusHandler =
    routes[
      "/:projectId/finalization-status"
    ];

  assert.equal(
    typeof statusHandler,
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

  async function runStatus(
    projectId,
    authUserId
  ) {
    const response =
      makeResponse();

    let nextError = null;

    await statusHandler(
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

  {
    const response =
      await runStatus(
        readyId,
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
      response.body?.project?.id,
      readyId
    );

    assert.equal(
      response.body?.project?.status,
      "video_ready"
    );

    assert.equal(
      response.body?.video?.durationSeconds,
      readyVideo.durationSeconds
    );

    assert.equal(
      response.body?.video?.readyAt,
      readyVideo.readyAt
    );

    assert.equal(
      response.body?.video?.expiresAt,
      readyVideo.expiresAt
    );

    assert.equal(
      response.body?.video?.r2Key,
      readyVideo.r2Key
    );

    assert.equal(
      response.body?.video?.r2Url,
      readyVideo.r2Url
    );

    assert.equal(
      response.body?.videoUrl,
      `/api/projects/${readyId}/video`
    );
  }

  {
    const response =
      await runStatus(
        renderingId,
        ownerId
      );

    assert.equal(
      response.statusCode,
      200
    );

    assert.equal(
      response.body?.project?.status,
      "rendering_video"
    );

    assert.equal(
      response.body?.video,
      null
    );

    assert.equal(
      response.body?.videoUrl,
      null
    );
  }

  {
    const response =
      await runStatus(
        otherId,
        ownerId
      );

    assert.equal(
      response.statusCode,
      404
    );

    assert.equal(
      response.body?.code,
      "PROJECT_NOT_FOUND"
    );
  }

  {
    const response =
      await runStatus(
        missingId,
        ownerId
      );

    assert.equal(
      response.statusCode,
      404
    );

    assert.equal(
      response.body?.code,
      "PROJECT_NOT_FOUND"
    );
  }

  {
    const response =
      await runStatus(
        "not-a-project-id",
        ownerId
      );

    assert.equal(
      response.statusCode,
      404
    );

    assert.equal(
      response.body?.code,
      "PROJECT_NOT_FOUND"
    );
  }

  console.log(
    "PASS: finalization-status returns persisted completion safely without rerunning finalize."
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