import fs from "node:fs/promises";

const storyboardSource =
  await fs.readFile(
    new URL(
      "../storyboardGenerator.mjs",
      import.meta.url
    ),
    "utf8"
  );

const routeSource =
  await fs.readFile(
    new URL(
      "../projectRoutes.mjs",
      import.meta.url
    ),
    "utf8"
  );

const frontendSource =
  await fs.readFile(
    new URL(
      "../../Frontend/app.js",
      import.meta.url
    ),
    "utf8"
  );

function requireContract(
  condition,
  message
) {
  if (!condition) {
    throw new Error(message);
  }
}

requireContract(
  storyboardSource.includes(
    "SEQUENTIAL CAPTION RULE"
  ),
  "Storyboard prompt must require sequential captions."
);

requireContract(
  storyboardSource.includes(
    "complete scene narration must be exactly the caption segment texts joined in order"
  ),
  "Storyboard prompt must require narration to equal ordered caption segments."
);

requireContract(
  storyboardSource.includes(
    "caption exactly equal to captionSegments[0].text"
  ),
  "Storyboard prompt must preserve the compatibility caption field."
);

requireContract(
  storyboardSource.includes(
    "scene-level emphasisWords exactly equal to captionSegments[0].emphasisWords"
  ),
  "Storyboard prompt must preserve compatibility emphasis."
);

requireContract(
  !storyboardSource.includes(
    "narration must be exactly identical to caption"
  ),
  "Old single-caption narration contract must be removed."
);

requireContract(
  routeSource.includes(
    "const hasCaptionSegments ="
  ) &&
    routeSource.includes(
      "scene.captionSegments.length > 0"
    ),
  "Finalize must detect segmented storyboards."
);

requireContract(
  routeSource.includes(
    "captionSegments.map("
  ) &&
    routeSource.includes(
      '.join(" ")'
    ),
  "Finalize must rebuild narration from ordered caption segments."
);

requireContract(
  /caption:\s*firstSegment\.text/.test(
    routeSource
  ) &&
    /emphasisWords:\s*\[\s*\.\.\.firstSegment\.emphasisWords\s*\]/.test(
      routeSource
    ),
  "Finalize must rebuild compatibility caption and emphasis from the first segment."
);

requireContract(
  /const caption\s*=\s*\r?\n\s*String\(\s*\r?\n\s*scene\.caption \?\? ""\s*\r?\n\s*\)\.trim\(\);[\s\S]*?narration:\s*\r?\n\s*caption/.test(
    routeSource
  ),
  "Finalize must preserve legacy caption-to-narration behavior when captionSegments are absent."
);

requireContract(
  /scene\.caption\s*=\s*\r?\n\s*captionInput\.value;\s*\r?\n\s*scene\.narration\s*=\s*\r?\n\s*captionInput\.value;/.test(
    frontendSource
  ),
  "Plan Review manual caption edits must keep spoken narration equal to the edited caption."
);
requireContract(
  frontendSource.includes(
    "Array.isArray(scene.captionSegments)"
  ) &&
    frontendSource.includes(
      "scene.captionSegments = ["
    ) &&
    frontendSource.includes(
      "preservedEmphasis.length > 0"
    ) &&
    frontendSource.includes(
      "delete scene.captionSegments;"
    ) &&
    frontendSource.includes(
      "editedCaption.includes(term)"
    ),
  "Plan Review manual edits must collapse segmented scenes to one synchronized segment and remove stale emphasis."
);
requireContract(
  frontendSource.includes(
    "const transferredCaption ="
  ) &&
    frontendSource.includes(
      "finalScene.captionSegments = ["
    ) &&
    frontendSource.includes(
      "const transferredEmphasis ="
    ),
  "CTA transfer must keep segmented replacement scenes synchronized."
);

requireContract(
  frontendSource.includes(
    "[transferredCaption]"
  ) &&
    frontendSource.includes(
      "[...transferredEmphasis]"
    ),
  "Transferred CTA must retain valid exact-match emphasis."
);

