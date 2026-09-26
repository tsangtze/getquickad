import {
  __captionEmphasisTestHelpers
} from "../videoRenderer.mjs";

const {
  wrapCjkCaption,
  escapeAssText,
  buildAssCaptionText,
  buildCaptionEvents,
  buildCaptionAss
} = __captionEmphasisTestHelpers;

function assertEqual(
  actual,
  expected,
  message
) {
  if (actual !== expected) {
    throw new Error(
      `${message}
Expected: ${expected}
Actual:   ${actual}`
    );
  }
}

function assertNear(
  actual,
  expected,
  tolerance,
  message
) {
  if (
    Math.abs(actual - expected) >
    tolerance
  ) {
    throw new Error(
      `${message}
Expected: ${expected}
Actual:   ${actual}`
    );
  }
}

function assertIncludes(
  source,
  fragment,
  message
) {
  if (!source.includes(fragment)) {
    throw new Error(
      `${message}
Missing: ${fragment}`
    );
  }
}

assertEqual(
  buildAssCaptionText(
    "Great coffee. Anywhere.",
    []
  ),
  "Great coffee. Anywhere.",
  "Legacy captions must remain plain white text."
);

console.log(
  "PASS: Legacy caption remains untagged."
);

assertEqual(
  buildAssCaptionText(
    "Great coffee. Anywhere.",
    ["Great coffee", "Anywhere"]
  ),
  "{\\c&H0000FFFF&}Great coffee{\\c&H00FFFFFF&}. {\\c&H0000FFFF&}Anywhere{\\c&H00FFFFFF&}.",
  "English emphasis must receive yellow ASS tags."
);

console.log(
  "PASS: English emphasis receives yellow tags."
);

assertEqual(
  buildAssCaptionText(
    "快速使用省时省力",
    ["省时省力"]
  ),
  "快速使用{\\c&H0000FFFF&}省时省力{\\c&H00FFFFFF&}",
  "CJK emphasis must work without word boundaries."
);

console.log(
  "PASS: CJK emphasis receives yellow tags."
);

assertEqual(
  wrapCjkCaption(
    "几分钟内就能让您的产品讲出自己的故事",
    "zh"
  ),
  "几分钟内就能让您的\n产品讲出自己的故事",
  "Long Chinese captions must wrap into two balanced lines."
);

assertEqual(
  wrapCjkCaption(
    "快速使用省时省力",
    "zh"
  ),
  "快速使用省时省力",
  "Short Chinese captions must remain on one line."
);

assertIncludes(
  escapeAssText("第一行\n第二行"),
  "\\N",
  "Caption newlines must become ASS line breaks."
);

console.log(
  "PASS: Long CJK captions wrap safely into two lines."
);

assertEqual(
  buildAssCaptionText(
    "Fast Fast Fast",
    ["Fast"]
  ),
  "{\\c&H0000FFFF&}Fast{\\c&H00FFFFFF&} {\\c&H0000FFFF&}Fast{\\c&H00FFFFFF&} {\\c&H0000FFFF&}Fast{\\c&H00FFFFFF&}",
  "Repeated exact emphasis must highlight each occurrence."
);

console.log(
  "PASS: Repeated emphasis is deterministic."
);

assertEqual(
  escapeAssText("Use {this} \\ path"),
  "Use \\{this\\} \\\\ path",
  "ASS control characters must be escaped deterministically."
);

console.log(
  "PASS: ASS control characters are escaped."
);

const legacyEvents =
  buildCaptionEvents({
    caption: "Legacy caption",
    emphasisWords: [],
    durationSeconds: 12
  });

assertEqual(
  legacyEvents.length,
  1,
  "Legacy caption must create one event."
);

assertNear(
  legacyEvents[0].startSeconds,
  0,
  0.001,
  "Legacy caption must begin at zero."
);

assertNear(
  legacyEvents[0].endSeconds,
  12,
  0.001,
  "Legacy caption must remain for full scene."
);

console.log(
  "PASS: Legacy single-caption timing preserved."
);

const equalEvents =
  buildCaptionEvents({
    captionSegments: [
      {
        text: "AAAA",
        emphasisWords: ["AAAA"]
      },
      {
        text: "BBBB",
        emphasisWords: ["BBBB"]
      },
      {
        text: "CCCC",
        emphasisWords: ["CCCC"]
      }
    ],
    durationSeconds: 12,
    spokenDurationSeconds: 9
  });

