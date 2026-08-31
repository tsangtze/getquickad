import fs from "node:fs/promises";
import path from "node:path";

const FREE_FINAL_VIDEOS =
  Number.parseInt(process.env.FREE_FINAL_VIDEOS || "2", 10);

const MAX_PROJECTS = 10;

export const PLAN_IDS = Object.freeze({
  FREE: "free",
  STARTER: "starter",
  PRO: "pro"
});

export const PLANS = Object.freeze({
  [PLAN_IDS.FREE]: Object.freeze({
    id: PLAN_IDS.FREE,
    name: "Free",
    priceMonthlyUsd: 0,
    monthlyCredits: 0,
    freeFinalVideos: FREE_FINAL_VIDEOS,
    maxVideoSeconds: 30
  }),

  [PLAN_IDS.STARTER]: Object.freeze({
    id: PLAN_IDS.STARTER,
    name: "Starter",
    priceMonthlyUsd: 9,
    monthlyCredits: 100,
    freeFinalVideos: 0,
    maxVideoSeconds: 60
  }),

  [PLAN_IDS.PRO]: Object.freeze({
    id: PLAN_IDS.PRO,
    name: "Pro",
    priceMonthlyUsd: 29,
    monthlyCredits: 400,
    freeFinalVideos: 0,
    maxVideoSeconds: 60
  })
});

export const CREDIT_COSTS = Object.freeze({
  UP_TO_30_SECONDS: 10,
  UP_TO_45_SECONDS: 15,
  UP_TO_60_SECONDS: 20
});

function usersDir(projectRoot) {
  return path.join(projectRoot, "users");
}

function userFile(projectRoot, userId) {
  const safeId =
    String(userId).replace(/[^a-zA-Z0-9-]/g, "_");

  return path.join(
    usersDir(projectRoot),
    safeId + ".json"
  );
}

function normalizePlanId(value) {
  const planId =
    String(value || PLAN_IDS.FREE).toLowerCase();

  return PLANS[planId]
    ? planId
    : PLAN_IDS.FREE;
}

export function getPlan(planId) {
  return PLANS[normalizePlanId(planId)];
}

export function getVideoCreditCost(durationSeconds) {
  const seconds = Number(durationSeconds);

  if (!Number.isFinite(seconds) || seconds <= 30) {
    return CREDIT_COSTS.UP_TO_30_SECONDS;
  }

  if (seconds <= 45) {
    return CREDIT_COSTS.UP_TO_45_SECONDS;
  }

  return CREDIT_COSTS.UP_TO_60_SECONDS;
}

export async function getUserUsage(
  projectRoot,
  userId
) {
  try {
    const raw = await fs.readFile(
      userFile(projectRoot, userId),
      "utf8"
    );

    const data = JSON.parse(raw);

    return {
      finalVideoCount:
        Number(data.finalVideoCount) || 0,

      planId:
        normalizePlanId(data.planId),

      monthlyCreditsUsed:
        Number(data.monthlyCreditsUsed) || 0,

      currentPeriodStart:
        data.currentPeriodStart || null,

      currentPeriodEnd:
        data.currentPeriodEnd || null,

      createdAt:
        data.createdAt || null,

      updatedAt:
        data.updatedAt || null
    };
  } catch (e) {
    if (e.code === "ENOENT") {
      return {
        finalVideoCount: 0,
        planId: PLAN_IDS.FREE,
        monthlyCreditsUsed: 0,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        createdAt: null,
        updatedAt: null
      };
    }

    throw e;
  }
}

export async function incrementFinalVideo(
  projectRoot,
  userId
) {
  const dir = usersDir(projectRoot);
  await fs.mkdir(dir, { recursive: true });

  const file = userFile(projectRoot, userId);

  let current = {
    finalVideoCount: 0,
    planId: PLAN_IDS.FREE,
    monthlyCreditsUsed: 0
  };

  try {
    current = JSON.parse(
      await fs.readFile(file, "utf8")
    );
  } catch {}

  const next = {
    ...current,

    finalVideoCount:
      (Number(current.finalVideoCount) || 0) + 1,

    planId:
      normalizePlanId(current.planId),

    monthlyCreditsUsed:
      Number(current.monthlyCreditsUsed) || 0,

    currentPeriodStart:
      current.currentPeriodStart || null,

    currentPeriodEnd:
      current.currentPeriodEnd || null,

    createdAt:
      current.createdAt ||
      new Date().toISOString(),

    updatedAt:
      new Date().toISOString()
  };

  await fs.writeFile(
    file,
    JSON.stringify(next, null, 2),
    "utf8"
  );

  return next;
}

