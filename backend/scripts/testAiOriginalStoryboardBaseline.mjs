import assert from "node:assert/strict";
import fs from "node:fs/promises";

const routeSource = await fs.readFile(
  new URL("../projectRoutes.mjs", import.meta.url),
  "utf8"
);

assert.match(
  routeSource,
  /const storyboardRecord\s*=\s*\{[\s\S]*?projectId:\s*project\.id,[\s\S]*?\.\.\.result,[\s\S]*?aiOriginalStoryboard:\s*result\.storyboard[\s\S]*?\};/,
  "Initial AI storyboard generation must preserve the immutable AI-original baseline."
);

assert.match(
  routeSource,
  /const originalStoryboard\s*=\s*existingStoryboardRecord\s*\?\.aiOriginalStoryboard\s*\?\?\s*existingStoryboardRecord\s*\?\.storyboard;/,
  "Manual edit validation must prefer the immutable AI-original baseline with legacy fallback."
);

assert.match(
  routeSource,
  /const approvedStoryboardRecord\s*=\s*\{[\s\S]*?\.\.\.existingStoryboardRecord,[\s\S]*?storyboard:\s*approvedStoryboard/,
  "Approval persistence must retain the existing immutable baseline."
);

assert.match(
  routeSource,
  /const correctedStoryboardRecord\s*=\s*\{[\s\S]*?\.\.\.approvedStoryboardRecord,[\s\S]*?storyboard:\s*finalStoryboard/,
  "Narration correction persistence must retain the immutable baseline."
);

assert.equal(
  (
    routeSource.match(
      /aiOriginalStoryboard:\s*result\.storyboard/g
    ) ?? []
  ).length,
  1,
  "The immutable baseline must be established exactly once during AI storyboard generation."
);

assert.equal(
  (
    routeSource.match(
      /\?\.aiOriginalStoryboard\s*\?\?/g
    ) ?? []
  ).length,
  1,
  "Finalization must prefer the immutable baseline exactly once."
);

console.log(
  "PASS: AI-generated storyboard is preserved as immutable aiOriginalStoryboard."
);

console.log(
  "PASS: Scene edit validation prefers immutable AI original with legacy fallback."
);

console.log(
  "PASS: Approval and narration correction preserve the immutable baseline."
);