assertEqual(
  equalEvents.length,
  3,
  "Three segments must create three events."
);

assertNear(
  equalEvents[0].endSeconds,
  3,
  0.001,
  "First equal segment should end at 3 seconds."
);

assertNear(
  equalEvents[1].startSeconds,
  3,
  0.001,
  "Second segment should begin at first boundary."
);

assertNear(
  equalEvents[1].endSeconds,
  6,
  0.001,
  "Second equal segment should end at 6 seconds."
);

assertNear(
  equalEvents[2].startSeconds,
  6,
  0.001,
  "Final segment should begin at second boundary."
);

assertNear(
  equalEvents[2].endSeconds,
  12,
  0.001,
  "Final segment must remain through scene end."
);

console.log(
  "PASS: Equal sequential segments follow measured speech."
);

const weightedEvents =
  buildCaptionEvents({
    captionSegments: [
      {
        text: "AA",
        emphasisWords: ["AA"]
      },
      {
        text: "BBBB",
        emphasisWords: ["BBBB"]
      },
      {
        text: "CCCCCC",
        emphasisWords: ["CCCCCC"]
      }
    ],
    durationSeconds: 12,
    spokenDurationSeconds: 9
  });

assertNear(
  weightedEvents[0].endSeconds,
  1.5,
  0.001,
  "Short first phrase must receive proportional speech time."
);

assertNear(
  weightedEvents[1].endSeconds,
  4.5,
  0.001,
  "Second boundary must use cumulative text weight."
);

assertNear(
  weightedEvents[2].endSeconds,
  12,
  0.001,
  "Weighted final phrase must remain through scene end."
);

console.log(
  "PASS: Unequal segments use proportional text timing."
);

const clampedEvents =
  buildCaptionEvents({
    captionSegments: [
      {
        text: "AAAA",
        emphasisWords: ["AAAA"]
      },
      {
        text: "BBBB",
        emphasisWords: ["BBBB"]
      }
    ],
    durationSeconds: 10,
    spokenDurationSeconds: 20
  });

assertNear(
  clampedEvents[0].endSeconds,
  5,
  0.001,
  "Speech duration must be clamped to scene duration."
);

assertNear(
  clampedEvents[1].endSeconds,
  10,
  0.001,
  "Clamped final caption must end with scene."
);

console.log(
  "PASS: Speech duration is clamped to scene duration."
);

const cjkEvents =
  buildCaptionEvents({
    captionSegments: [
      {
        text: "快速",
        emphasisWords: ["快速"]
      },
      {
        text: "使用省时省力",
        emphasisWords: ["省时省力"]
      }
    ],
    durationSeconds: 10,
    spokenDurationSeconds: 8
  });

assertNear(
  cjkEvents[0].endSeconds,
  2,
  0.001,
  "CJK timing must use Unicode character weighting."
);

assertNear(
  cjkEvents[1].endSeconds,
  10,
  0.001,
  "CJK final segment must remain through scene end."
);

console.log(
  "PASS: CJK sequential timing works without whitespace."
);

const fallbackEvents =
  buildCaptionEvents({
    captionSegments: [
      {
        text: "AAAA",
        emphasisWords: ["AAAA"]
      },
      {
        text: "BBBB",
        emphasisWords: ["BBBB"]
      }
    ],
    durationSeconds: 8
  });

assertNear(
  fallbackEvents[0].endSeconds,
  4,
  0.001,
  "Missing speech metadata must fall back to full scene timing."
);

assertNear(
  fallbackEvents[1].endSeconds,
  8,
  0.001,
  "Fallback final segment must end with scene."
);

console.log(
  "PASS: Missing speech metadata has deterministic fallback."
);

const segmentedAss =
  buildCaptionAss({
    captionSegments: [
      {
        text: "Coffee!!",
        emphasisWords: ["Coffee"]
      },
      {
        text: "Anywhere",
        emphasisWords: ["Anywhere"]
      }
    ],
    durationSeconds: 10,
    spokenDurationSeconds: 8,
    language: "en"
  });

assertIncludes(
  segmentedAss,
  "Dialogue: 0,0:00:00.00,0:00:04.00",
  "First timed ASS event must use calculated boundary."
);

assertIncludes(
  segmentedAss,
  "Dialogue: 0,0:00:04.00,0:00:10.00",
  "Final timed ASS event must remain through scene end."
);

assertIncludes(
  segmentedAss,
  "{\\c&H0000FFFF&}Coffee{\\c&H00FFFFFF&}",
  "Timed segment must preserve semantic emphasis."
);

