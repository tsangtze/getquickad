import {
  countSceneEditUnits,
  findSceneExceedingAiOriginal,
  usesCharacterBasedSceneEditLimit
} from "../sceneEditLimit.mjs";

function requireContract(
  condition,
  message
) {
  if (!condition) {
    throw new Error(message);
  }
}

function scene(
  sceneNumber,
  narration
) {
  return {
    sceneNumber,
    narration
  };
}

// ------------------------------------------------------------
// ORIGINAL TEXT SELECTS COUNTING MODE
// ------------------------------------------------------------

requireContract(
  !usesCharacterBasedSceneEditLimit(
    "Make every morning brighter today"
  ),
  "Latin-heavy AI original must use word counting."
);

requireContract(
  usesCharacterBasedSceneEditLimit(
    "每天轻松开始"
  ),
  "CJK-heavy AI original must use character counting."
);

requireContract(
  usesCharacterBasedSceneEditLimit(
    "每天 AI 轻松开始"
  ),
  "Mixed text that is at least 50% CJK letters/numbers must use character counting."
);

requireContract(
  !usesCharacterBasedSceneEditLimit(
    "QuickAd AI makes 视频 easy today"
  ),
  "Mixed text below 50% CJK letters/numbers must use word counting."
);

console.log(
  "PASS: AI-original text selects edit-limit counting mode."
);

// ------------------------------------------------------------
// WORD MODE
// ------------------------------------------------------------

requireContract(
  countSceneEditUnits(
    "Make   every morning brighter today!",
    false
  ) === 5,
  "Word mode must use whitespace-delimited words."
);

const originalEnglish = [
  scene(
    1,
    "Make every morning brighter today"
  )
];

requireContract(
  findSceneExceedingAiOriginal({
    originalScenes:
      originalEnglish,
    editedScenes: [
      scene(
        1,
        "Start each new morning happier"
      )
    ]
  }) === null,
  "Same-word-count edit must be accepted."
);

requireContract(
  findSceneExceedingAiOriginal({
    originalScenes:
      originalEnglish,
    editedScenes: [
      scene(
        1,
        "Make mornings brighter now"
      )
    ]
  }) === null,
  "Shorter word-count edit must be accepted."
);

const englishOverflow =
  findSceneExceedingAiOriginal({
    originalScenes:
      originalEnglish,
    editedScenes: [
      scene(
        1,
        "Make every single morning much brighter"
      )
    ]
  });

requireContract(
  englishOverflow?.sceneNumber === 1,
  "Edit above AI-original word allowance must be rejected."
);

console.log(
  "PASS: word-based AI-original allowance enforced."
);

// ------------------------------------------------------------
// CHARACTER MODE
// ------------------------------------------------------------

const chinesePlain =
  "每天轻松开始";

const chineseDecorated =
  "每 天，轻松！开始。";

requireContract(
  countSceneEditUnits(
    chinesePlain,
    true
  ) ===
    countSceneEditUnits(
      chineseDecorated,
      true
    ),
  "Character mode must exclude punctuation and spaces."
);

const originalChinese = [
  scene(
    1,
    "每天轻松开始"
  )
];

requireContract(
  findSceneExceedingAiOriginal({
    originalScenes:
      originalChinese,
    editedScenes: [
      scene(
        1,
        "每 天，快乐开始！"
      )
    ]
  }) === null,
  "Equal CJK letter/number count must be accepted."
);

const chineseOverflow =
  findSceneExceedingAiOriginal({
    originalScenes:
      originalChinese,
    editedScenes: [
      scene(
        1,
        "每天都能轻松开始"
      )
    ]
  });

requireContract(
  chineseOverflow?.sceneNumber === 1,
  "CJK edit above AI-original letter/number allowance must be rejected."
);

console.log(
  "PASS: character-based AI-original allowance enforced."
);

// ------------------------------------------------------------
// ORIGINAL TEXT, NOT PROJECT LANGUAGE, IS AUTHORITY
// ------------------------------------------------------------

const mixedOriginal = [
  scene(
    1,
    "每天 AI 轻松开始"
  )
];

const mixedSameCount = [
  scene(
    1,
    "今天 AI 快乐出发"
  )
];

requireContract(
  findSceneExceedingAiOriginal({
    originalScenes:
      mixedOriginal,
    editedScenes:
      mixedSameCount
  }) === null,
  "Mixed CJK-heavy scene must follow its own original text rather than project language."
);

console.log(
  "PASS: original scene text is the counting authority."
);

// ------------------------------------------------------------
// SCENE NUMBER AUTHORITY
// ------------------------------------------------------------

const numberedOriginal = [
  scene(1, "one two three"),
  scene(2, "one two three four five")
];

const reorderedEdited = [
  scene(2, "alpha beta gamma delta epsilon"),
  scene(1, "alpha beta gamma")
];

requireContract(
  findSceneExceedingAiOriginal({
    originalScenes:
      numberedOriginal,
    editedScenes:
      reorderedEdited
  }) === null,
  "Limits must match by sceneNumber rather than array position."
);

const missingOriginal =
  findSceneExceedingAiOriginal({
    originalScenes: [
      scene(1, "one two three")
    ],
    editedScenes: [
      scene(2, "one two")
    ]
  });

requireContract(
  missingOriginal?.sceneNumber === 2,
  "Edited scene without matching AI original must be rejected."
);

console.log(
  "PASS: stable sceneNumber authority protected."
);

console.log(
  "PASS: Version 1.1.9.37 AI-original scene edit-limit contract protected."
);
