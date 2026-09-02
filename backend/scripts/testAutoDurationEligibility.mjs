import assert from "node:assert/strict";

import {
  getMinimumDurationTierForImageCount
} from "../projectRoutes.mjs";

const cases = [
  [1, 30],
  [5, 30],
  [6, 45],
  [7, 45],
  [8, 60],
  [10, 60]
];

for (const [imageCount, expectedTier] of cases) {
  const actualTier =
    getMinimumDurationTierForImageCount(
      imageCount
    );

  assert.equal(
    actualTier,
    expectedTier,
    `${imageCount} images should require the ${expectedTier}-second tier.`
  );
}

console.log(
  "PASS: Image-count boundaries map to 30 / 45 / 60 tiers."
);

for (const invalidCount of [0, 11, -1, 1.5]) {
  assert.throws(
    () =>
      getMinimumDurationTierForImageCount(
        invalidCount
      ),
    /imageCount must be an integer from 1 through 10/
  );
}

console.log(
  "PASS: Invalid image counts are rejected."
);

function eligibleTiers(
  imageCount,
  planMaxVideoSeconds
) {
  const minimumTier =
    getMinimumDurationTierForImageCount(
      imageCount
    );

  return [30, 45, 60].filter(
    (tier) =>
      tier >= minimumTier &&
      tier <= planMaxVideoSeconds
  );
}

assert.deepEqual(
  eligibleTiers(5, 30),
  [30]
);

assert.deepEqual(
  eligibleTiers(5, 60),
  [30, 45, 60]
);

assert.deepEqual(
  eligibleTiers(6, 60),
  [45, 60]
);

assert.deepEqual(
  eligibleTiers(7, 60),
  [45, 60]
);

assert.deepEqual(
  eligibleTiers(8, 60),
  [60]
);

assert.deepEqual(
  eligibleTiers(10, 60),
  [60]
);

assert.deepEqual(
  eligibleTiers(6, 30),
  []
);

console.log(
  "PASS: Auto eligibility respects image minimums and plan ceilings."
);

console.log(
  "PASS: All AI Decide duration eligibility tests passed."
);