requireContract(
  /else\s*\{[\s\S]*?const narration\s*=\s*\r?\n\s*String\([\s\S]*?finalScene\.narration[\s\S]*?callToAction\.toLowerCase\(\)[\s\S]*?finalScene\.narration\s*=/.test(
    frontendSource
  ),
  "CTA transfer must preserve the legacy narration-append path."
);

console.log(
  "PASS: generator requires sequential caption segments."
);

console.log(
  "PASS: narration is defined by ordered caption segments."
);

console.log(
  "PASS: compatibility caption/emphasis fields remain defined."
);

console.log(
  "PASS: backend segmented finalize and legacy compatibility paths protected."
);

console.log(
  "PASS: Version 1.1.8.27 generator contract protected."
);
{
  const {
    __storyboardGeneratorTestHelpers
  } = await import(
    "../storyboardGenerator.mjs"
  );

  const {
    normalizeGeneratedCaptionSegments
  } =
    __storyboardGeneratorTestHelpers;

  const generated = {
    version: "1.0",
    scenes: [
      {
        sceneNumber: 1,
        narration: "WRONG NARRATION",
        caption: "WRONG CAPTION",
        emphasisWords: ["WRONG"],
        captionSegments: [
          {
            text: "  MarketVision AI देखें  ",
            emphasisWords: [
              "  MarketVision AI  "
            ]
          },
          {
            text: "  एक डैशबोर्ड पर बाजार संकेत समझें।  ",
            emphasisWords: [
              "  बाजार संकेत  "
            ]
          }
        ]
      }
    ]
  };

  const normalized =
    normalizeGeneratedCaptionSegments(
      generated
    );

  const scene =
    normalized.scenes[0];

  if (
    scene.narration !==
    "MarketVision AI देखें एक डैशबोर्ड पर बाजार संकेत समझें।"
  ) {
    throw new Error(
      "Generated segment normalization did not rebuild narration."
    );
  }

  if (
    scene.caption !==
    "MarketVision AI देखें"
  ) {
    throw new Error(
      "Generated segment normalization did not rebuild compatibility caption."
    );
  }

  if (
    scene.emphasisWords.length !== 1 ||
    scene.emphasisWords[0] !==
      "MarketVision AI"
  ) {
    throw new Error(
      "Generated segment normalization did not rebuild compatibility emphasis."
    );
  }

  if (
    scene.captionSegments[0].text !==
      "MarketVision AI देखें" ||
    scene.captionSegments[1].text !==
      "एक डैशबोर्ड पर बाजार संकेत समझें।" ||
    scene.captionSegments[1].emphasisWords[0] !==
      "बाजार संकेत"
  ) {
    throw new Error(
      "Generated segment normalization did not trim segment content."
    );
  }

  console.log(
    "PASS: Generated caption-segment normalization repairs compatibility fields."
  );
}
{
  const {
    __storyboardGeneratorTestHelpers
  } = await import(
    "../storyboardGenerator.mjs"
  );

  const {
    splitCaptionText
  } =
    __storyboardGeneratorTestHelpers;

  const cases = [
    {
      name: "Hindi",
      text:
        "MarketVision AI में प्राइस मूवमेंट और ट्रेडिंग वॉल्यूम देखें। तकनीकी संकेतों को हाल की बाजार गतिविधि के साथ समझें।"
    },
    {
      name: "Chinese",
      text:
        "使用MarketVision AI查看价格走势、交易量和技术信号，并结合近期市场活动进行研究。"
    },
    {
      name: "Japanese",
      text:
        "MarketVision AIで価格の動き、出来高、テクニカルシグナルを確認し、最近の市場動向と合わせて調べます。"
    },
    {
      name: "English",
      text:
        "Review price movement, trading volume, technical signals, and recent market activity together in one dashboard."
    }
  ];

  for (const testCase of cases) {
    const chunks =
      splitCaptionText(
        testCase.text,
        60
      );

    if (
      chunks.length < 1 ||
      chunks.length > 3
    ) {
      throw new Error(
        `${testCase.name} splitter produced ${chunks.length} chunks.`
      );
    }

    for (const chunk of chunks) {
      if (
        Array.from(chunk).length > 60
      ) {
        throw new Error(
          `${testCase.name} splitter produced an overlong chunk.`
        );
      }
    }

    const reconstructed =
      chunks.join(" ");

    const normalizedOriginal =
      testCase.text
        .trim()
        .replace(/\s+/gu, " ");

    if (
      reconstructed !==
      normalizedOriginal
    ) {
      throw new Error(
        `${testCase.name} splitter changed the source text.`
      );
    }
  }

  const noWhitespace =
    "这是一个没有空格但需要安全分割的超长字幕文本用于验证Unicode字符不会在分割过程中损坏并且所有原始文字都会保留下来继续显示完整内容";

  const noWhitespaceChunks =
    splitCaptionText(
      noWhitespace,
      20
    );

  if (
    noWhitespaceChunks.join("") !==
    noWhitespace
  ) {
    throw new Error(
      "Unicode hard-boundary fallback changed source text."
    );
  }

  for (
    const chunk of noWhitespaceChunks
  ) {
    if (
      Array.from(chunk).length > 20
    ) {
      throw new Error(
        "Unicode hard-boundary fallback exceeded limit."
      );
    }
  }

  console.log(
    "PASS: Caption splitter preserves text within three readable segments."
  );
}
{
  const {
    __storyboardGeneratorTestHelpers
  } = await import(
    "../storyboardGenerator.mjs"
  );

  const {
    normalizeGeneratedCaptionSegments
  } =
    __storyboardGeneratorTestHelpers;

  const originalSegments = [
    {
      text:
        "MarketVision AI में प्राइस मूवमेंट और ट्रेडिंग वॉल्यूम देखें।",
      emphasisWords: [
        "MarketVision AI",
        "ट्रेडिंग वॉल्यूम"
      ]
    },
    {
      text:
        "तकनीकी संकेतों को हाल की बाजार गतिविधि के साथ समझें और अपनी रिसर्च को एक ही डैशबोर्ड पर व्यवस्थित करें।",
      emphasisWords: [
        "तकनीकी संकेतों",
        "बाजार गतिविधि"
      ]
    }
  ];

  const originalNarration =
    originalSegments
      .map((segment) => segment.text)
      .join(" ");

  const normalized =
    normalizeGeneratedCaptionSegments({
      version: "1.0",
      scenes: [
        {
          sceneNumber: 1,
          narration: "WRONG",
          caption: "WRONG",
          emphasisWords: ["WRONG"],
          captionSegments:
            originalSegments
        }
      ]
    });

  const scene =
    normalized.scenes[0];

  if (
    scene.captionSegments.length < 2 ||
    scene.captionSegments.length > 3
  ) {
    throw new Error(
      "Redistribution did not stay within 1-3 segments."
    );
  }

  for (
    const segment of
    scene.captionSegments
  ) {
    if (
      Array.from(segment.text).length > 60
    ) {
      throw new Error(
        "Redistribution left an overlong segment."
      );
    }

    if (
      segment.emphasisWords.length < 1 ||
      segment.emphasisWords.length > 2
    ) {
      throw new Error(
        "Redistribution produced invalid emphasis count."
      );
    }

    for (
      const term of
      segment.emphasisWords
    ) {
      if (!segment.text.includes(term)) {
        throw new Error(
          "Redistribution emphasis is absent from its segment."
        );
      }
    }
  }

  if (
    scene.narration !==
    originalNarration
  ) {
    throw new Error(
      "Redistribution changed spoken wording."
    );
  }

  if (
    scene.caption !==
    scene.captionSegments[0].text
  ) {
    throw new Error(
      "Redistribution did not rebuild compatibility caption."
    );
  }

  if (
    scene.emphasisWords.join("`0") !==
    scene.captionSegments[0].emphasisWords.join("`0")
  ) {
    throw new Error(
      "Redistribution did not rebuild compatibility emphasis."
    );
  }

  console.log(
    "PASS: Overlong generated caption segments redistribute safely."
  );
}
