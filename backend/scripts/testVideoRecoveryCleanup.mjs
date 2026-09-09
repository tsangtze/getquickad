import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

import {
  cleanupExpiredProjects,
  TEMP_PROJECT_RETENTION_MS,
  FINISHED_VIDEO_RETENTION_MS
} from "../cleanup.mjs";

const now = Date.parse("2026-09-09T12:00:00.000Z");

const root =
  await fs.mkdtemp(
    path.join(os.tmpdir(), "quickad-video-recovery-")
  );

const projectsRoot =
  path.join(root, "projects");

await fs.mkdir(projectsRoot, {
  recursive: true
});

const deletedR2 = [];

async function createProject({
  status,
  ageMs,
  expiresAt
}) {
  const id = crypto.randomUUID();
  const ownerId = `owner-${id}`;

  const directory =
    path.join(projectsRoot, id);

  await fs.mkdir(directory, {
    recursive: true
  });

  const project = {
    id,
    ownerId,
    status,
    createdAt:
      new Date(now - ageMs).toISOString()
  };

  if (status === "video_ready") {
    project.video = {};

    if (expiresAt !== undefined) {
      project.video.expiresAt = expiresAt;
    }
  }

  await fs.writeFile(
    path.join(directory, "project.json"),
    JSON.stringify(project, null, 2),
    "utf8"
  );

  return {
    id,
    ownerId,
    directory
  };
}

async function exists(directory) {
  try {
    await fs.access(directory);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

const temp23h =
  await createProject({
    status: "storyboard_ready",
    ageMs: 23 * 60 * 60 * 1000
  });

const temp25h =
  await createProject({
    status: "storyboard_ready",
    ageMs: 25 * 60 * 60 * 1000
  });

const videoStillRecoverable =
  await createProject({
    status: "video_ready",
    ageMs: 30 * 60 * 60 * 1000,
    expiresAt:
      new Date(
        now + 6 * 60 * 60 * 1000
      ).toISOString()
  });

const videoExpired =
  await createProject({
    status: "video_ready",
    ageMs: FINISHED_VIDEO_RETENTION_MS + 60 * 60 * 1000,
    expiresAt:
      new Date(
        now - 60 * 60 * 1000
      ).toISOString()
  });

const legacyVideo23h =
  await createProject({
    status: "video_ready",
    ageMs: 23 * 60 * 60 * 1000
  });

const legacyVideo25h =
  await createProject({
    status: "video_ready",
    ageMs: 25 * 60 * 60 * 1000
  });

const renderingExpired =
  await createProject({
    status: "rendering_video",
    ageMs: TEMP_PROJECT_RETENTION_MS + 60 * 60 * 1000
  });

const deleted =
  await cleanupExpiredProjects(
    root,
    {
      now,
      deleteR2Objects:
        async (ownerId, projectId) => {
          deletedR2.push({
            ownerId,
            projectId
          });
        }
    }
  );

assert.equal(
  await exists(temp23h.directory),
  true,
  "23-hour temporary project must remain."
);

assert.equal(
  await exists(temp25h.directory),
  false,
  "25-hour temporary project must be deleted."
);

assert.equal(
  await exists(videoStillRecoverable.directory),
  true,
  "Finished video must remain until expiresAt."
);

assert.equal(
  await exists(videoExpired.directory),
  false,
  "Finished video must be deleted after expiresAt."
);

assert.equal(
  await exists(legacyVideo23h.directory),
  true,
  "Legacy 23-hour finished video must remain."
);

assert.equal(
  await exists(legacyVideo25h.directory),
  false,
  "Legacy finished video without expiresAt must retain the old 24-hour rule."
);

assert.equal(
  await exists(renderingExpired.directory),
  true,
  "In-progress rendering project must not be deleted."
);

assert.equal(
  deleted,
  3,
  "Exactly three projects should be deleted."
);

assert.deepEqual(
  new Set(
    deletedR2.map(
      ({ projectId }) => projectId
    )
  ),
  new Set([
    temp25h.id,
    videoExpired.id,
    legacyVideo25h.id
  ]),
  "R2 cleanup must run for exactly the deleted projects."
);

await fs.rm(root, {
  recursive: true,
  force: true
});

console.log(
  "PASS: Version 1.1.8.38 video recovery cleanup tests"
);