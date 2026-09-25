import assert from "node:assert/strict";
import fs from "node:fs/promises";

const source =
  await fs.readFile(
    new URL(
      "../../Frontend/app.js",
      import.meta.url
    ),
    "utf8"
  );

assert.match(
  source,
  /const reconciliationAttempts = 120;/,
  "Finalization recovery must allow 120 polling attempts."
);

assert.match(
  source,
  /const reconciliationDelayMs = 5000;/,
  "Finalization recovery must retain the 5-second polling interval."
);

assert.match(
  source,
  /"generating_narration",\s*"rendering_video"\s*\]\.includes\(\s*statusResult\?\.\s*project\?\.\s*status\s*\)/s,
  "Recovery must continue while narration generation or video rendering is active."
);

assert.match(
  source,
  /statusResult\?\.\s*project\?\.\s*status ===\s*"video_ready"/s,
  "Recovery must recognize persisted video_ready completion."
);

assert.match(
  source,
  /showFinalVideoReady\(\s*statusResult\s*\)/s,
  "Recovered completion must use the normal final-video success UI."
);

assert.doesNotMatch(
  source,
  /const reconciliationAttempts = 12;/,
  "The obsolete one-minute recovery window must not return."
);

const finalizePostMatches =
  source.match(
    /`\/api\/projects\/\$\{currentProjectId\}\/finalize`/g
  ) || [];

assert.equal(
  finalizePostMatches.length,
  1,
  "Recovery must not introduce a second finalize submission."
);

console.log(
  "PASS: mobile finalization recovery waits for active generation without resubmitting finalize."
);