export async function recordSuccessfulFinalVideo(
  projectRoot,
  userId,
  durationSeconds
) {
  const dir = usersDir(projectRoot);
  await fs.mkdir(dir, { recursive: true });

  const file = userFile(projectRoot, userId);

  let current = {
    finalVideoCount: 0,
    planId: PLAN_IDS.FREE,
    monthlyCreditsUsed: 0,
    currentPeriodStart: null,
    currentPeriodEnd: null
  };

  try {
    current = JSON.parse(
      await fs.readFile(file, "utf8")
    );
  } catch (e) {
    if (e.code !== "ENOENT") {
      throw e;
    }
  }

  const planId =
    normalizePlanId(current.planId);

  const now =
    new Date().toISOString();

  const next = {
    ...current,

    finalVideoCount:
      Number(current.finalVideoCount) || 0,

    planId,

    monthlyCreditsUsed:
      Number(current.monthlyCreditsUsed) || 0,

    currentPeriodStart:
      current.currentPeriodStart || null,

    currentPeriodEnd:
      current.currentPeriodEnd || null,

    createdAt:
      current.createdAt || now,

    updatedAt:
      now
  };

  let creditCost = 0;

  if (planId === PLAN_IDS.FREE) {
    next.finalVideoCount += 1;
  } else {
    creditCost =
      getVideoCreditCost(durationSeconds);

    const plan =
      getPlan(planId);

    const creditsRemaining =
      Math.max(
        0,
        plan.monthlyCredits -
          next.monthlyCreditsUsed
      );

    if (creditCost > creditsRemaining) {
      const error =
        new Error(
          "Not enough credits to record this video."
        );

      error.code =
        "CREDIT_LIMIT_REACHED";

      throw error;
    }

    next.monthlyCreditsUsed +=
      creditCost;
  }

  await fs.writeFile(
    file,
    JSON.stringify(next, null, 2),
    "utf8"
  );

  return {
    usage: next,
    planId,
    creditCost
  };
}
export async function countUserProjects(
  projectRoot,
  userId
) {
  const projectsDirectory =
    path.join(projectRoot, "projects");

  try {
    const entries = await fs.readdir(
      projectsDirectory,
      { withFileTypes: true }
    );

    let count = 0;

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          entry.name
        )
      ) {
        continue;
      }

      try {
        const proj = JSON.parse(
          await fs.readFile(
            path.join(
              projectsDirectory,
              entry.name,
              "project.json"
            ),
            "utf8"
          )
        );

        if (
          proj.ownerId === userId &&
          proj.id === entry.name
        ) {
          count++;
        }
      } catch {}
    }

    return count;
  } catch (e) {
    if (e.code === "ENOENT") return 0;
    throw e;
  }
}

export function canCreateProject(projectCount) {
  if (projectCount >= MAX_PROJECTS) {
    return {
      ok: false,
      code: "PROJECT_LIMIT_REACHED",
      error:
        "You have reached your limit of 10 saved projects. Delete an old project to free up space and create a new one.",
      status: 403
    };
  }

  return { ok: true };
}

export function canGenerateFinalVideo(
  usage,
  project
) {
  const alreadyFinal =
    project.status === "video_ready" ||
    !!project.video;

  if (alreadyFinal) {
    return {
      ok: true,
      freeRerender: true
    };
  }

  const planId =
    normalizePlanId(usage?.planId);

  const plan =
    getPlan(planId);

  if (planId === PLAN_IDS.FREE) {
    if (
      Number(usage?.finalVideoCount) >=
      FREE_FINAL_VIDEOS
    ) {
      return {
        ok: false,
        code: "FREE_VIDEO_LIMIT_REACHED",
        error:
          `You have used your ${FREE_FINAL_VIDEOS} free videos. Upgrade to create more videos. Your existing videos and previews remain available.`,
        status: 403
      };
    }

    return {
      ok: true,
      freeRerender: false,
      planId,
      creditCost: 0
    };
  }

  const creditsUsed =
    Number(usage?.monthlyCreditsUsed) || 0;

  const creditsRemaining =
    Math.max(
      0,
      plan.monthlyCredits - creditsUsed
    );

  if (
    creditsRemaining <
    CREDIT_COSTS.UP_TO_30_SECONDS
  ) {
    return {
      ok: false,
      code: "CREDIT_LIMIT_REACHED",
      error:
        "You do not have enough video credits remaining for another video.",
      status: 403
    };
  }

  return {
    ok: true,
    freeRerender: false,
    planId,
    creditCost:
      CREDIT_COSTS.UP_TO_30_SECONDS
  };
}

export const LIMITS = Object.freeze({
  FREE_FINAL_VIDEOS,
  MAX_PROJECTS,

  FREE_MAX_VIDEO_SECONDS:
    PLANS[PLAN_IDS.FREE].maxVideoSeconds,

  PAID_MAX_VIDEO_SECONDS:
    PLANS[PLAN_IDS.PRO].maxVideoSeconds
});