console.log(
  "PASS: Timed ASS output preserves emphasis and boundaries."
);

console.log(
  "PASS: Caption emphasis and sequential ASS timing suite complete."
);
const wrappedAss =
  buildCaptionAss({
    captionSegments: [
      {
        text:
          "The front suspension adds to its rugged appearance.",
        emphasisWords:
          ["front suspension", "rugged"]
      }
    ],
    durationSeconds: 12,
    spokenDurationSeconds: 9,
    language: "en"
  });

assertIncludes(
  wrappedAss,
  "WrapStyle: 0",
  "ASS captions must use smart wrapping inside video margins."
);

assertIncludes(
  wrappedAss,
  "MarginL, MarginR, MarginV",
  "Caption style must retain explicit safe-area margins."
);

assertIncludes(
  wrappedAss,
  "{\\c&H0000FFFF&}front suspension{\\c&H00FFFFFF&}",
  "Smart wrapping must preserve first semantic emphasis."
);

assertIncludes(
  wrappedAss,
  "{\\c&H0000FFFF&}rugged{\\c&H00FFFFFF&}",
  "Smart wrapping must preserve second semantic emphasis."
);

console.log(
  "PASS: Smart ASS wrapping preserves margins and semantic emphasis."
);

function captionAssForLanguage(language) {
  return buildCaptionAss({
    caption: "Caption size test",
    emphasisWords: [],
    durationSeconds: 5,
    language
  });
}

const captionSizeCases = [
  ["en", 40, "Latin"],
  ["zh", 70, "Chinese"],
  ["ja", 70, "Japanese"],
  ["ko", 70, "Korean"],
  ["hi", 80, "Hindi"],
  ["ar", 85, "Arabic"]
];

for (const [
  language,
  expectedSize,
  label
] of captionSizeCases) {
  const ass =
    captionAssForLanguage(language);

  const captionStyle =
    ass
      .split(/\r?\n/)
      .find((line) =>
        line.startsWith("Style: Caption,")
      );

  if (!captionStyle) {
    throw new Error(
      `${label} caption style was not generated.`
    );
  }

  const fields =
    captionStyle.split(",");

  assertEqual(
    Number(fields[2]),
    expectedSize,
    `${label} caption font size must be ${expectedSize}.`
  );
}

console.log(
  "PASS: Script-aware caption font sizes are 40 Latin, 70 CJK, 80 Hindi, and 85 Arabic."
);

const singleLineCjkAss =
  buildCaptionAss({
    caption: "上传产品照片，最多十张",
    emphasisWords: [],
    durationSeconds: 5,
    language: "zh"
  });

assertIncludes(
  singleLineCjkAss,
  "Caption,,0,0,150,,",
  "Single-line CJK captions must use the centered vertical position."
);

const twoLineCjkAss =
  buildCaptionAss({
    caption: "几分钟内就能让您的产品讲出自己的故事",
    emphasisWords: [],
    durationSeconds: 5,
    language: "zh"
  });

assertIncludes(
  twoLineCjkAss,
  "Caption,,0,0,0,,",
  "Two-line CJK captions must keep the existing vertical position."
);

const singleLineLatinAss =
  buildCaptionAss({
    caption: "Upload your product photos",
    emphasisWords: [],
    durationSeconds: 5,
    language: "en"
  });

assertIncludes(
  singleLineLatinAss,
  "Caption,,0,0,0,,",
  "Latin captions must keep their existing vertical position."
);

console.log(
  "PASS: Single-line CJK moves upward while two-line CJK and Latin captions stay unchanged."
);

const singleLineArabicAss =
  buildCaptionAss({
    caption: "حوّل صورك إلى فيديو",
    emphasisWords: [],
    durationSeconds: 5,
    language: "ar"
  });

assertIncludes(
  singleLineArabicAss,
  "Caption,,0,0,0,,",
  "Single-line Arabic captions must keep the existing vertical position."
);

const twoLineArabicAss =
  buildCaptionAss({
    caption: "جاهز للفيديو كل منتج حوّل\nعلى مواقع التواصل للنشر",
    emphasisWords: [],
    durationSeconds: 5,
    language: "ar"
  });

assertIncludes(
  twoLineArabicAss,
  "Caption,,0,0,70,,",
  "Two-line Arabic captions must move downward inside the caption panel."
);

console.log(
  "PASS: Two-line Arabic moves downward while single-line Arabic stays unchanged."
);
