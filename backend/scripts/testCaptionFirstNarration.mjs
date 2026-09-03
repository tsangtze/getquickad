import fs from "node:fs/promises";

const storyboardSource =
  await fs.readFile(
    new URL(
      "../storyboardGenerator.mjs",
      import.meta.url
    ),
    "utf8"
  );

const routeSource =
  await fs.readFile(
    new URL(
      "../projectRoutes.mjs",
      import.meta.url
    ),
    "utf8"
  );

const frontendSource =
  await fs.readFile(
    new URL(
      "../../Frontend/app.js",
      import.meta.url
    ),
    "utf8"
  );

function requireContract(
  condition,
  message
) {
  if (!condition) {
    throw new Error(message);
  }
}

requireContract(
  storyboardSource.includes(
    "narration must be exactly identical to caption"
  ),
  "Storyboard prompt must require narration to equal caption."
);

requireContract(
  !storyboardSource.includes(
    "Narration is the spoken voiceover and may be longer than the caption."
  ),
  "Old independent narration rule must not return."
);

requireContract(
  /narration:\s*\r?\n\s*caption/.test(
    routeSource
  ),
  "Finalize route must enforce narration = caption."
);

requireContract(
  /scene\.caption\s*=\s*\r?\n\s*captionInput\.value;\s*\r?\n\s*scene\.narration\s*=\s*\r?\n\s*captionInput\.value;/.test(
    frontendSource
  ),
  "Plan Review caption edits must synchronize narration."
);

console.log(
  "PASS: storyboard generation requires caption = narration."
);

console.log(
  "PASS: backend finalization enforces caption = narration."
);

console.log(
  "PASS: Plan Review caption edits synchronize narration."
);

console.log(
  "PASS: Version 1.1.7 caption-first contract protected."
);