import assert from "node:assert/strict";
import fs from "node:fs/promises";

const backendSource = await fs.readFile(
  new URL("../projectRoutes.mjs", import.meta.url),
  "utf8"
);

const frontendSource = await fs.readFile(
  new URL("../../Frontend/app.js", import.meta.url),
  "utf8"
);

function count(pattern, source) {
  return [...source.matchAll(pattern)].length;
}

assert.equal(
  count(/crypto\.randomBytes\(6\)/g, backendSource),
  2,
  "Exactly two 48-bit tracking-ID generators must exist."
);

assert.equal(
  count(
    /\.toString\("hex"\)\s*\.toUpperCase\(\)/g,
    backendSource
  ),
  2,
  "Both tracking IDs must use uppercase hexadecimal formatting."
);

assert.match(
  backendSource,
  /const trackingId\s*=\s*crypto\.randomBytes\(6\)[\s\S]*?STORYBOARD_GENERATION_FAILED[\s\S]*?trackingId/,
  "Storyboard failures must create and return a tracking ID."
);

assert.match(
  backendSource,
  /\[Tracking ID: \$\{trackingId\}\] Storyboard generation failed:/,
  "Storyboard failures must log the same tracking ID."
);

const finalCatchMatch = backendSource.match(
  /\}\s*catch\s*\(error\)\s*\{\s*const isCorrectableNarrationFailure\s*=[\s\S]*?response\.status\(502\)\.json\(\{[\s\S]*?\}\);\s*\}/
);

assert.ok(
  finalCatchMatch,
  "Final-video failure catch must be present."
);

const finalCatch = finalCatchMatch[0];

for (const code of [
  "NARRATION_TOTAL_TOO_LONG",
  "NARRATION_DURATION_BUDGET_EXCEEDED",
  "NARRATION_SCENE_TOO_LONG"
]) {
  assert.match(
    finalCatch,
    new RegExp(`"${code}"`),
    `${code} must remain explicitly classified.`
  );
}

assert.match(
  finalCatch,
  /const trackingId\s*=\s*isCorrectableNarrationFailure\s*\?\s*""\s*:\s*crypto\.randomBytes\(6\)/,
  "Correctable narration failures must not generate tracking IDs."
);

assert.match(
  finalCatch,
  /if\s*\(trackingId\)\s*\{\s*console\.error\(\s*`\[Tracking ID: \$\{trackingId\}\] Final video generation failed:`/,
  "Only genuine final-video failures may log a Tracking ID."
);

assert.match(
  finalCatch,
  /\.\.\.\(trackingId\s*\?\s*\{\s*trackingId\s*\}\s*:\s*\{\s*\}\)/,
  "Tracking IDs must be persisted only when present."
);

for (const code of [
  "NARRATION_TOTAL_TOO_LONG",
  "NARRATION_DURATION_BUDGET_EXCEEDED",
  "NARRATION_SCENE_TOO_LONG"
]) {
  const branchPattern = new RegExp(
    `error\\?\\.code\\s*===\\s*"${code}"[\\s\\S]*?response\\.status\\(400\\)\\.json\\(\\{([\\s\\S]*?)\\}\\);`
  );

  const branch = finalCatch.match(branchPattern);

  assert.ok(
    branch,
    `${code} must retain its 400 response branch.`
  );

  assert.doesNotMatch(
    branch[1],
    /\btrackingId\b/,
    `${code} response must not expose a tracking ID.`
  );
}

assert.match(
  finalCatch,
  /response\.status\(502\)\.json\(\{[\s\S]*?code:\s*"FINAL_VIDEO_GENERATION_FAILED"[\s\S]*?trackingId[\s\S]*?\}\);/,
  "Unexpected final-video failures must return their tracking ID."
);

assert.match(
  frontendSource,
  /apiError\.trackingId\s*=\s*String\(result\?\.trackingId\s*\|\|\s*""\)\.trim\(\)/,
  "Frontend must preserve final-video tracking IDs from the API."
);

assert.match(
  frontendSource,
  /const trackingId\s*=\s*String\(error\?\.trackingId\s*\|\|\s*""\)\.trim\(\)/,
  "Frontend must recover tracking IDs from thrown errors."
);

assert.match(
  frontendSource,
  /trackingId\s*\?\s*`\$\{failureMessage\} Tracking ID: \$\{trackingId\}`\s*:\s*failureMessage/,
  "Frontend must display Tracking ID only when one exists."
);

assert.equal(
  count(
    /Tracking ID: \$\{trackingId\}/g,
    frontendSource
  ),
  2,
  "Tracking ID display must exist for storyboard and final-video failures."
);

console.log(
  "PASS: Genuine storyboard and final-video failures retain Tracking IDs."
);

console.log(
  "PASS: Correctable narration 400 responses generate, persist, return, and display no Tracking ID."
);

console.log(
  "PASS: Frontend displays Tracking ID only when supplied by a genuine backend failure."
);