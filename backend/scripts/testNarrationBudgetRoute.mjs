import assert from "node:assert/strict";
import fs from "node:fs/promises";

const routeSource = await fs.readFile(
  new URL("../projectRoutes.mjs", import.meta.url),
  "utf8"
);

function countMatches(pattern) {
  return (
    routeSource.match(pattern) ?? []
  ).length;
}

assert.equal(
  countMatches(
    /await\s+correctNarrationToDurationBudget\(\{/g
  ),
  1,
  "Finalization must contain exactly one automatic narration correction call."
);

assert.equal(
  countMatches(
    /await\s+generateNarration\(\{/g
  ),
  2,
  "Finalization must contain exactly two narration call sites."
);

assert.match(
  routeSource,
  /error\?\.code\s*!==\s*"NARRATION_DURATION_BUDGET_EXCEEDED"/,
  "The first narration catch must retry only the measured 90% budget failure."
);

assert.match(
  routeSource,
  /measuredNarrationDurationSeconds:\s*error\.measuredDurationSeconds/,
  "Automatic correction must receive the measured natural narration duration."
);

assert.match(
  routeSource,
  /durationTierSeconds:\s*selectedMaxDurationSeconds/,
  "Automatic correction must use the selected duration tier."
);

assert.match(
  routeSource,
  /await\s+correctNarrationToDurationBudget\(\{[\s\S]*?imageCount:\s*project\.assets\.productImages\.length,[\s\S]*?durationTierSeconds:\s*selectedMaxDurationSeconds/,
  "Narration correction must use the project's actual uploaded product-image count."
);

assert.match(
  routeSource,
  /finalStoryboard\s*=\s*correction\.storyboard/,
  "The corrected synchronized storyboard must become the working storyboard."
);

assert.match(
  routeSource,
  /const correctedStoryboardRecord\s*=\s*\{[\s\S]*?storyboard:\s*finalStoryboard,[\s\S]*?narrationCorrection:\s*correction\.generation[\s\S]*?\};/,
  "The corrected storyboard and correction metadata must be persisted together."
);

assert.match(
  routeSource,
  /await fs\.writeFile\(\s*storyboardPath,\s*JSON\.stringify\(\s*correctedStoryboardRecord,/,
  "The corrected storyboard record must be written before the retry completes."
);

assert.match(
  routeSource,
  /narration\.adjustedStoryboard\s*\?\?\s*finalStoryboard/,
  "Rendering must fall back to the corrected working storyboard."
);

assert.equal(
  countMatches(
    /"NARRATION_DURATION_BUDGET_EXCEEDED"/g
  ),
  3,
  "The route must contain the retry check plus controlled response condition/code."
);

assert.match(
  routeSource,
  /error\?\.code\s*===\s*"NARRATION_DURATION_BUDGET_EXCEEDED"[\s\S]*?response\.status\(400\)\.json\(\{[\s\S]*?measuredDurationSeconds:[\s\S]*?budgetSeconds:[\s\S]*?durationTierSeconds:[\s\S]*?budgetRatio:[\s\S]*?90% speaking-time budget[\s\S]*?return;/,
  "A second measured-budget failure must return a controlled 400 with timing metadata."
);

const budgetResponseIndex =
  routeSource.lastIndexOf(
    '"NARRATION_DURATION_BUDGET_EXCEEDED"'
  );

const genericFailureIndex =
  routeSource.lastIndexOf(
    'response.status(502).json({'
  );

assert.ok(
  budgetResponseIndex >= 0 &&
    genericFailureIndex >= 0 &&
    budgetResponseIndex <
      genericFailureIndex,
  "Controlled narration-budget failure must precede the generic 502 response."
);

console.log(
  "PASS: Narration budget finalization performs one synchronized correction and one retry."
);

console.log(
  "PASS: Corrected storyboard persistence and renderer fallback remain synchronized."
);

console.log(
  "PASS: A second over-budget narration attempt remains a controlled 400."
);
