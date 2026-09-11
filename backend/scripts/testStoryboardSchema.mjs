import {
  validateStoryboard
} from "../storyboardSchema.mjs";

const validStoryboard = {
  version: "1.0",
  title: "Portable Coffee Anywhere",
  style: "Energetic",
  aspectRatio: "9:16",
  totalDurationSeconds: 25,
  narrationWordCount: 49,
  musicDirection:
    "Upbeat modern instrumental with a clean finish.",
  scenes: [
    {
      sceneNumber: 1,
      startSeconds: 0,
      endSeconds: 4,
      imageIndex: 1,
      role: "hook",
      narration:
        "Great coffee should travel wherever your day takes you.",
      caption: "Great coffee. Anywhere.",
      emphasisWords: ["Great coffee", "Anywhere"],
      captionSegments: [
        {
          text: "Great coffee. Anywhere.",
          emphasisWords: ["Great coffee", "Anywhere"]
        }
      ],
      motion: "slow-zoom-in",
      transition: "cut"
    },
    {
      sceneNumber: 2,
      startSeconds: 4,
      endSeconds: 9,
      imageIndex: 1,
      role: "product",
      narration:
        "Meet the compact rechargeable coffee maker designed for life on the move.",
      caption: "Compact and rechargeable",
      emphasisWords: ["Compact", "rechargeable"],
      captionSegments: [
        {
          text: "Compact and rechargeable",
          emphasisWords: ["Compact", "rechargeable"]
        }
      ],
      motion: "slow-pan-right",
      transition: "slide"
    },
    {
      sceneNumber: 3,
      startSeconds: 9,
      endSeconds: 15,
      imageIndex: 2,
      role: "benefit",
      narration:
        "Brew a fresh cup at work, outdoors, or while traveling.",
      caption: "Fresh coffee on demand",
      emphasisWords: ["Fresh coffee", "demand"],
      captionSegments: [
        {
          text: "Fresh coffee on demand",
          emphasisWords: ["Fresh coffee", "demand"]
        }
      ],
      motion: "slow-zoom-out",
      transition: "fade"
    },
    {
      sceneNumber: 4,
      startSeconds: 15,
      endSeconds: 20,
      imageIndex: 2,
      role: "benefit",
      narration:
        "Simple controls make every cup quick and convenient.",
      caption: "Simple. Quick. Convenient.",
      emphasisWords: ["Quick", "Convenient"],
      captionSegments: [
        {
          text: "Simple. Quick. Convenient.",
          emphasisWords: ["Quick", "Convenient"]
        }
      ],
      motion: "slow-pan-left",
      transition: "dissolve"
    },
    {
      sceneNumber: 5,
      startSeconds: 20,
      endSeconds: 25,
      imageIndex: 1,
      role: "cta",
      narration:
        "Get yours for seventy-nine dollars and enjoy better coffee anywhere.",
      caption: "Shop Now · $79",
      emphasisWords: ["Shop Now", "$79"],
      captionSegments: [
        {
          text: "Shop Now · $79",
          emphasisWords: ["Shop Now", "$79"]
        }
      ],
      motion: "slow-zoom-in",
      transition: "fade"
    }
  ],
  cta: {
    text: "Shop Now",
    website: "mycoffee.com"
  }
};

// Synchronize the base fixture with the sequential-caption contract.
const baseCaptionSegments = [
  [
    {
      text: "Great coffee should travel",
      emphasisWords: ["Great coffee", "travel"]
    },
    {
      text: "wherever your day takes you.",
      emphasisWords: ["your day"]
    }
  ],
  [
    {
      text: "Meet the compact rechargeable coffee maker",
      emphasisWords: ["compact", "rechargeable"]
    },
    {
      text: "designed for life on the move.",
      emphasisWords: ["life on the move"]
    }
  ],
  [
    {
      text: "Brew a fresh cup at work,",
      emphasisWords: ["fresh cup", "work"]
    },
    {
      text: "outdoors, or while traveling.",
      emphasisWords: ["outdoors", "traveling"]
    }
  ],
  [
    {
      text: "Simple controls make every cup",
      emphasisWords: ["Simple controls"]
    },
    {
      text: "quick and convenient.",
      emphasisWords: ["quick", "convenient"]
    }
  ],
  [
    {
      text: "Get yours for seventy-nine dollars",
      emphasisWords: ["seventy-nine dollars"]
    },
    {
      text: "and enjoy better coffee anywhere.",
      emphasisWords: ["better coffee", "anywhere"]
    }
  ]
];

