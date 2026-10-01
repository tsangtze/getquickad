import fs from "node:fs/promises";
import path from "node:path";

import {
  deleteProjectR2Objects
} from "./cleanup.mjs";

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