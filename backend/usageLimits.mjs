import fs from "node:fs/promises";
import path from "node:path";

const FREE_FINAL_VIDEOS =
  Number.parseInt(process.env.FREE_FINAL_VIDEOS || "2", 10);

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

const userUsageMutations = new Map();

async function withUserUsageMutationLock(
  projectRoot,
  userId,
  operation
) {
  const key =
    userFile(projectRoot, userId);

  const previous =
    userUsageMutations.get(key) ||
    Promise.resolve();

  let release;

  const current =
    new Promise((resolve) => {
      release = resolve;
    });

  userUsageMutations.set(
    key,
    current
  );

  await previous;

  try {
    return await operation();
  } finally {
    release();

    if (
      userUsageMutations.get(key) ===
      current
    ) {
      userUsageMutations.delete(key);
    }
  }
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

export const FREE_VIDEO_PLANS = 10;

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

      freeVideoPlanCount:
        Number(data.freeVideoPlanCount) || 0,

      planId:
        normalizePlanId(data.planId),

      monthlyCreditsUsed:
        Number(data.monthlyCreditsUsed) || 0,

      currentPeriodStart:
        data.currentPeriodStart || null,

      currentPeriodEnd:
        data.currentPeriodEnd || null,
      cancelAtPeriodEnd:
        Boolean(data.cancelAtPeriodEnd),

      createdAt:
        data.createdAt || null,

      updatedAt:
        data.updatedAt || null
    };
  } catch (e) {
    if (e.code === "ENOENT") {
      return {
        finalVideoCount: 0,
        freeVideoPlanCount: 0,
        planId: PLAN_IDS.FREE,
        monthlyCreditsUsed: 0,
        currentPeriodStart: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        createdAt: null,
        updatedAt: null
      };
    }

    throw e;
  }
}
export async function getStripeBillingState(
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
      stripeCustomerId:
        data.stripeCustomerId || null,

      stripeSubscriptionId:
        data.stripeSubscriptionId || null,

      stripeSubscriptionStatus:
        data.stripeSubscriptionStatus || null,

      stripeEntitlementVerifiedAt:
        data.stripeEntitlementVerifiedAt || null
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return {
        stripeCustomerId: null,
        stripeSubscriptionId: null,
        stripeSubscriptionStatus: null,
        stripeEntitlementVerifiedAt: null
      };
    }

    throw error;
  }
}

