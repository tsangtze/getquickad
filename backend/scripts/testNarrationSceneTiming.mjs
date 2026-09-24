import assert from "node:assert/strict";

import {
  __narrationGeneratorTestHelpers
} from "../narrationGenerator.mjs";

const {
  buildSceneAudioFilter,
  MAX_SCENE_AUDIO_TEMPO
} = __narrationGeneratorTestHelpers;

assert.equal(
  MAX_SCENE_AUDIO_TEMPO,
  1.21
);

const natural =
  buildSceneAudioFilter({
    inputIndex: 0,
    duration: 12,
    spokenDurationSeconds: 11.71
  });

assert.equal(
  natural,
  "[0:a]" +
    "apad=pad_dur=12," +
    "atrim=duration=12," +
    "asetpts=PTS-STARTPTS" +
    "[sceneAudio0]"
);

const scene2 =
  buildSceneAudioFilter({
    inputIndex: 1,
    duration: 12,
    spokenDurationSeconds: 13.06
  });

assert.match(
  scene2,
  /^\[1:a\]atempo=1\.088333,/
);

const scene3 =
  buildSceneAudioFilter({
    inputIndex: 2,
    duration: 12,
    spokenDurationSeconds: 13.66
  });

assert.match(
  scene3,
  /^\[2:a\]atempo=1\.138333,/
);

const scene5 =
  buildSceneAudioFilter({
    inputIndex: 4,
    duration: 12,
    spokenDurationSeconds: 12.17
  });

assert.match(
  scene5,
  /^\[4:a\]atempo=1\.014167,/
);

for (
  const filter of [
    scene2,
    scene3,
    scene5
  ]
) {
  assert.match(
    filter,
    /apad=pad_dur=12,atrim=duration=12,asetpts=PTS-STARTPTS/
  );
}

const exact =
  buildSceneAudioFilter({
    inputIndex: 3,
    duration: 12,
    spokenDurationSeconds: 12
  });

assert.doesNotMatch(
  exact,
  /atempo=/
);

assert.throws(
  () =>
    buildSceneAudioFilter({
      inputIndex: 0,
      duration: 12,
      spokenDurationSeconds: 15
    }),
  (error) =>
    error?.code ===
      "NARRATION_SCENE_TOO_LONG" &&
    /1\.21x limit/.test(
      error.message
    )
);

console.log(
  "PASS: Natural narration remains unchanged."
);

console.log(
  "PASS: Slightly overlong narration receives bounded per-scene tempo correction."
);

console.log(
  "PASS: Narration requiring more than 1.21x tempo is rejected instead of truncated."
);

{
  const {
    redistributeSceneDurations
  } = __narrationGeneratorTestHelpers;

  const result =
    redistributeSceneDurations({
      totalDurationSeconds: 45,
      sceneTimings: [
        {
          sceneNumber: 1,
          sceneDurationSeconds: 7,
          spokenDurationSeconds: 6
        },
        {
          sceneNumber: 2,
          sceneDurationSeconds: 7,
          spokenDurationSeconds: 6
        },
        {
          sceneNumber: 3,
          sceneDurationSeconds: 6,
          spokenDurationSeconds: 5
        },
        {
          sceneNumber: 4,
          sceneDurationSeconds: 6,
          spokenDurationSeconds: 7.5
        },
        {
          sceneNumber: 5,
          sceneDurationSeconds: 9,
          spokenDurationSeconds: 8
        },
        {
          sceneNumber: 6,
          sceneDurationSeconds: 10,
          spokenDurationSeconds: 9
        }
      ]
    });

  assert.equal(result.ok, true);
  assert.equal(result.redistributed, true);

  assert.ok(
    result.sceneTimings[3].durationSeconds >
      6,
    "Scene 4 must receive borrowed time."
  );

  assert.ok(
    Math.abs(
      result.sceneTimings.at(-1).endSeconds -
        45
    ) < 1e-9,
    "Final timeline must remain exactly 45 seconds."
  );

  for (const timing of result.sceneTimings) {
    assert.ok(
      timing.durationSeconds + 1e-9 >=
        timing.minimumDurationSeconds,
      `Scene ${timing.sceneNumber} exceeds the allowed tempo after redistribution.`
    );
  }

  console.log(
    "PASS: Global spare scene time rescues an overlong scene."
  );
}

