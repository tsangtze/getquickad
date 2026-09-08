import {
  __captionEmphasisTestHelpers
} from "../videoRenderer.mjs";

const {
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