export async function updateStripeSubscription(
  projectRoot,
  userId,
  {
    planId,
    stripeCustomerId = null,
    stripeSubscriptionId = null,
    stripeSubscriptionStatus = null,
    currentPeriodStart = null,
    currentPeriodEnd = null,
    cancelAtPeriodEnd = false,
    stripeEntitlementVerifiedAt = null
  }
) {
  return withUserUsageMutationLock(
    projectRoot,
    userId,
    async () => {
  const normalizedPlanId =
    normalizePlanId(planId);

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
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  const now =
    new Date().toISOString();

  const oldPeriodStart =
    current.currentPeriodStart || null;

  const nextPeriodStart =
    currentPeriodStart || null;

  const periodChanged =
    Boolean(
      nextPeriodStart &&
      oldPeriodStart &&
      nextPeriodStart !== oldPeriodStart
    );

  const firstPaidPeriod =
    Boolean(
      normalizedPlanId !== PLAN_IDS.FREE &&
      nextPeriodStart &&
      !oldPeriodStart
    );

  const next = {
    ...current,

    finalVideoCount:
      Number(current.finalVideoCount) || 0,

    freeVideoPlanCount:
      Number(current.freeVideoPlanCount) || 0,

    planId:
      normalizedPlanId,

    monthlyCreditsUsed:
      periodChanged || firstPaidPeriod
        ? 0
        : Number(current.monthlyCreditsUsed) || 0,

    currentPeriodStart:
      nextPeriodStart,

    currentPeriodEnd:
      currentPeriodEnd || null,
    cancelAtPeriodEnd:
      Boolean(cancelAtPeriodEnd),

    stripeCustomerId:
      stripeCustomerId || null,

    stripeSubscriptionId:
      stripeSubscriptionId || null,

    stripeSubscriptionStatus:
      stripeSubscriptionStatus || null,

    stripeEntitlementVerifiedAt:
      stripeEntitlementVerifiedAt || null,

    createdAt:
      current.createdAt || now,

    updatedAt:
      now
  };

  await fs.writeFile(
    file,
    JSON.stringify(next, null, 2),
    "utf8"
  );

  return next;
    }
  );
}
export async function incrementFinalVideo(
  projectRoot,
  userId
) {
  return withUserUsageMutationLock(
    projectRoot,
    userId,
    async () => {
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
  );
}
export async function recordSuccessfulFinalVideo(
  projectRoot,
  userId,
  durationSeconds
) {
  return withUserUsageMutationLock(
    projectRoot,
    userId,
    async () => {
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

      const plan =
        getPlan(planId);

      const requestedDurationSeconds =
        Number(durationSeconds);

      if (
        !Number.isFinite(requestedDurationSeconds) ||
        requestedDurationSeconds < 20 ||
        requestedDurationSeconds > plan.maxVideoSeconds
      ) {
        const error =
          new Error(
            `Your ${plan.name} plan supports videos from 20 to ${plan.maxVideoSeconds} seconds.`
          );

        error.code =
          "VIDEO_DURATION_LIMIT_EXCEEDED";

        throw error;
      }

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
        if (
          next.finalVideoCount >=
          FREE_FINAL_VIDEOS
        ) {
          const error =
            new Error(
              `You have used your ${FREE_FINAL_VIDEOS} free videos.`
            );

          error.code =
            "FREE_VIDEO_LIMIT_REACHED";

          throw error;
        }

        next.finalVideoCount += 1;
      } else {
        creditCost =
          getVideoCreditCost(requestedDurationSeconds);

        const creditsRemaining =
          Math.max(
            0,
            plan.monthlyCredits -
              next.monthlyCreditsUsed
          );

        if (creditsRemaining <= 0) {
          const error =
            new Error(
              "Not enough credits to record this video."
            );

          error.code =
            "CREDIT_LIMIT_REACHED";

          throw error;
        }

        creditCost =
          Math.min(
            creditCost,
            creditsRemaining
          );

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
  );
}
export async function rollbackSuccessfulFinalVideo(
  projectRoot,
  userId,
  {
    planId,
    creditCost = 0
  } = {}
) {
  return withUserUsageMutationLock(
    projectRoot,
    userId,
    async () => {
      const dir = usersDir(projectRoot);

      await fs.mkdir(
        dir,
        { recursive: true }
      );

      const file =
        userFile(projectRoot, userId);

      const current =
        JSON.parse(
          await fs.readFile(
            file,
            "utf8"
          )
        );

      const recordedPlanId =
        normalizePlanId(planId);

      const currentPlanId =
        normalizePlanId(current.planId);

      if (currentPlanId !== recordedPlanId) {
        const error =
          new Error(
            "Final video accounting rollback plan no longer matches current usage."
          );

        error.code =
          "FINAL_VIDEO_ROLLBACK_PLAN_MISMATCH";

        throw error;
      }

      const now =
        new Date().toISOString();

      const next = {
        ...current,

        finalVideoCount:
          Number(current.finalVideoCount) || 0,

        monthlyCreditsUsed:
          Number(current.monthlyCreditsUsed) || 0,

        updatedAt:
          now
      };

      if (recordedPlanId === PLAN_IDS.FREE) {
        next.finalVideoCount =
          Math.max(
            0,
            next.finalVideoCount - 1
          );
      } else {
        const rollbackCreditCost =
          Math.max(
            0,
            Number(creditCost) || 0
          );

        next.monthlyCreditsUsed =
          Math.max(
            0,
            next.monthlyCreditsUsed -
              rollbackCreditCost
          );
      }

      await fs.writeFile(
        file,
        JSON.stringify(next, null, 2),
        "utf8"
      );

      return next;
    }
  );
}
export function canGenerateVideoPlan(usage) {
  const planId =
    normalizePlanId(usage?.planId);

  if (planId !== PLAN_IDS.FREE) {
    return {
      ok: true,
      planId
    };
  }

  const freeVideoPlanCount =
    Number(usage?.freeVideoPlanCount) || 0;

  if (
    freeVideoPlanCount >=
    FREE_VIDEO_PLANS
  ) {
    return {
      ok: false,
      code:
        "FREE_VIDEO_PLAN_LIMIT_REACHED",
      error:
        `You have used your ${FREE_VIDEO_PLANS} free Video Plans. Upgrade to Starter or Pro to create more.`,
      status: 403
    };
  }

  return {
    ok: true,
    planId,
    freeVideoPlanCount
  };
}

export async function recordSuccessfulVideoPlan(
  projectRoot,
  userId
) {
  return withUserUsageMutationLock(
    projectRoot,
    userId,
    async () => {
  const usage =
    await getUserUsage(
      projectRoot,
      userId
    );

  const entitlement =
    canGenerateVideoPlan(usage);

  if (!entitlement.ok) {
    const error =
      new Error(entitlement.error);

    error.code =
      entitlement.code;

    throw error;
  }

  if (
    normalizePlanId(usage.planId) !==
    PLAN_IDS.FREE
  ) {
    return usage;
  }

  const dir =
    usersDir(projectRoot);

  await fs.mkdir(
    dir,
    { recursive: true }
  );

  const file =
    userFile(
      projectRoot,
      userId
    );

  let current = {};

  try {
    current = JSON.parse(
      await fs.readFile(
        file,
        "utf8"
      )
    );
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  const now =
    new Date().toISOString();

  const next = {
    ...current,

    finalVideoCount:
      Number(current.finalVideoCount) || 0,

    freeVideoPlanCount:
      (Number(
        current.freeVideoPlanCount
      ) || 0) + 1,

    planId:
      normalizePlanId(current.planId),

    monthlyCreditsUsed:
      Number(
        current.monthlyCreditsUsed
      ) || 0,

    createdAt:
      current.createdAt || now,

    updatedAt:
      now
  };

  await fs.writeFile(
    file,
    JSON.stringify(next, null, 2),
    "utf8"
  );

  return next;
    }
  );
}
export function canGenerateFinalVideo(
  usage,
  project,
  durationSeconds = 30
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

  const requestedDurationSeconds =
    Number(durationSeconds);

  if (
    !Number.isFinite(requestedDurationSeconds) ||
    requestedDurationSeconds < 20 ||
    requestedDurationSeconds > plan.maxVideoSeconds
  ) {
    return {
      ok: false,
      code: "VIDEO_DURATION_LIMIT_EXCEEDED",
      error:
        `Your ${plan.name} plan supports videos from 20 to ${plan.maxVideoSeconds} seconds.`,
      status: 403
    };
  }

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

  const creditCost =
    getVideoCreditCost(durationSeconds);

  if (
    creditsRemaining <= 0
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
      Math.min(
        creditCost,
        creditsRemaining
      )
  };
}

export const LIMITS = Object.freeze({
  FREE_FINAL_VIDEOS,
  FREE_VIDEO_PLANS,

  FREE_MAX_VIDEO_SECONDS:
    PLANS[PLAN_IDS.FREE].maxVideoSeconds,

  PAID_MAX_VIDEO_SECONDS:
    PLANS[PLAN_IDS.PRO].maxVideoSeconds
});