{
  const {
    redistributeSceneDurations
  } = __narrationGeneratorTestHelpers;

  const result =
    redistributeSceneDurations({
      totalDurationSeconds: 45,
      sceneTimings: [
        {
          sceneNumber: 1,
          sceneDurationSeconds: 7,
          spokenDurationSeconds: 6
        },
        {
          sceneNumber: 2,
          sceneDurationSeconds: 7,
          spokenDurationSeconds: 6
        },
        {
          sceneNumber: 3,
          sceneDurationSeconds: 6,
          spokenDurationSeconds: 5
        },
        {
          sceneNumber: 4,
          sceneDurationSeconds: 6,
          spokenDurationSeconds: 6
        },
        {
          sceneNumber: 5,
          sceneDurationSeconds: 9,
          spokenDurationSeconds: 8
        },
        {
          sceneNumber: 6,
          sceneDurationSeconds: 10,
          spokenDurationSeconds: 9
        }
      ]
    });

  assert.equal(result.ok, true);
  assert.equal(result.redistributed, false);

  assert.deepEqual(
    result.sceneTimings.map(
      (timing) => timing.durationSeconds
    ),
    [7, 7, 6, 6, 9, 10]
  );

  console.log(
    "PASS: Original AI scene timing remains unchanged when redistribution is unnecessary."
  );
}

{
  const {
    redistributeSceneDurations
  } = __narrationGeneratorTestHelpers;

  const result =
    redistributeSceneDurations({
      totalDurationSeconds: 10,
      sceneTimings: [
        {
          sceneNumber: 1,
          sceneDurationSeconds: 5,
          spokenDurationSeconds: 13
        },
        {
          sceneNumber: 2,
          sceneDurationSeconds: 5,
          spokenDurationSeconds: 13
        }
      ]
    });

  assert.equal(result.ok, false);

  assert.equal(
    result.error.code,
    "NARRATION_TOTAL_TOO_LONG"
  );

  assert.ok(
    Number.isInteger(
      result.error.sceneNumber
    )
  );

  console.log(
    "PASS: Impossible total narration remains a controlled failure."
  );
}
{
  const generatorSource =
    await import("node:fs/promises")
      .then(({ readFile }) =>
        readFile(
          new URL(
            "../narrationGenerator.mjs",
            import.meta.url
          ),
          "utf8"
        )
      );

  const sceneAudioDeclaration =
    generatorSource.indexOf(
      "  const sceneAudioPaths = [];"
    );

  const tryStart =
    generatorSource.indexOf(
      "  try {",
      sceneAudioDeclaration
    );

  assert.ok(
    sceneAudioDeclaration >= 0 &&
      tryStart > sceneAudioDeclaration,
    "generateNarration try block must be locatable."
  );

  const beforeTry =
    generatorSource.slice(
      sceneAudioDeclaration,
      tryStart
    );

  assert.match(
    beforeTry,
    /let timingRedistribution;/
  );

  assert.match(
    beforeTry,
    /let adjustedSceneTimings;/
  );

  assert.match(
    beforeTry,
    /let adjustedStoryboard;/
  );

  const afterTry =
    generatorSource.slice(tryStart);

  assert.doesNotMatch(
    afterTry,
    /const timingRedistribution\s*=/
  );

  assert.doesNotMatch(
    afterTry,
    /const adjustedSceneTimings\s*=/
  );

  assert.doesNotMatch(
    afterTry,
    /const adjustedStoryboard\s*=/
  );

  console.log(
    "PASS: generateNarration redistribution state survives the try/finally scope."
  );
}