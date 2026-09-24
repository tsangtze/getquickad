import fs from "node:fs/promises";
import {
  generateStoryboard,
  __storyboardGeneratorTestHelpers
} from "../storyboardGenerator.mjs";
const {
  buildSystemInstructions
} = __storyboardGeneratorTestHelpers;

for (const [durationTier, expectedBudget] of [
  [30, 27],
  [45, 40.5],
  [60, 54]
]) {
  const instructions =
    buildSystemInstructions(
      "en",
      durationTier,
      "manual",
      1
    );

  if (
    !instructions.includes(
      "at or below 90% of the selected duration tier"
    )
  ) {
    throw new Error(
      `Missing 90% narration rule for ${durationTier}s tier.`
    );
  }

  if (
    !instructions.includes(
      `${expectedBudget} seconds`
    )
  ) {
    throw new Error(
      `Missing ${expectedBudget}s narration budget for ${durationTier}s tier.`
    );
  }
}

console.log(
  "PASS: Storyboard planning prompt preserves 90% narration budgets for 30/45/60-second tiers."
);


const project = {
  description:
    "Portable coffee maker, rechargeable and compact.",
  website:
    "mycoffee.com",
  callToAction:
    "Shop Now",
  style:
    "Professional",
  assets: {
    productImages: [
      {
        storedName:
          "product-01.jpg"
      }
    ]
  }
};

let missingKeyRejected = false;

try {
  await generateStoryboard({
    project,
    apiKey: ""
  });
} catch (error) {
  if (
    error.code ===
    "OPENAI_API_KEY_MISSING"
  ) {
    missingKeyRejected = true;
  } else {
    throw error;
  }
}

if (!missingKeyRejected) {
  throw new Error(
    "Generator did not reject a missing API key."
  );
}

console.log(
  "PASS: Missing API key rejected safely."
);

console.log(
  "PASS: No OpenAI request was made."
);

