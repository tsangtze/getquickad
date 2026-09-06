import {
  __captionEmphasisTestHelpers
} from "../videoRenderer.mjs";

const {
  escapeAssText,
  buildAssCaptionText
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

console.log(
  "PASS: Caption emphasis ASS helper suite complete."
);
