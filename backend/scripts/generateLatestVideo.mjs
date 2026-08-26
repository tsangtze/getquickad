import {
  loadEnvFile
} from "node:process";
import fs from "node:fs/promises";
import path from "node:path";
import {
  renderVideo
} from "../videoRenderer.mjs";

loadEnvFile(
  path.resolve(".env")
);

const projectsRoot =
  path.resolve("projects");

const entries =
  await fs.readdir(
    projectsRoot,
    {
      withFileTypes: true
    }
  );

const candidates = [];

for (const entry of entries) {
  if (!entry.isDirectory()) {
    continue;
  }

  const directory = path.join(
    projectsRoot,
    entry.name
  );

  const requiredFiles = [
    "project.json",
    "storyboard.json",
    "narration.mp3"
  ];

  const filesExist =
    await Promise.all(
      requiredFiles.map(
        async (fileName) => {
          try {
            await fs.access(
              path.join(
                directory,
                fileName
              )
            );

            return true;
          } catch {
            return false;
          }
        }
      )
    );

  if (!filesExist.every(Boolean)) {
    continue;
  }

  const stats =
    await fs.stat(directory);

  candidates.push({
    directory,
    modifiedAt:
      stats.mtimeMs
  });
}

candidates.sort(
  (left, right) =>
    right.modifiedAt -
    left.modifiedAt
);

const latestProject =
  candidates[0];

if (!latestProject) {
  throw new Error(
    "No project with storyboard and narration was found."
  );
}

const projectPath = path.join(
  latestProject.directory,
  "project.json"
);

const storyboardPath = path.join(
  latestProject.directory,
  "storyboard.json"
);

const project = JSON.parse(
  await fs.readFile(
    projectPath,
    "utf8"
  )
);

const storyboardRecord = JSON.parse(
  await fs.readFile(
    storyboardPath,
    "utf8"
  )
);

console.log(
  `Rendering project ${project.id.slice(0, 8)}...`
);

console.log(
  `Title: ${storyboardRecord.storyboard.title}`
);

console.log(
  `Scenes: ${storyboardRecord.storyboard.scenes.length}`
);

console.log(
  `Target duration: ${storyboardRecord.storyboard.totalDurationSeconds} seconds`
);

project.status =
  "rendering_video";

await fs.writeFile(
  projectPath,
  JSON.stringify(
    project,
    null,
    2
  ),
  "utf8"
);

try {
  const video =
    await renderVideo({
      project,
      storyboard:
        storyboardRecord.storyboard,
      projectDirectory:
        latestProject.directory
    });

  const videoRecord = {
    projectId:
      project.id,
    video
  };

  await fs.writeFile(
    path.join(
      latestProject.directory,
      "video.json"
    ),
    JSON.stringify(
      videoRecord,
      null,
      2
    ),
    "utf8"
  );

  project.status =
    "video_ready";

  project.video =
    video;

  await fs.writeFile(
    projectPath,
    JSON.stringify(
      project,
      null,
      2
    ),
    "utf8"
  );

  console.log(
    "PASS: Vertical promotional video rendered."
  );

  console.log(
    `Resolution: ${video.width}x${video.height}`
  );

  console.log(
    `Aspect ratio: ${video.aspectRatio}`
  );

  console.log(
    `Duration: ${video.durationSeconds} seconds`
  );

  console.log(
    `Video codec: ${video.videoCodec}`
  );

  console.log(
    `Audio codec: ${video.audioCodec}`
  );

  console.log(
    `Video bytes: ${video.byteLength}`
  );

  console.log(
    `Saved: ${path.join(
      latestProject.directory,
      video.storedName
    )}`
  );
} catch (error) {
  project.status =
    "video_failed";

  project.videoError = {
    code:
      error.code ||
      "VIDEO_RENDER_FAILED",
    failedAt:
      new Date().toISOString()
  };

  await fs.writeFile(
    projectPath,
    JSON.stringify(
      project,
      null,
      2
    ),
    "utf8"
  );

  throw error;
}
