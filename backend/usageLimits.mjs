import fs from "node:fs/promises";
import path from "node:path";
const FREE_FINAL_VIDEOS = 2;
const MAX_PROJECTS = 10;
function usersDir(projectRoot) { return path.join(projectRoot, "users"); }
function userFile(projectRoot, userId) {
  const safeId = String(userId).replace(/[^a-zA-Z0-9-]/g, "_");
  return path.join(usersDir(projectRoot), safeId + ".json");
}
export async function getUserUsage(projectRoot, userId) {
  try {
    const raw = await fs.readFile(userFile(projectRoot, userId), "utf8");
    const data = JSON.parse(raw);
    return { finalVideoCount: Number(data.finalVideoCount) || 0, createdAt: data.createdAt || null, updatedAt: data.updatedAt || null };
  } catch (e) {
    if (e.code === "ENOENT") return { finalVideoCount: 0, createdAt: null, updatedAt: null };
    throw e;
  }
}
export async function incrementFinalVideo(projectRoot, userId) {
  const dir = usersDir(projectRoot);
  await fs.mkdir(dir, { recursive: true });
  const file = userFile(projectRoot, userId);
  let current = { finalVideoCount: 0 };
  try { current = JSON.parse(await fs.readFile(file, "utf8")); } catch {}
  const next = { finalVideoCount: (Number(current.finalVideoCount) || 0) + 1, createdAt: current.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
  await fs.writeFile(file, JSON.stringify(next, null, 2), "utf8");
  return next;
}
export async function countUserProjects(projectRoot, userId) {
  const projectsDirectory = path.join(projectRoot, "projects");
  try {
    const entries = await fs.readdir(projectsDirectory, { withFileTypes: true });
    let count = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry.name)) continue;
      try {
        const proj = JSON.parse(await fs.readFile(path.join(projectsDirectory, entry.name, "project.json"), "utf8"));
        if (proj.ownerId === userId && proj.id === entry.name) count++;
      } catch {}
    }
    return count;
  } catch (e) { if (e.code === "ENOENT") return 0; throw e; }
}
export function canCreateProject(projectCount) {
  if (projectCount >= MAX_PROJECTS) {
    return { ok: false, code: "PROJECT_LIMIT_REACHED", error: "You have reached your limit of 10 saved projects. Delete an old project to free up space and create a new one.", status: 403 };
  }
  return { ok: true };
}
export function canGenerateFinalVideo(usage, project) {
  const alreadyFinal = project.status === "video_ready" || !!project.video;
  if (alreadyFinal) return { ok: true, freeRerender: true };
  if (usage.finalVideoCount >= FREE_FINAL_VIDEOS) {
    return { ok: false, code: "FREE_VIDEO_LIMIT_REACHED", error: "You have used your 2 free videos. Upgrade to create more videos. Your existing videos and previews remain available.", status: 403 };
  }
  return { ok: true, freeRerender: false };
}
export const LIMITS = { FREE_FINAL_VIDEOS, MAX_PROJECTS };
