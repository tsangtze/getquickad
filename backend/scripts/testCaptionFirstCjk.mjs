import {
  validateStoryboard
} from "../storyboardSchema.mjs";

const captions = [
  "轻松开启每一天",
  "简洁设计随身携带",
  "快速使用省时省力",
  "适合工作旅行日常",
  "现在开始体验便利"
];

const storyboard = {
  version: "1.0",
  title: "轻松生活",
  style: "Energetic",
  aspectRatio: "9:16",
  totalDurationSeconds: 30,
  narrationWordCount: 5,
  musicDirection:
    "Upbeat modern instrumental with a clean finish.",
  scenes: captions.map(
    (caption, index) => ({
      sceneNumber: index + 1,
      startSeconds: index * 6,
      endSeconds: (index + 1) * 6,
      imageIndex: 1,
      role:
        index === 0
          ? "hook"
          : index === 4
            ? "cta"
            : "benefit",
      narration: caption,
      caption,
      motion: "none",
      transition: "fade"
    })
  ),
  cta: {
    text: "立即体验",
    website: "example.com"
  }
};

const result =
  validateStoryboard(
    storyboard,
    {
      imageCount: 1,
      maxDurationSeconds: 30
    }
  );

if (!result.ok) {
  console.error(result.errors);

  throw new Error(
    "Short Chinese caption-first storyboard should validate."
  );
}

for (const scene of storyboard.scenes) {
  if (scene.caption !== scene.narration) {
    throw new Error(
      "Chinese narration must exactly equal its caption."
    );
  }
}

if (storyboard.narrationWordCount !== 5) {
  throw new Error(
    "Expected five whitespace-counted Chinese narration units."
  );
}

if (storyboard.narrationWordCount >= 9) {
  throw new Error(
    "Regression fixture must remain below the old 9-word minimum."
  );
}

console.log(
  "PASS: Chinese caption-first storyboard validates below the old 9-word minimum."
);

console.log(
  "PASS: Chinese caption and narration remain exactly identical."
);

console.log(
  "PASS: Version 1.1.7.1 protects short CJK caption-first narration."
);