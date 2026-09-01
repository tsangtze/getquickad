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
      motion: "slow-zoom-in",
      transition: "cut"
    },
    {
      sceneNumber: 2,
      startSeconds: 4,
      endSeconds: 9,
      imageIndex: 2,
      role: "product",
      narration:
        "Meet the compact rechargeable coffee maker designed for life on the move.",
      caption: "Compact and rechargeable",
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
      motion: "slow-zoom-out",
      transition: "fade"
    },
    {
      sceneNumber: 4,
      startSeconds: 15,
      endSeconds: 20,
      imageIndex: 1,
      role: "benefit",
      narration:
        "Simple controls make every cup quick and convenient.",
      caption: "Simple. Quick. Convenient.",
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
      motion: "slow-zoom-in",
      transition: "fade"
    }
  ],
  cta: {
    text: "Shop Now",
    website: "mycoffee.com"
  }
};

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

// --- v0.9.4 duration-limit boundary tests ---

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
    scene.narration = text;
    wordIndex += count;
  });

  copy.narrationWordCount = wordCount;
  return copy;
}

const fiftyOneWordDefaultResult =
  validateStoryboard(
    storyboardWithWordCount(30, 51),
    {
      imageCount: 2
    }
  );

if (fiftyOneWordDefaultResult.ok) {
  throw new Error(
    "Expected default validator to reject 51 narration words."
  );
}

console.log("PASS: 51-word default narration rejected.");

const fiftyOneWordPaidResult =
  validateStoryboard(
    storyboardWithWordCount(60, 51),
    {
      imageCount: 2,
      maxDurationSeconds: 60
    }
  );

if (!fiftyOneWordPaidResult.ok) {
  throw new Error(
    `Expected paid validator to accept 51 narration words: ${fiftyOneWordPaidResult.errors.join(" ")}`
  );
}

console.log("PASS: 51-word paid narration accepted.");
