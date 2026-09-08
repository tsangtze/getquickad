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
