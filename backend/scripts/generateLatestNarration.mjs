import {
  loadEnvFile
} from "node:process";
import path from "node:path";
import fs from "node:fs/promises";
import {
  generateNarration
} from "../narrationGenerator.mjs";

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

  const storyboardPath = path.join(
    directory,
    "storyboard.json"
  );

  try {
    await fs.access(storyboardPath);

    const stats =
      await fs.stat(directory);

    candidates.push({
      directory,
      modifiedAt:
        stats.mtimeMs
    });
  } catch {
    // Ignore projects without a completed storyboard.
  }
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
    "No completed storyboard was found."
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
  `Generating narration for project ${project.id.slice(0, 8)}...`
);

console.log(
  `Title: ${storyboardRecord.storyboard.title}`
);

console.log(
  `Style: ${storyboardRecord.storyboard.style}`
);

console.log(
  `Words: ${storyboardRecord.storyboard.narrationWordCount}`
);

const narration =
  await generateNarration({
    storyboard:
      storyboardRecord.storyboard,
    projectDirectory:
      latestProject.directory
  });

const narrationRecord = {
  projectId:
    project.id,
  narration
};

const narrationMetadataPath =
  path.join(
    latestProject.directory,
    "narration.json"
  );

await fs.writeFile(
  narrationMetadataPath,
  JSON.stringify(
    narrationRecord,
    null,
    2
  ),
  "utf8"
);

project.status =
  "narration_ready";

project.narration = {
  storedName:
    narration.storedName,
  model:
    narration.model,
  voice:
    narration.voice,
  format:
    narration.format,
  byteLength:
    narration.byteLength,
  narrationWordCount:
    narration.narrationWordCount,
  generatedAt:
    narration.generatedAt,
  disclosure:
    narration.disclosure
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

console.log(
  "PASS: AI narration generated successfully."
);

console.log(
  `Model: ${narration.model}`
);

console.log(
  `Voice: ${narration.voice}`
);

console.log(
  `Format: ${narration.format}`
);

console.log(
  `Words: ${narration.narrationWordCount}`
);

console.log(
  `Audio bytes: ${narration.byteLength}`
);

console.log(
  `Saved: ${path.join(
    latestProject.directory,
    narration.storedName
  )}`
);

console.log(
  `Metadata: ${narrationMetadataPath}`
);

console.log(
  `Disclosure: ${narration.disclosure}`
);
