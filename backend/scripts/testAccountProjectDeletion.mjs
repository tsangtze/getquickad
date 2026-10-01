import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  deleteUserProjectsForAccountDeletion
} from "../accountDeletionService.mjs";

const userId =
  "account-delete-user";

const otherUserId =
  "other-user";

const ownedProjectId =
  "11111111-1111-1111-1111-111111111111";

const otherProjectId =
  "22222222-2222-2222-2222-222222222222";

const malformedProjectId =
  "33333333-3333-3333-3333-333333333333";

const invalidDirectory =
  "not-a-project";

const root =
  await fs.mkdtemp(
    path.join(
      os.tmpdir(),
      "pix2vid-account-project-delete-"
    )
  );

const projectsRoot =
  path.join(
    root,
    "projects"
  );

await fs.mkdir(
  projectsRoot,
  {
    recursive: true
  }
);

async function writeProject(
  projectId,
  ownerId
) {
  const projectPath =
    path.join(
      projectsRoot,
      projectId
    );

  await fs.mkdir(
    projectPath,
    {
      recursive: true
    }
  );

  await fs.writeFile(
    path.join(
      projectPath,
      "project.json"
    ),
    JSON.stringify(
      {
        id: projectId,
        ownerId
      },
      null,
      2
    ),
    "utf8"
  );

  await fs.writeFile(
    path.join(
      projectPath,
      "asset.txt"
    ),
    "test",
    "utf8"
  );
}

await writeProject(
  ownedProjectId,
  userId
);

await writeProject(
  otherProjectId,
  otherUserId
);

await fs.mkdir(
  path.join(
    projectsRoot,
    malformedProjectId
  ),
  {
    recursive: true
  }
);

await fs.writeFile(
  path.join(
    projectsRoot,
    malformedProjectId,
    "project.json"
  ),
  JSON.stringify(
    {
      id: "wrong-project-id",
      ownerId: userId
    }
  ),
  "utf8"
);

await fs.mkdir(
  path.join(
    projectsRoot,
    invalidDirectory
  ),
  {
    recursive: true
  }
);

const deletedR2 =
  [];

const result =
  await deleteUserProjectsForAccountDeletion(
    root,
    userId,
    {
      deleteR2Objects:
        async (
          ownerId,
          projectId
        ) => {
          deletedR2.push({
            ownerId,
            projectId
          });
        }
    }
  );

assert.equal(
  result.deletedProjects,
  1
);

await assert.rejects(
  fs.access(
    path.join(
      projectsRoot,
      ownedProjectId
    )
  ),
  {
    code: "ENOENT"
  }
);

await fs.access(
  path.join(
    projectsRoot,
    otherProjectId
  )
);

await fs.access(
  path.join(
    projectsRoot,
    malformedProjectId
  )
);

await fs.access(
  path.join(
    projectsRoot,
    invalidDirectory
  )
);

assert.deepEqual(
  deletedR2,
  [
    {
      ownerId: userId,
      projectId:
        ownedProjectId
    }
  ]
);

console.log(
  "PASS: Owned project deleted"
);

console.log(
  "PASS: Other user's project preserved"
);

console.log(
  "PASS: Invalid project metadata preserved"
);

console.log(
  "PASS: Non-project directory preserved"
);

console.log(
  "PASS: R2 deletion scoped to owned project"
);

const repeated =
  await deleteUserProjectsForAccountDeletion(
    root,
    userId,
    {
      deleteR2Objects:
        async () => {
          throw new Error(
            "R2 deletion should not run twice."
          );
        }
    }
  );

assert.equal(
  repeated.deletedProjects,
  0
);

console.log(
  "PASS: Repeated project deletion is safe"
);

await fs.rm(
  root,
  {
    recursive: true,
    force: true
  }
);

console.log(
  "ALL ACCOUNT PROJECT DELETION TESTS PASSED."
);