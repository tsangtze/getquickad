import fs from "node:fs/promises";
import path from "node:path";

import {
  deleteProjectR2Objects
} from "./cleanup.mjs";

import {
  beginUserAccountDeletion,
  endUserAccountDeletion
} from "./accountOperationGuard.mjs";

import {
  createAuthAdminClient,
  deleteAuthUserForAccountDeletion
} from "./authService.mjs";

import {
  cancelStripeSubscriptionForAccountDeletion
} from "./stripeService.mjs";

import {
  deleteUserUsageForAccountDeletion,
  getStripeBillingState,
  markUserAccountDeleted
} from "./usageLimits.mjs";

const PROJECT_ID_PATTERN =
  /^[0-9a-f-]{36}$/i;

export async function deleteUserProjectsForAccountDeletion(
  projectRoot,
  userId,
  {
    deleteR2Objects =
      deleteProjectR2Objects
  } = {}
) {
  const normalizedUserId =
    String(userId ?? "").trim();

  if (!normalizedUserId) {
    throw new Error(
      "A user ID is required for account project deletion."
    );
  }

  const projectsRoot =
    path.join(
      projectRoot,
      "projects"
    );

  let projectDirs;

  try {
    projectDirs =
      await fs.readdir(
        projectsRoot,
        {
          withFileTypes: true
        }
      );
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        deletedProjects: 0
      };
    }

    throw error;
  }

  let deletedProjects = 0;

  for (const projectDir of projectDirs) {
    if (
      !projectDir.isDirectory() ||
      !PROJECT_ID_PATTERN.test(
        projectDir.name
      )
    ) {
      continue;
    }

    const projectPath =
      path.join(
        projectsRoot,
        projectDir.name
      );

    let project;

    try {
      const raw =
        await fs.readFile(
          path.join(
            projectPath,
            "project.json"
          ),
          "utf8"
        );

      project =
        JSON.parse(raw);
    } catch (error) {
      if (error?.code === "ENOENT") {
        continue;
      }

      throw error;
    }

    if (
      project?.id !== projectDir.name ||
      project?.ownerId !== normalizedUserId
    ) {
      continue;
    }

    await deleteR2Objects(
      normalizedUserId,
      projectDir.name
    );

    await fs.rm(
      projectPath,
      {
        recursive: true,
        force: true
      }
    );

    deletedProjects++;
  }

  return {
    deletedProjects
  };
}

export async function deleteUserAccount(
  projectRoot,
  userId,
  {
    beginDeletion =
      beginUserAccountDeletion,
    endDeletion =
      endUserAccountDeletion,
    createAuthAdmin =
      createAuthAdminClient,
    readBillingState =
      getStripeBillingState,
    cancelSubscription =
      cancelStripeSubscriptionForAccountDeletion,
    markDeleted =
      markUserAccountDeleted,
    deleteProjects =
      deleteUserProjectsForAccountDeletion,
    deleteUsage =
      deleteUserUsageForAccountDeletion,
    deleteAuthUser =
      deleteAuthUserForAccountDeletion
  } = {}
) {
  const normalizedUserId =
    String(userId ?? "").trim();

  if (!normalizedUserId) {
    const error =
      new Error(
        "A user ID is required for account deletion."
      );

    error.code =
      "ACCOUNT_DELETE_USER_REQUIRED";

    throw error;
  }

  const claimed =
    beginDeletion(
      normalizedUserId
    );

  if (!claimed) {
    const error =
      new Error(
        "The account is busy. Please wait until current processing finishes."
      );

    error.code =
      "ACCOUNT_DELETE_BUSY";

    throw error;
  }

  try {
    const authAdmin =
      createAuthAdmin();

    const billingState =
      await readBillingState(
        projectRoot,
        normalizedUserId
      );

    const stripeResult =
      await cancelSubscription(
        billingState
          ?.stripeSubscriptionId ??
          null
      );

    await markDeleted(
      projectRoot,
      normalizedUserId
    );

    const projectResult =
      await deleteProjects(
        projectRoot,
        normalizedUserId
      );

    await deleteUsage(
      projectRoot,
      normalizedUserId
    );

    await deleteAuthUser(
      normalizedUserId,
      {
        deleteUser:
          (id) =>
            authAdmin.auth.admin.deleteUser(id)
      }
    );

    return {
      deleted: true,
      deletedProjects:
        Number(
          projectResult
            ?.deletedProjects
        ) || 0,
      subscriptionCanceled:
        Boolean(
          stripeResult?.canceled
        ),
      subscriptionMissing:
        Boolean(
          stripeResult?.missing
        )
    };
  } finally {
    endDeletion(
      normalizedUserId
    );
  }
}
