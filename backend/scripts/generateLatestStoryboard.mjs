import {
  loadEnvFile
} from "node:process";
import path from "node:path";
import fs from "node:fs/promises";
import {
  generateStoryboard
} from "../storyboardGenerator.mjs";

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

const projectDirectories =
  await Promise.all(
    entries
      .filter((entry) =>
        entry.isDirectory()
      )
      .map(async (entry) => {
        const directory = path.join(
          projectsRoot,
          entry.name
        );

        const stats =
          await fs.stat(directory);

        return {
          directory,
          modifiedAt:
            stats.mtimeMs
        };
      })
  );

projectDirectories.sort(
  (left, right) =>
    right.modifiedAt -
    left.modifiedAt
);

const latestProject =
  projectDirectories[0];

if (!latestProject) {
  throw new Error(
    "No saved project was found."
  );
}

const projectPath = path.join(
  latestProject.directory,
  "project.json"
);

const project = JSON.parse(
  await fs.readFile(
    projectPath,
    "utf8"
  )
);

console.log(
  `Generating storyboard for project ${project.id.slice(0, 8)}...`
);

console.log(
  `Style: ${project.style}`
);

console.log(
  `Images: ${project.assets.productImages.length}`
);

const result =
  await generateStoryboard({
    project,
    projectDirectory:
      latestProject.directory
  });

const savedResult = {
  projectId: project.id,
  ...result
};

const storyboardPath = path.join(
  latestProject.directory,
  "storyboard.json"
);

await fs.writeFile(
  storyboardPath,
  JSON.stringify(
    savedResult,
    null,
    2
  ),
  "utf8"
);

console.log(
  "PASS: AI storyboard generated and validated."
);

console.log(
  `Model: ${result.generation.model}`
);

console.log(
  `Title: ${result.storyboard.title}`
);

console.log(
  `Scenes: ${result.storyboard.scenes.length}`
);

console.log(
  `Duration: ${result.storyboard.totalDurationSeconds} seconds`
);

console.log(
  `Narration: ${result.storyboard.narrationWordCount} words`
);

console.log(
  `Saved: ${storyboardPath}`
);

if (result.generation.usage) {
  console.log(
    `Input tokens: ${result.generation.usage.input_tokens}`
  );

  console.log(
    `Output tokens: ${result.generation.usage.output_tokens}`
  );
}
