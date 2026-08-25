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
