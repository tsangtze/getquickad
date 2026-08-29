
import path from "node:path";
import fs from "node:fs/promises";
import { r2Client, R2_BUCKET } from "./r2Client.mjs";
import { DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

export const RETENTION_DAYS = 7;
export const RETENTION_MS = RETENTION_DAYS * 24 * 60 * 60 * 1000;

export async function cleanupExpiredProjects(projectsRoot) {
  const now = Date.now();
  let deleted = 0;
  try {
    const userDirs = await fs.readdir(projectsRoot, { withFileTypes: true });
    for (const userDir of userDirs) {
      if (!userDir.isDirectory()) continue;
      const userPath = path.join(projectsRoot, userDir.name);
      const projectDirs = await fs.readdir(userPath, { withFileTypes: true });
      for (const projDir of projectDirs) {
        if (!projDir.isDirectory()) continue;
        const projPath = path.join(userPath, projDir.name);
        const jsonPath = path.join(projPath, "project.json");
        try {
          const raw = await fs.readFile(jsonPath, "utf8");
          const proj = JSON.parse(raw);
          const createdAt = new Date(proj.createdAt || proj.updatedAt || 0).getTime();
          if (!createdAt) continue;
          const age = now - createdAt;
          if (age > RETENTION_MS) {
            console.log(`[cleanup] Deleting expired project ${projDir.name} (age ${Math.floor(age/86400000)}d)`);
            // Delete R2 objects for this project
            try {
              const prefix = `videos/${userDir.name}/${projDir.name}/`;
              const list = await r2Client.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: prefix }));
              if (list.Contents) {
                for (const obj of list.Contents) {
                  await r2Client.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: obj.Key }));
                  console.log(`[cleanup] Deleted R2 ${obj.Key}`);
                }
              }
            } catch (r2Err) {
              console.error("[cleanup] R2 delete failed", r2Err.message);
            }
            // Delete local folder
            await fs.rm(projPath, { recursive: true, force: true });
            deleted++;
          }
        } catch {}
      }
    }
  } catch (e) {
    console.error("[cleanup] scan failed", e.message);
  }
  if (deleted > 0) console.log(`[cleanup] Done, deleted ${deleted} expired projects`);
  return deleted;
}
