import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

import {
  PAID_RECOVERABLE_VIDEO_LIMIT,
  countPaidRecoverableVideos,
  canStorePaidRecoverableVideo,
  listRecoverableVideos
} from "../cleanup.mjs";

const now =
  Date.parse("2026-09-09T12:00:00.000Z");

const root =
  await fs.mkdtemp(
    path.join(
      os.tmpdir(),
      "quickad-paid-recovery-cap-"
    )
  );

const projectsRoot =
  path.join(root, "projects");

await fs.mkdir(
  projectsRoot,
  { recursive: true }
);

async function createVideoProject({
  owner,
  readyHoursAgo,
  expiresHoursFromNow = 6,
  status = "video_ready",
  includeRecoveryMetadata = true
}) {
  const id =
    crypto.randomUUID();

  const directory =
    path.join(projectsRoot, id);

  await fs.mkdir(
    directory,
    { recursive: true }
  );

  const project = {
    id,
    ownerId: owner,
    status,
    createdAt:
      new Date(
        now -
          readyHoursAgo *
            60 * 60 * 1000
      ).toISOString()
  };

  if (status === "video_ready") {
    project.video = {};

    if (includeRecoveryMetadata) {
      project.video.readyAt =
        new Date(
          now -
            readyHoursAgo *
              60 * 60 * 1000
        ).toISOString();

      project.video.expiresAt =
        new Date(
          now +
            expiresHoursFromNow *
              60 * 60 * 1000
        ).toISOString();
    }
  }

  await fs.writeFile(
    path.join(
      directory,
      "project.json"
    ),
    JSON.stringify(
      project,
      null,
      2
    ),
    "utf8"
  );

  return {
    id,
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

const ownerId =
  "paid-owner";

const ownerVideos = [];

for (
  let i = 0;
  i < PAID_RECOVERABLE_VIDEO_LIMIT;
  i++
) {
  ownerVideos.push(
    await createVideoProject({
      owner: ownerId,
      readyHoursAgo: 20 - i
    })
  );
}

const otherOwnerVideo =
  await createVideoProject({
    owner: "other-owner",
    readyHoursAgo: 5
  });

const expiredOwnerVideo =
  await createVideoProject({
    owner: ownerId,
    readyHoursAgo: 30,
    expiresHoursFromNow: -1
  });

const unfinishedOwnerProject =
  await createVideoProject({
    owner: ownerId,
    readyHoursAgo: 2,
    status: "rendering_video"
  });

const legacyOwnerVideo =
  await createVideoProject({
    owner: ownerId,
    readyHoursAgo: 25,
    includeRecoveryMetadata: false
  });

const count =
  await countPaidRecoverableVideos(
    root,
    ownerId,
    { now }
  );

assert.equal(
  count,
  10,
  "Exactly 10 current recoverable videos must count toward the paid limit."
);

const fullCapacity =
  await canStorePaidRecoverableVideo(
    root,
    ownerId,
    { now }
  );

assert.deepEqual(
  fullCapacity,
  {
    ok: false,
    count: 10,
    limit: 10,
    remaining: 0
  },
  "Paid user at 10/10 must be blocked."
);

for (const video of ownerVideos) {
  assert.equal(
    await exists(video.directory),
    true,
    "Capacity check must never automatically delete a user's video."
  );
}

assert.equal(
  await exists(otherOwnerVideo.directory),
  true
);

assert.equal(
  await exists(expiredOwnerVideo.directory),
  true
);

assert.equal(
  await exists(unfinishedOwnerProject.directory),
  true
);

assert.equal(
  await exists(legacyOwnerVideo.directory),
  true
);

await fs.rm(
  ownerVideos[4].directory,
  {
    recursive: true,
    force: true
  }
);

const afterChosenDelete =
  await canStorePaidRecoverableVideo(
    root,
    ownerId,
    { now }
  );

assert.deepEqual(
  afterChosenDelete,
  {
    ok: true,
    count: 9,
    limit: 10,
    remaining: 1
  },
  "Deleting one user-selected video must immediately free one slot."
);

for (
  let i = 0;
  i < ownerVideos.length;
  i++
) {
  if (i === 4) {
    assert.equal(
      await exists(ownerVideos[i].directory),
      false
    );
  } else {
    assert.equal(
      await exists(ownerVideos[i].directory),
      true,
      "Only the video chosen by the user may be removed."
    );
  }
}

  // Version 1.1.8.39: My Videos must use the same recovery
  // definition as the paid storage cap.
  const recoverableVideos =
    await listRecoverableVideos(
      root,
      ownerId,
      { now }
    );

  assert.equal(
    recoverableVideos.length,
    9,
    "Expected exactly 9 recoverable videos after the selected video was manually deleted."
  );

  assert.ok(
    recoverableVideos.every(
      ({ project, readyAt, expiresAt }) =>
        project.ownerId === ownerId &&
        project.status === "video_ready" &&
        Number.isFinite(readyAt) &&
        Number.isFinite(expiresAt) &&
        expiresAt > now
    ),
    "Every listed video must belong to the requested owner and remain inside its recovery window."
  );


  assert.ok(
    recoverableVideos.every(
      ({ expiresAt }) =>
        expiresAt > now
    ),
    "Expired videos must never appear in My Videos."
  );

  for (
    let index = 1;
    index < recoverableVideos.length;
    index += 1
  ) {
    assert.ok(
      recoverableVideos[index - 1].readyAt >=
        recoverableVideos[index].readyAt,
      "Recoverable videos must be sorted newest first."
    );
  }

  console.log(
    "PASS: Version 1.1.8.39 recoverable video list tests"
  );

await fs.rm(
  root,
  {
    recursive: true,
    force: true
  }
);



console.log(
  "PASS: Version 1.1.8.38 non-destructive paid recoverable video limit tests"
);
