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

        if (age <= TEMP_PROJECT_RETENTION_MS) {
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
