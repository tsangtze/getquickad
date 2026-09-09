import path from "node:path";
import fs from "node:fs/promises";
import {
  DeleteObjectCommand,
  ListObjectsV2Command
} from "@aws-sdk/client-s3";

import {
  r2Client,
  R2_BUCKET
} from "./r2Client.mjs";


export const TEMP_PROJECT_RETENTION_HOURS = 24;

export const TEMP_PROJECT_RETENTION_MS =
  TEMP_PROJECT_RETENTION_HOURS * 60 * 60 * 1000;

export const FINISHED_VIDEO_RETENTION_HOURS = 36;

export const FINISHED_VIDEO_RETENTION_MS =
  FINISHED_VIDEO_RETENTION_HOURS * 60 * 60 * 1000;

const PROJECT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CLEANUP_ELIGIBLE_PROJECT_STATUSES = new Set([
  "storyboard_ready",
  "video_ready",
  "storyboard_failed",
  "narration_failed",
  "video_failed",
  "approval_failed"
]);

export async function deleteProjectR2Objects(
  ownerId,
  projectId
) {
  if (!R2_BUCKET) {
    return;
  }

  const prefix =
    `videos/${ownerId}/${projectId}/`;

  try {
    let continuationToken;

    do {
      const list =
        await r2Client.send(
          new ListObjectsV2Command({
            Bucket: R2_BUCKET,
            Prefix: prefix,
            ContinuationToken:
              continuationToken
          })
        );

      for (const object of list.Contents ?? []) {
        if (!object?.Key) {
          continue;
        }

        await r2Client.send(
          new DeleteObjectCommand({
            Bucket: R2_BUCKET,
            Key: object.Key
          })
        );

        console.log(
          `[cleanup] Deleted R2 ${object.Key}`
        );
      }

      continuationToken =
        list.IsTruncated
          ? list.NextContinuationToken
          : undefined;
    } while (continuationToken);
  } catch (error) {
    console.error(
      `[cleanup] R2 delete failed for project ${projectId}:`,
      error?.message ?? error
    );
    throw error;
  }
}

export const PAID_RECOVERABLE_VIDEO_LIMIT = 10;

export async function listRecoverableVideos(
  projectRoot,
  ownerId,
  {
    now = Date.now()
  } = {}
) {
  const projectsRoot =
    path.join(projectRoot, "projects");

  let projectDirs;

  try {
    projectDirs =
      await fs.readdir(projectsRoot, {
        withFileTypes: true
      });
  } catch (error) {
    if (error?.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const videos = [];

  for (const projectDir of projectDirs) {
    if (
      !projectDir.isDirectory() ||
      !PROJECT_ID_PATTERN.test(projectDir.name)
    ) {
      continue;
    }

    try {
      const raw =
        await fs.readFile(
          path.join(
            projectsRoot,
            projectDir.name,
            "project.json"
          ),
          "utf8"
        );

      const project =
        JSON.parse(raw);

      if (
        project?.id !== projectDir.name ||
        project?.ownerId !== ownerId ||
        project?.status !== "video_ready"
      ) {
        continue;
      }

      const readyAt =
        Date.parse(project.video?.readyAt);

      const expiresAt =
        Date.parse(project.video?.expiresAt);

      if (
        !Number.isFinite(readyAt) ||
        !Number.isFinite(expiresAt) ||
        expiresAt <= now
      ) {
        continue;
      }

      videos.push({
        project,
        readyAt,
        expiresAt
      });
    } catch (error) {
      console.warn(
        `[cleanup] Skipping recoverable-video candidate ${projectDir.name}:`,
        error?.message ?? error
      );
    }
  }

  videos.sort(
    (a, b) =>
      b.readyAt - a.readyAt
  );

  return videos;
}

export async function countPaidRecoverableVideos(
  projectRoot,
  ownerId,
  {
    now = Date.now()
  } = {}
) {
  const videos =
    await listRecoverableVideos(
      projectRoot,
      ownerId,
      { now }
    );

  return videos.length;
}
export async function canStorePaidRecoverableVideo(
  projectRoot,
  ownerId,
  {
    limit = PAID_RECOVERABLE_VIDEO_LIMIT,
    now = Date.now()
  } = {}
) {
  const count =
    await countPaidRecoverableVideos(
      projectRoot,
      ownerId,
      { now }
    );

  return {
    ok: count < limit,
    count,
    limit,
    remaining:
      Math.max(0, limit - count)
  };
}

export async function cleanupExpiredProjects(
  projectRoot,
  {
    deleteR2Objects = deleteProjectR2Objects,
    now = Date.now()
  } = {}
) {
  const projectsRoot =
    path.join(projectRoot, "projects");

  let deleted = 0;

  try {
    const projectDirs =
      await fs.readdir(projectsRoot, {
        withFileTypes: true
      });

    for (const projectDir of projectDirs) {
      if (
        !projectDir.isDirectory() ||
        !PROJECT_ID_PATTERN.test(projectDir.name)
      ) {
        continue;
      }

      const projectPath =
        path.join(
          projectsRoot,
          projectDir.name
        );

      try {
        const raw =
          await fs.readFile(
            path.join(
              projectPath,
              "project.json"
            ),
            "utf8"
          );

        const project = JSON.parse(raw);

        if (
          project?.id !== projectDir.name ||
          !project?.ownerId
        ) {
          continue;
        }

        const createdAt =
          Date.parse(project.createdAt);

        if (!Number.isFinite(createdAt)) {
          continue;
        }


        const age = now - createdAt;

        if (project.status === "video_ready") {
          const expiresAt =
            Date.parse(project.video?.expiresAt);

          if (
            Number.isFinite(expiresAt) &&
            now <= expiresAt
          ) {
            continue;
          }

          if (
            !Number.isFinite(expiresAt) &&
            age <= TEMP_PROJECT_RETENTION_MS
          ) {
            continue;
          }
        } else if (
          age <= TEMP_PROJECT_RETENTION_MS
        ) {
          continue;
        }

        if (
          !CLEANUP_ELIGIBLE_PROJECT_STATUSES.has(
            project.status
          )
        ) {
          console.log(
            `[cleanup] Skipping expired project ${project.id} ` +
            `because status ${String(project.status ?? "unknown")} ` +
            "is not safe to delete yet."
          );
          continue;
        }


        console.log(
          `[cleanup] Deleting expired temporary project ${project.id} ` +
          `(age ${Math.floor(age / 3600000)}h)`
        );

        await deleteR2Objects(
          project.ownerId,
          project.id
        );

        await fs.rm(projectPath, {
          recursive: true,
          force: true
        });

        deleted++;
      } catch (error) {
        if (error?.code !== "ENOENT") {
          console.error(
            `[cleanup] Project scan failed for ${projectDir.name}:`,
            error?.message ?? error
          );
        }
      }
    }
  } catch (error) {
    if (error?.code !== "ENOENT") {
      console.error(
        "[cleanup] scan failed",
        error?.message ?? error
      );
    }
  }

  if (deleted > 0) {
    console.log(
      `[cleanup] Done, deleted ${deleted} expired projects`
    );
  }

  return deleted;
}