validStoryboard.scenes.forEach(
  (scene, index) => {
    const captionSegments =
      baseCaptionSegments[index];

    scene.captionSegments =
      captionSegments;

    scene.narration =
      captionSegments
        .map((segment) => segment.text)
        .join(" ");

    scene.caption =
      captionSegments[0].text;

    scene.emphasisWords =
      [...captionSegments[0].emphasisWords];
  }
);

validStoryboard.narrationWordCount =
  validStoryboard.scenes
    .map((scene) => scene.narration)
    .join(" ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;

const validResult =
  validateStoryboard(
    validStoryboard,
    {
      imageCount: 2
    }
  );

if (!validResult.ok) {
  console.error(validResult.errors);
  throw new Error(
    "Expected valid storyboard to pass."
  );
}

const invalidStoryboard =
  structuredClone(validStoryboard);

invalidStoryboard.scenes[1].startSeconds = 7;

const invalidResult =
  validateStoryboard(
    invalidStoryboard,
    {
      imageCount: 2
    }
  );

if (invalidResult.ok) {
  throw new Error(
    "Expected broken timeline to fail."
  );
}

console.log(
  "PASS: Valid storyboard accepted."
);

console.log(
  "PASS: Broken timeline rejected."
);

console.log(
  `Scenes: ${validStoryboard.scenes.length}`
);

console.log(
  `Duration: ${validStoryboard.totalDurationSeconds} seconds`
);

console.log(
  `Narration: ${validStoryboard.narrationWordCount} words`
);

// --- CAPTION EMPHASIS REGRESSION TESTS ---

const oneEmphasisStoryboard =
  structuredClone(validStoryboard);

oneEmphasisStoryboard.scenes[0].emphasisWords = [
  "Great coffee"
];

// v1.1.8.27 positive-fixture synchronization
oneEmphasisStoryboard.scenes[0]
  .captionSegments[0]
  .emphasisWords = [
    "Great coffee"
  ];

const oneEmphasisResult =
  validateStoryboard(
    oneEmphasisStoryboard,
    {
      imageCount: 2
    }
  );

if (!oneEmphasisResult.ok) {
  throw new Error(
    `Expected one valid emphasis term to pass: ${oneEmphasisResult.errors.join(" ")}`
  );
}

console.log(
  "PASS: One valid emphasis term accepted."
);

const twoEmphasisStoryboard =
  structuredClone(validStoryboard);

twoEmphasisStoryboard.scenes[0].emphasisWords = [
  "Great coffee",
  "Anywhere"
];

twoEmphasisStoryboard.scenes[0].emphasisWords = [
  "Great coffee",
  "travel"
];

twoEmphasisStoryboard.scenes[0]
  .captionSegments[0]
  .emphasisWords = [
    "Great coffee",
    "travel"
  ];

const twoEmphasisResult =
  validateStoryboard(
    twoEmphasisStoryboard,
    {
      imageCount: 2
    }
  );

if (!twoEmphasisResult.ok) {
  throw new Error(
    `Expected two valid emphasis terms to pass: ${twoEmphasisResult.errors.join(" ")}`
  );
}

console.log(
  "PASS: Two valid emphasis terms accepted."
);

const missingEmphasisStoryboard =
  structuredClone(validStoryboard);

missingEmphasisStoryboard.scenes[0].emphasisWords = [
  "SALE"
];

const missingEmphasisResult =
  validateStoryboard(
    missingEmphasisStoryboard,
    {
      imageCount: 2
    }
  );

if (missingEmphasisResult.ok) {
  throw new Error(
    "Expected emphasis text absent from caption to fail."
  );
}

if (
  !missingEmphasisResult.errors.some(
    (error) =>
      error.includes(
        "emphasis term must appear exactly in its caption"
      )
  )
) {
  throw new Error(
    `Expected missing-emphasis validation error: ${missingEmphasisResult.errors.join(" ")}`
  );
}

console.log(
  "PASS: Emphasis term absent from caption rejected."
);

const tooManyEmphasisStoryboard =
  structuredClone(validStoryboard);

tooManyEmphasisStoryboard.scenes[0].emphasisWords = [
  "Great",
  "coffee",
  "Anywhere"
];

const tooManyEmphasisResult =
  validateStoryboard(
    tooManyEmphasisStoryboard,
    {
      imageCount: 2
    }
  );

if (tooManyEmphasisResult.ok) {
  throw new Error(
    "Expected more than two emphasis terms to fail."
  );
}

console.log(
  "PASS: More than two emphasis terms rejected."
);

const emptyEmphasisStoryboard =
  structuredClone(validStoryboard);

emptyEmphasisStoryboard.scenes[0].emphasisWords = [];

const emptyEmphasisResult =
  validateStoryboard(
    emptyEmphasisStoryboard,
    {
      imageCount: 2
    }
  );

if (emptyEmphasisResult.ok) {
  throw new Error(
    "Expected empty emphasisWords to fail."
  );
}

console.log(
  "PASS: Empty emphasisWords rejected."
);

// --- caption emphasis legacy compatibility tests ---

const legacyMissingEmphasisStoryboard =
  structuredClone(validStoryboard);

for (
  const scene of
  legacyMissingEmphasisStoryboard.scenes
) {
  delete scene.emphasisWords;
}

const strictLegacyResult =
  validateStoryboard(
    legacyMissingEmphasisStoryboard,
    {
      imageCount: 2
    }
  );

if (strictLegacyResult.ok) {
  throw new Error(
    "Storyboard missing emphasisWords must remain invalid by default."
  );
}

console.log(
  "PASS: Missing emphasisWords rejected by default."
);

const compatibleLegacyResult =
  validateStoryboard(
    legacyMissingEmphasisStoryboard,
    {
      imageCount: 2,
      allowLegacyMissingEmphasis: true
    }
  );

if (!compatibleLegacyResult.ok) {
  throw new Error(
    `Expected legacy storyboard without emphasis to validate: ${compatibleLegacyResult.errors.join(" ")}`
  );
}

if (
  compatibleLegacyResult.storyboard.scenes.some(
    (scene) =>
      !Array.isArray(scene.emphasisWords) ||
      scene.emphasisWords.length !== 0
  )
) {
  throw new Error(
    "Legacy compatibility must normalize missing emphasisWords to empty arrays."
  );
}

console.log(
  "PASS: Legacy storyboard without emphasis accepted and normalized."
);

// --- v1.1.8.27 caption-segment tests ---

const validSegmentStoryboard =
  structuredClone(validStoryboard);

validSegmentStoryboard.scenes[0].captionSegments = [
  {
    text: "Great coffee.",
    emphasisWords: ["Great coffee"]
  },
  {
    text: "Anywhere.",
    emphasisWords: ["Anywhere"]
  }
];

validSegmentStoryboard.scenes[0].narration =
  "Great coffee. Anywhere.";

validSegmentStoryboard.scenes[0].caption =
  "Great coffee.";

validSegmentStoryboard.scenes[0].emphasisWords = [
  "Great coffee"
];

// Recalculate after changing the valid segmented scene narration.
validSegmentStoryboard.narrationWordCount =
  validSegmentStoryboard.scenes
    .map((scene) => scene.narration)
    .join(" ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;

const validSegmentResult =
  validateStoryboard(
    validSegmentStoryboard,
    {
      imageCount: 2
    }
  );

if (!validSegmentResult.ok) {
  throw new Error(
    `Expected valid caption segments to pass: ${validSegmentResult.errors.join(" | ")}`
  );
}

console.log(
  "PASS: 1-3 caption segments accepted."
);

const missingSegmentStoryboard =
  structuredClone(validStoryboard);

delete missingSegmentStoryboard.scenes[0]
  .captionSegments;

const missingSegmentResult =
  validateStoryboard(
    missingSegmentStoryboard,
    {
      imageCount: 2
    }
  );

if (missingSegmentResult.ok) {
  throw new Error(
    "Expected missing captionSegments to fail in strict mode."
  );
}

console.log(
  "PASS: Missing captionSegments rejected by default."
);

const legacySegmentResult =
  validateStoryboard(
    missingSegmentStoryboard,
    {
      imageCount: 2,
      allowLegacyMissingEmphasis: true
    }
  );

if (!legacySegmentResult.ok) {
  throw new Error(
    `Expected legacy storyboard without captionSegments to pass: ${legacySegmentResult.errors.join(" | ")}`
  );
}

console.log(
  "PASS: Legacy storyboard without captionSegments accepted."
);

const tooManySegmentsStoryboard =
  structuredClone(validStoryboard);

tooManySegmentsStoryboard.scenes[0]
  .captionSegments = [
    {
      text: "One",
      emphasisWords: ["One"]
    },
    {
      text: "Two",
      emphasisWords: ["Two"]
    },
    {
      text: "Three",
      emphasisWords: ["Three"]
    },
    {
      text: "Four",
      emphasisWords: ["Four"]
    }
  ];

const tooManySegmentsResult =
  validateStoryboard(
    tooManySegmentsStoryboard,
    {
      imageCount: 2
    }
  );

if (tooManySegmentsResult.ok) {
  throw new Error(
    "Expected more than 3 caption segments to fail."
  );
}

console.log(
  "PASS: More than 3 caption segments rejected."
);

const invalidSegmentEmphasisStoryboard =
  structuredClone(validStoryboard);

invalidSegmentEmphasisStoryboard.scenes[0]
  .captionSegments = [
    {
      text: "Great coffee.",
      emphasisWords: ["SALE"]
    }
  ];

const invalidSegmentEmphasisResult =
  validateStoryboard(
    invalidSegmentEmphasisStoryboard,
    {
      imageCount: 2
    }
  );

if (invalidSegmentEmphasisResult.ok) {
  throw new Error(
    "Expected caption-segment emphasis outside its text to fail."
  );
}

console.log(
  "PASS: Caption-segment emphasis must occur in segment text."
);

const longSegmentStoryboard =
  structuredClone(validStoryboard);

longSegmentStoryboard.scenes[0]
  .captionSegments = [
    {
      text: "x".repeat(61),
      emphasisWords: ["x"]
    }
  ];

const longSegmentResult =
  validateStoryboard(
    longSegmentStoryboard,
    {
      imageCount: 2
    }
  );

if (longSegmentResult.ok) {
  throw new Error(
    "Expected caption segment over 60 characters to fail."
  );
}

console.log(
  "PASS: Caption segment over 60 characters rejected."
);
// --- v1.1.8.27 caption-segment consistency tests ---

const mismatchedNarrationStoryboard =
  structuredClone(validStoryboard);

mismatchedNarrationStoryboard.scenes[0]
  .captionSegments = [
    {
      text: "Great coffee.",
      emphasisWords: ["Great coffee"]
    },
    {
      text: "Anywhere.",
      emphasisWords: ["Anywhere"]
    }
  ];

mismatchedNarrationStoryboard.scenes[0]
  .narration =
    "Different spoken narration.";

const mismatchedNarrationResult =
  validateStoryboard(
    mismatchedNarrationStoryboard,
    {
      imageCount: 2
    }
  );

if (mismatchedNarrationResult.ok) {
  throw new Error(
    "Expected narration differing from caption segments to fail."
  );
}

console.log(
  "PASS: Narration must equal ordered caption segments."
);

const mismatchedCaptionStoryboard =
  structuredClone(validStoryboard);

mismatchedCaptionStoryboard.scenes[0]
  .caption =
    "Different compatibility caption.";

const mismatchedCaptionResult =
  validateStoryboard(
    mismatchedCaptionStoryboard,
    {
      imageCount: 2
    }
  );

if (mismatchedCaptionResult.ok) {
  throw new Error(
    "Expected compatibility caption differing from first segment to fail."
  );
}

console.log(
  "PASS: Compatibility caption must equal first segment."
);

const mismatchedCompatibilityEmphasisStoryboard =
  structuredClone(validStoryboard);

mismatchedCompatibilityEmphasisStoryboard.scenes[0]
  .emphasisWords = [
    "travel"
  ];

const mismatchedCompatibilityEmphasisResult =
  validateStoryboard(
    mismatchedCompatibilityEmphasisStoryboard,
    {
      imageCount: 2
    }
  );

if (mismatchedCompatibilityEmphasisResult.ok) {
  throw new Error(
    "Expected compatibility emphasis differing from first segment to fail."
  );
}

console.log(
  "PASS: Compatibility emphasis must equal first segment emphasis."
);
// --- v0.9.4 duration-limit boundary tests ---


// --- v1.1.9.12 ordered product scene tests ---

const orderedTwoImageStoryboard =
  structuredClone(validStoryboard);

const orderedTwoImageResult =
  validateStoryboard(
    orderedTwoImageStoryboard,
    {
      imageCount: 2
    }
  );

if (!orderedTwoImageResult.ok) {
  throw new Error(
    `Expected ordered 2-image sequence 1,1,2,2 to pass: ${orderedTwoImageResult.errors.join(" | ")}`
  );
}

console.log(
  "PASS: Ordered 2-image sequence 1,1,2,2 accepted."
);

const backwardTwoImageStoryboard =
  structuredClone(validStoryboard);

backwardTwoImageStoryboard.scenes[0].imageIndex = 1;
backwardTwoImageStoryboard.scenes[1].imageIndex = 2;
backwardTwoImageStoryboard.scenes[2].imageIndex = 1;
backwardTwoImageStoryboard.scenes[3].imageIndex = 2;

const backwardTwoImageResult =
  validateStoryboard(
    backwardTwoImageStoryboard,
    {
      imageCount: 2
    }
  );

if (backwardTwoImageResult.ok) {
  throw new Error(
    "Expected backward 2-image sequence 1,2,1,2 to fail."
  );
}

if (
  !backwardTwoImageResult.errors.some(
    (error) =>
      error.includes(
        "must not return to an earlier uploaded image"
      )
  )
) {
  throw new Error(
    `Expected backward-order validation error: ${backwardTwoImageResult.errors.join(" | ")}`
  );
}

console.log(
  "PASS: Backward 2-image sequence 1,2,1,2 rejected."
);

const alternateThreeImageStoryboard =
  structuredClone(validStoryboard);

alternateThreeImageStoryboard.scenes[0].imageIndex = 1;
alternateThreeImageStoryboard.scenes[1].imageIndex = 2;
alternateThreeImageStoryboard.scenes[2].imageIndex = 2;
alternateThreeImageStoryboard.scenes[3].imageIndex = 3;

const alternateThreeImageResult =
  validateStoryboard(
    alternateThreeImageStoryboard,
    {
      imageCount: 3
    }
  );

if (!alternateThreeImageResult.ok) {
  throw new Error(
    `Expected monotonic 3-image sequence 1,2,2,3 to pass: ${alternateThreeImageResult.errors.join(" | ")}`
  );
}

console.log(
  "PASS: Monotonic 3-image sequence 1,2,2,3 accepted."
);

const fiveImageStoryboard =
  structuredClone(validStoryboard);

const fiveImageContentScenes =
  fiveImageStoryboard.scenes
    .slice(0, 4)
    .map((scene) => structuredClone(scene));

const fifthProductScene =
  structuredClone(
    fiveImageStoryboard.scenes[3]
  );

const fiveImageCtaScene =
  structuredClone(
    fiveImageStoryboard.scenes[4]
  );

fiveImageStoryboard.scenes = [
  ...fiveImageContentScenes,
  fifthProductScene,
  fiveImageCtaScene
];

fiveImageStoryboard.scenes.forEach(
  (scene, index) => {
    scene.sceneNumber = index + 1;
    scene.startSeconds = index * 5;
    scene.endSeconds = (index + 1) * 5;
  }
);

fiveImageStoryboard.totalDurationSeconds = 30;

fiveImageStoryboard.narrationWordCount =
  fiveImageStoryboard.scenes
    .map((scene) => scene.narration)
    .join(" ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;

for (let index = 0; index < 5; index += 1) {
  fiveImageStoryboard.scenes[index].imageIndex =
    index + 1;

  if (
    fiveImageStoryboard.scenes[index].role ===
    "cta"
  ) {
    fiveImageStoryboard.scenes[index].role =
      "benefit";
  }
}

fiveImageStoryboard.scenes[5].role = "cta";
fiveImageStoryboard.scenes[5].imageIndex = 1;

const fiveImageResult =
  validateStoryboard(
    fiveImageStoryboard,
    {
      imageCount: 5
    }
  );

if (!fiveImageResult.ok) {
  throw new Error(
    `Expected 5 product images plus dedicated CTA to pass: ${fiveImageResult.errors.join(" | ")}`
  );
}

console.log(
  "PASS: Five images use scenes 1,2,3,4,5 plus dedicated CTA."
);

const fiveImageMissingContentStoryboard =
  structuredClone(fiveImageStoryboard);

fiveImageMissingContentStoryboard.scenes[4].imageIndex =
  4;

const fiveImageMissingContentResult =
  validateStoryboard(
    fiveImageMissingContentStoryboard,
    {
      imageCount: 5
    }
  );

if (fiveImageMissingContentResult.ok) {
  throw new Error(
    "Expected image 5 missing from non-CTA scenes to fail."
  );
}

if (
  !fiveImageMissingContentResult.errors.some(
    (error) =>
      error.includes(
        "Uploaded image 5 is not used by any non-CTA scene."
      )
  )
) {
  throw new Error(
    `Expected non-CTA image coverage error: ${fiveImageMissingContentResult.errors.join(" | ")}`
  );
}

console.log(
  "PASS: CTA structural imageIndex cannot satisfy product-image coverage."
);

const fiveImageFiveSceneStoryboard =
  structuredClone(validStoryboard);

fiveImageFiveSceneStoryboard.scenes[0].imageIndex = 1;
fiveImageFiveSceneStoryboard.scenes[1].imageIndex = 2;
fiveImageFiveSceneStoryboard.scenes[2].imageIndex = 3;
fiveImageFiveSceneStoryboard.scenes[3].imageIndex = 4;
fiveImageFiveSceneStoryboard.scenes[4].imageIndex = 5;

const fiveImageFiveSceneResult =
  validateStoryboard(
    fiveImageFiveSceneStoryboard,
    {
      imageCount: 5
    }
  );

if (fiveImageFiveSceneResult.ok) {
  throw new Error(
    "Expected five uploaded images with only five total scenes to fail."
  );
}

console.log(
  "PASS: Five uploaded images require six total scenes including CTA."
);
function storyboardWithDuration(seconds) {
  const copy = structuredClone(validStoryboard);
  const sceneCount = copy.scenes.length;
  const baseDuration = Math.floor(seconds / sceneCount);
  let startSeconds = 0;

  copy.scenes.forEach((scene, index) => {
    scene.startSeconds = startSeconds;
    scene.endSeconds =
      index === sceneCount - 1
        ? seconds
        : startSeconds + baseDuration;
    startSeconds = scene.endSeconds;
  });

  copy.totalDurationSeconds = seconds;
  return copy;
}

const thirtySecondResult =
  validateStoryboard(
    storyboardWithDuration(30),
    {
      imageCount: 2
    }
  );

if (!thirtySecondResult.ok) {
  throw new Error(
    `Expected default validator to accept 30 seconds: ${thirtySecondResult.errors.join(" ")}`
  );
}

console.log("PASS: 30-second default storyboard accepted.");

const sixtySecondDefaultResult =
  validateStoryboard(
    storyboardWithDuration(60),
    {
      imageCount: 2
    }
  );

if (sixtySecondDefaultResult.ok) {
  throw new Error(
    "Expected default validator to reject 60 seconds."
  );
}

console.log("PASS: 60-second storyboard rejected by default.");

const sixtySecondPaidResult =
  validateStoryboard(
    storyboardWithDuration(60),
    {
      imageCount: 2,
      maxDurationSeconds: 60
    }
  );

if (!sixtySecondPaidResult.ok) {
  throw new Error(
    `Expected paid validator to accept 60 seconds: ${sixtySecondPaidResult.errors.join(" ")}`
  );
}

console.log("PASS: 60-second paid storyboard accepted.");

const overSixtyResult =
  validateStoryboard(
    storyboardWithDuration(61),
    {
      imageCount: 2,
      maxDurationSeconds: 60
    }
  );

if (overSixtyResult.ok) {
  throw new Error(
    "Expected validator to reject a storyboard over 60 seconds."
  );
}

console.log("PASS: Storyboard over 60 seconds rejected.");

// --- v1.0.1 duration-target regression tests ---

function assertDurationTargetBoundary({
  tier,
  minDurationSeconds,
  rejectedBelow,
  acceptedMinimum
}) {
  const belowResult =
    validateStoryboard(
      storyboardWithDuration(
        rejectedBelow
      ),
      {
        imageCount: 2,
        minDurationSeconds,
        maxDurationSeconds: tier
      }
    );

  if (belowResult.ok) {
    throw new Error(
      `Expected ${rejectedBelow} seconds to be rejected for the ${tier}-second tier.`
    );
  }

  const minimumResult =
    validateStoryboard(
      storyboardWithDuration(
        acceptedMinimum
      ),
      {
        imageCount: 2,
        minDurationSeconds,
        maxDurationSeconds: tier
      }
    );

  if (!minimumResult.ok) {
    throw new Error(
      `Expected ${acceptedMinimum} seconds to be accepted for the ${tier}-second tier: ${minimumResult.errors.join(" ")}`
    );
  }

  const maximumResult =
    validateStoryboard(
      storyboardWithDuration(
        tier
      ),
      {
        imageCount: 2,
        minDurationSeconds,
        maxDurationSeconds: tier
      }
    );

  if (!maximumResult.ok) {
    throw new Error(
      `Expected ${tier} seconds to be accepted for the ${tier}-second tier: ${maximumResult.errors.join(" ")}`
    );
  }

  console.log(
    `PASS: ${tier}-second tier requires ${minDurationSeconds}-${tier} seconds.`
  );
}

assertDurationTargetBoundary({
  tier: 30,
  minDurationSeconds: 27,
  rejectedBelow: 26,
  acceptedMinimum: 27
});

assertDurationTargetBoundary({
  tier: 45,
  minDurationSeconds: 41,
  rejectedBelow: 40,
  acceptedMinimum: 41
});

assertDurationTargetBoundary({
  tier: 60,
  minDurationSeconds: 55,
  rejectedBelow: 54,
  acceptedMinimum: 55
});

const shortSixtySecondTierResult =
  validateStoryboard(
    storyboardWithDuration(25),
    {
      imageCount: 2,
      minDurationSeconds: 55,
      maxDurationSeconds: 60
    }
  );

if (shortSixtySecondTierResult.ok) {
  throw new Error(
    "Regression: 25-second storyboard must not pass the 60-second tier."
  );
}

console.log(
  "PASS: 25-second storyboard rejected for the 60-second tier."
);
// --- v0.9.4 narration-limit boundary tests ---

function storyboardWithWordCount(seconds, wordCount) {
  const copy = storyboardWithDuration(seconds);
  const words =
    Array.from(
      { length: wordCount },
      () => "a"
    );

  const sceneCount = copy.scenes.length;
  const baseWords = Math.floor(wordCount / sceneCount);
  let wordIndex = 0;

  copy.scenes.forEach((scene, index) => {
    const count =
      index === sceneCount - 1
        ? wordCount - wordIndex
        : baseWords;

    const text =
      words
        .slice(wordIndex, wordIndex + count)
        .join(" ");

    scene.caption = text;
    scene.emphasisWords = ["a"];
    scene.captionSegments = [
      {
        text,
        emphasisWords: ["a"]
      }
    ];
    scene.narration = text;
    wordIndex += count;
  });

  copy.narrationWordCount = wordCount;
  return copy;
}


function assertNarrationBoundary({
  seconds,
  maxDurationSeconds,
  acceptedWords,
  rejectedWords
}) {
  const acceptedResult =
    validateStoryboard(
      storyboardWithWordCount(
        seconds,
        acceptedWords
      ),
      {
        imageCount: 2,
        maxDurationSeconds
      }
    );

  if (!acceptedResult.ok) {
    throw new Error(
      `Expected ${acceptedWords} narration words to be accepted for ${maxDurationSeconds} seconds: ${acceptedResult.errors.join(" ")}`
    );
  }

  const rejectedResult =
    validateStoryboard(
      storyboardWithWordCount(
        seconds,
        rejectedWords
      ),
      {
        imageCount: 2,
        maxDurationSeconds
      }
    );

  if (rejectedResult.ok) {
    throw new Error(
      `Expected ${rejectedWords} narration words to be rejected for ${maxDurationSeconds} seconds.`
    );
  }

  console.log(
    `PASS: ${maxDurationSeconds}-second narration limit is ${acceptedWords} words.`
  );
}

assertNarrationBoundary({
  seconds: 30,
  maxDurationSeconds: 30,
  acceptedWords: 65,
  rejectedWords: 66
});

assertNarrationBoundary({
  seconds: 45,
  maxDurationSeconds: 45,
  acceptedWords: 95,
  rejectedWords: 96
});

assertNarrationBoundary({
  seconds: 60,
  maxDurationSeconds: 60,
  acceptedWords: 125,
  rejectedWords: 126
});