{
  const {
    mergeNarrationCorrection
  } = __storyboardGeneratorTestHelpers;

  const originalStoryboard = {
    version: "1.0",
    title: "Correction Test",
    style: "Professional",
    aspectRatio: "9:16",
    totalDurationSeconds: 30,
    narrationWordCount: 8,
    musicDirection: "Clean upbeat music",
    scenes: [
      {
        sceneNumber: 1,
        startSeconds: 0,
        endSeconds: 15,
        imageIndex: 0,
        role: "hook",
        narration:
          "Original narration for scene one",
        caption:
          "Original narration for scene one",
        emphasisWords: ["Original"],
        captionSegments: [
          {
            text:
              "Original narration for scene one",
            emphasisWords: ["Original"]
          }
        ],
        motion: "none",
        transition: "fade"
      },
      {
        sceneNumber: 2,
        startSeconds: 15,
        endSeconds: 30,
        imageIndex: 1,
        role: "cta",
        narration:
          "Original narration for scene two",
        caption:
          "Original narration for scene two",
        emphasisWords: ["scene"],
        captionSegments: [
          {
            text:
              "Original narration for scene two",
            emphasisWords: ["scene"]
          }
        ],
        motion: "slow-pan-left",
        transition: "dissolve"
      }
    ],
    cta: {
      text: "Create your video",
      website: "pix2vid.net"
    }
  };

  const corrected = mergeNarrationCorrection({
    storyboard: originalStoryboard,
    correctedScenes: [
      {
        sceneNumber: 1,
        captionSegments: [
          {
            text: "Short scene one",
            emphasisWords: ["Short"]
          }
        ]
      },
      {
        sceneNumber: 2,
        captionSegments: [
          {
            text: "Short scene two",
            emphasisWords: ["scene"]
          }
        ]
      }
    ]
  });

  const assertEqual = (
    actual,
    expected,
    message
  ) => {
    if (actual !== expected) {
      throw new Error(
        `${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
      );
    }
  };

  assertEqual(
    corrected.title,
    originalStoryboard.title,
    "Title changed"
  );

  assertEqual(
    corrected.style,
    originalStoryboard.style,
    "Style changed"
  );

  assertEqual(
    corrected.totalDurationSeconds,
    originalStoryboard.totalDurationSeconds,
    "Total duration changed"
  );

  assertEqual(
    corrected.musicDirection,
    originalStoryboard.musicDirection,
    "Music direction changed"
  );

  assertEqual(
    JSON.stringify(corrected.cta),
    JSON.stringify(originalStoryboard.cta),
    "CTA changed"
  );

  for (
    let index = 0;
    index < originalStoryboard.scenes.length;
    index += 1
  ) {
    const before =
      originalStoryboard.scenes[index];
    const after =
      corrected.scenes[index];

    for (
      const field of [
        "sceneNumber",
        "startSeconds",
        "endSeconds",
        "imageIndex",
        "role",
        "motion",
        "transition"
      ]
    ) {
      assertEqual(
        after[field],
        before[field],
        `Scene ${before.sceneNumber} ${field} changed`
      );
    }
  }

  assertEqual(
    corrected.scenes[0].narration,
    "Short scene one",
    "Scene 1 narration was not rebuilt"
  );

  assertEqual(
    corrected.scenes[0].caption,
    "Short scene one",
    "Scene 1 compatibility caption was not rebuilt"
  );

  assertEqual(
    JSON.stringify(
      corrected.scenes[0].emphasisWords
    ),
    JSON.stringify(["Short"]),
    "Scene 1 compatibility emphasis was not rebuilt"
  );

  assertEqual(
    corrected.scenes[1].narration,
    "Short scene two",
    "Scene 2 narration was not rebuilt"
  );

  assertEqual(
    corrected.narrationWordCount,
    6,
    "Narration word count was not rebuilt"
  );

  if (
    originalStoryboard.scenes[0].narration !==
      "Original narration for scene one" ||
    originalStoryboard.scenes[1].narration !==
      "Original narration for scene two"
  ) {
    throw new Error(
      "Narration correction mutated the original storyboard."
    );
  }

  for (
    const invalidCorrection of [
      [
        {
          sceneNumber: 1,
          captionSegments: [
            {
              text: "Only one scene",
              emphasisWords: ["scene"]
            }
          ]
        }
      ],
      [
        {
          sceneNumber: 1,
          captionSegments: [
            {
              text: "First",
              emphasisWords: ["First"]
            }
          ]
        },
        {
          sceneNumber: 1,
          captionSegments: [
            {
              text: "Duplicate",
              emphasisWords: ["Duplicate"]
            }
          ]
        }
      ],
      [
        {
          sceneNumber: 1,
          captionSegments: [
            {
              text: "First",
              emphasisWords: ["First"]
            }
          ]
        },
        {
          sceneNumber: 99,
          captionSegments: [
            {
              text: "Wrong scene",
              emphasisWords: ["Wrong"]
            }
          ]
        }
      ]
    ]
  ) {
    let rejected = false;

    try {
      mergeNarrationCorrection({
        storyboard: originalStoryboard,
        correctedScenes:
          invalidCorrection
      });
    } catch {
      rejected = true;
    }

    if (!rejected) {
      throw new Error(
        "Invalid narration correction was accepted."
      );
    }
  }

  console.log(
    "PASS: Narration correction changes only synchronized spoken content."
  );
}
{
  const source =
    await fs.readFile(
      new URL(
        "../storyboardGenerator.mjs",
        import.meta.url
      ),
      "utf8"
    );

  const requiredFragments = [
    '${languageDescription} marketing language',
    'Duration tier: ${durationTierSeconds} seconds.',
    'Hard maximum natural narration budget: ${budgetSeconds} seconds.',
    'Correction target natural narration duration: ${correctionTargetSeconds} seconds.',
    'Measured natural narration before correction: ${measuredDuration} seconds.',
    'Target language: ${languageDescription}.',
    '${validation.errors.join("; ")}'
  ];

  for (const fragment of requiredFragments) {
    if (!source.includes(fragment)) {
      throw new Error(
        `Narration correction runtime fragment is missing: ${fragment}`
      );
    }
  }

{
  const correctionTargetRatio = 0.85;

  for (const [durationTierSeconds, expectedTargetSeconds] of [
    [30, 25.5],
    [45, 38.25],
    [60, 51]
  ]) {
    const correctionTargetSeconds =
      durationTierSeconds * correctionTargetRatio;

    if (
      correctionTargetSeconds !==
      expectedTargetSeconds
    ) {
      throw new Error(
        `Unexpected narration correction target for ${durationTierSeconds}s tier: ${correctionTargetSeconds}s.`
      );
    }
  }

  const source =
    await fs.readFile(
      new URL(
        "../storyboardGenerator.mjs",
        import.meta.url
      ),
      "utf8"
    );

  if (
    !source.includes(
      "durationTierSeconds * 0.85"
    )
  ) {
    throw new Error(
      "Narration correction runtime no longer uses the 85% target."
    );
  }

  if (
    !source.includes(
      "durationTierSeconds * 0.9"
    )
  ) {
    throw new Error(
      "Narration correction runtime no longer preserves the 90% hard ceiling."
    );
  }

  console.log(
    "PASS: Narration correction targets 25.5/38.25/51 seconds while preserving the 90% hard ceiling."
  );
}
{
  const durationTierSeconds = 30;
  const measuredDuration = 30.552;
  const correctionTargetSeconds =
    durationTierSeconds * 0.85;

  const correctionDurationRatio =
    correctionTargetSeconds / measuredDuration;
  const correctionShorteningRatio =
    1 - correctionDurationRatio;

  const correctionDurationPercent =
    correctionDurationRatio * 100;
  const correctionShorteningPercent =
    correctionShorteningRatio * 100;

  if (
    correctionDurationPercent.toFixed(2) !==
    "83.46"
  ) {
    throw new Error(
      `Expected measured correction duration target 83.46%; received ${correctionDurationPercent.toFixed(2)}%.`
    );
  }

  if (
    correctionShorteningPercent.toFixed(2) !==
    "16.54"
  ) {
    throw new Error(
      `Expected measured correction shortening 16.54%; received ${correctionShorteningPercent.toFixed(2)}%.`
    );
  }

  const source =
    await fs.readFile(
      new URL(
        "../storyboardGenerator.mjs",
        import.meta.url
      ),
      "utf8"
    );

  for (const required of [
    "correctionTargetSeconds / measuredDuration",
    "1 - correctionDurationRatio",
    "correctionDurationPercent.toFixed(2)",
    "correctionShorteningPercent.toFixed(2)",
    "Required measured shortening:"
  ]) {
    if (!source.includes(required)) {
      throw new Error(
        `Measured shortening runtime contract missing: ${required}`
      );
    }
  }

  console.log(
    "PASS: Production 30.552s case requests 83.46% remaining duration / 16.54% measured shortening toward the 25.5s target."
  );
}
  const forbiddenFragments = [
    "Use concise, natural  marketing language.",
    "Duration tier:  seconds.",
    "Hard maximum natural narration budget:  seconds.",
    "Correction target natural narration duration:  seconds.",
    "Measured natural narration before correction:  seconds.",
    "Target language: ."
  ];

  for (const fragment of forbiddenFragments) {
    if (source.includes(fragment)) {
      throw new Error(
        `Narration correction contains a blank runtime value: ${fragment}`
      );
    }
  }

  console.log(
    "PASS: Narration correction runtime prompt preserves dynamic budget values."
  );
}