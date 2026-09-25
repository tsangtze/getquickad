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

const narrationCalls = [
  ...routeSource.matchAll(
    /await\s+generateNarration\(\{([\s\S]*?)\}\);/g
  )
];

assert.equal(
  narrationCalls.length,
  2,
  "Finalization must contain exactly two narration call sites."
);

assert.doesNotMatch(
  narrationCalls[0][1],
  /allowControlledTimelineExtension/,
  "The first narration attempt must remain strict and must not receive controlled timeline-extension permission."
);

assert.match(
  narrationCalls[1][1],
  /allowControlledTimelineExtension:\s*true/,
  "Only the corrected second narration attempt may use controlled timeline extension."
);

for (const narrationCall of narrationCalls) {
  assert.match(
    narrationCall[1],
    /durationTierSeconds:\s*selectedMaxDurationSeconds/,
    "Both narration attempts must retain the originally selected duration tier."
  );
}

assert.equal(
  countMatches(
    /allowControlledTimelineExtension:\s*true/g
  ),
  1,
  "Controlled timeline-extension permission must appear exactly once in finalization."
);

console.log(
  "PASS: Narration budget finalization performs one synchronized correction and one retry."
);

console.log(
  "PASS: Corrected storyboard persistence and renderer fallback remain synchronized."
);

console.log(
  "PASS: The first narration attempt stays strict and only the corrected retry may use controlled timeline extension."
);

console.log(
  "PASS: Controlled timeline extension preserves the originally selected duration tier."
);
