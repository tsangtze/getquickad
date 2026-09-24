import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import {
  runFfmpeg,
  probeDuration
} from "./mediaTools.mjs";

const STYLE_VOICES = {
  Professional: {
    voice: "cedar",
    instructions:
      "Speak with a polished, confident, trustworthy professional tone. Maintain a steady natural pace. Do not sound dramatic or rushed."
  },
  Energetic: {
    voice: "coral",
    instructions:
      "Speak with upbeat, positive energy and clear emphasis. Maintain a brisk natural pace without sounding rushed or exaggerated."
  },
  Elegant: {
    voice: "marin",
    instructions:
      "Speak with a refined, warm, premium tone. Use smooth pacing, subtle expression, and calm confidence."
  },
  Simple: {
    voice: "cedar",
    instructions:
      "Speak clearly and directly with a friendly, natural tone. Keep the delivery calm, minimal, and easy to understand."
  }
};

function countWords(text) {
  return String(text)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

const MAX_SCENE_AUDIO_TEMPO = 1.21;

function redistributeSceneDurations({
  sceneTimings,
  totalDurationSeconds,
  maxTempo = MAX_SCENE_AUDIO_TEMPO
}) {
  if (
    !Array.isArray(sceneTimings) ||
    sceneTimings.length === 0
  ) {
    throw new Error(
      "Scene timings are required for redistribution."
    );
  }

  const totalDuration =
    Number(totalDurationSeconds);

  const tempoLimit =
    Number(maxTempo);

  if (
    !Number.isFinite(totalDuration) ||
    totalDuration <= 0
  ) {
    throw new Error(
      "Total video duration must be positive."
    );
  }

  if (
    !Number.isFinite(tempoLimit) ||
    tempoLimit < 1
  ) {
    throw new Error(
      "Maximum scene audio tempo must be at least 1."
    );
  }

  const normalized =
    sceneTimings.map((timing, index) => {
      const plannedDuration =
        Number(timing.sceneDurationSeconds);

      const spokenDuration =
        Number(timing.spokenDurationSeconds);

      if (
        !Number.isFinite(plannedDuration) ||
        plannedDuration <= 0 ||
        !Number.isFinite(spokenDuration) ||
        spokenDuration < 0
      ) {
        throw new Error(
          `Scene ${index + 1} has invalid timing data.`
        );
      }

      return {
        sceneNumber:
          Number(timing.sceneNumber) ||
          index + 1,
        plannedDuration,
        spokenDuration,
        minimumDuration:
          spokenDuration / tempoLimit
      };
    });

  const plannedTotal =
    normalized.reduce(
      (sum, timing) =>
        sum + timing.plannedDuration,
      0
    );

  if (
    Math.abs(
      plannedTotal - totalDuration
    ) > 1e-6
  ) {
    throw new Error(
      "Planned scene durations must equal the total video duration."
    );
  }

  const deficits =
    normalized.map((timing) =>
      Math.max(
        0,
        timing.minimumDuration -
          timing.plannedDuration
      )
    );

  const donorSlack =
    normalized.map((timing) =>
      Math.max(
        0,
        timing.plannedDuration -
          timing.minimumDuration
      )
    );

  const totalDeficit =
    deficits.reduce(
      (sum, value) => sum + value,
      0
    );

  const totalDonorSlack =
    donorSlack.reduce(
      (sum, value) => sum + value,
      0
    );

  if (
    totalDeficit >
    totalDonorSlack + 1e-9
  ) {
    const worstIndex =
      deficits.reduce(
        (
          bestIndex,
          value,
          index,
          values
        ) =>
          value > values[bestIndex]
            ? index
            : bestIndex,
        0
      );

    const error =
      new Error(
        "Narration cannot fit within the total video duration at the allowed audio tempo."
      );

    error.code =
      "NARRATION_TOTAL_TOO_LONG";

    error.sceneNumber =
      normalized[worstIndex].sceneNumber;

    error.requiredExtraSeconds =
      totalDeficit -
      totalDonorSlack;

    error.totalDurationSeconds =
      totalDuration;

    return {
      ok: false,
      error
    };
  }

  if (totalDeficit <= 1e-9) {
    let cursor = 0;

    return {
      ok: true,
      redistributed: false,
      totalDurationSeconds:
        totalDuration,
      borrowedDurationSeconds: 0,
      sceneTimings:
        normalized.map(
          (timing, index) => {
            const startSeconds =
              cursor;

            const endSeconds =
              index ===
              normalized.length - 1
                ? totalDuration
                : cursor +
                  timing.plannedDuration;

            cursor = endSeconds;

            return {
              sceneNumber:
                timing.sceneNumber,
              originalDurationSeconds:
                timing.plannedDuration,
              spokenDurationSeconds:
                timing.spokenDuration,
              minimumDurationSeconds:
                timing.minimumDuration,
              durationSeconds:
                endSeconds -
                startSeconds,
              startSeconds,
              endSeconds
            };
          }
        )
    };
  }

  const adjustedDurations =
    normalized.map(
      (timing, index) =>
        timing.plannedDuration +
        deficits[index]
    );

  for (
    let index = 0;
    index < adjustedDurations.length;
    index += 1
  ) {
    if (donorSlack[index] <= 0) {
      continue;
    }

    const contribution =
      totalDeficit *
      (
        donorSlack[index] /
        totalDonorSlack
      );

    adjustedDurations[index] -=
      contribution;
  }

  const assignedTotal =
    adjustedDurations.reduce(
      (sum, value) => sum + value,
      0
    );

  adjustedDurations[
    adjustedDurations.length - 1
  ] +=
    totalDuration - assignedTotal;

  let cursor = 0;

  const adjustedSceneTimings =
    normalized.map(
      (timing, index) => {
        const startSeconds =
          cursor;

        const endSeconds =
          index ===
          normalized.length - 1
            ? totalDuration
            : cursor +
              adjustedDurations[index];

        cursor = endSeconds;

        return {
          sceneNumber:
            timing.sceneNumber,
          originalDurationSeconds:
            timing.plannedDuration,
          spokenDurationSeconds:
            timing.spokenDuration,
          minimumDurationSeconds:
            timing.minimumDuration,
          durationSeconds:
            endSeconds -
            startSeconds,
          startSeconds,
          endSeconds
        };
      }
    );

  return {
    ok: true,
    redistributed: true,
    totalDurationSeconds:
      totalDuration,
    borrowedDurationSeconds:
      totalDeficit,
    sceneTimings:
      adjustedSceneTimings
  };
}

function buildSceneAudioFilter({
  inputIndex,
  duration,
  spokenDurationSeconds,
  sceneNumber
}) {
  const safeDuration =
    Number(duration);

  const spokenDuration =
    Number(spokenDurationSeconds);

  if (
    !Number.isFinite(safeDuration) ||
    safeDuration <= 0
  ) {
    throw new Error(
      "Scene audio duration must be positive."
    );
  }

  const filters = [];

  if (
    Number.isFinite(spokenDuration) &&
    spokenDuration > safeDuration
  ) {
    const tempo =
      spokenDuration / safeDuration;

    if (
      tempo >
      MAX_SCENE_AUDIO_TEMPO
    ) {
      const error =
        new Error(
          `Scene narration requires ${tempo.toFixed(3)}x audio tempo, exceeding the ${MAX_SCENE_AUDIO_TEMPO.toFixed(2)}x limit.`
        );

      error.code =
        "NARRATION_SCENE_TOO_LONG";

      if (
        Number.isInteger(Number(sceneNumber)) &&
        Number(sceneNumber) > 0
      ) {
        error.sceneNumber =
          Number(sceneNumber);
      }

      throw error;
    }

    filters.push(
      `atempo=${tempo.toFixed(6)}`
    );
  }

  filters.push(
    `apad=pad_dur=${safeDuration}`,
    `atrim=duration=${safeDuration}`,
    "asetpts=PTS-STARTPTS"
  );

  return (
    `[${inputIndex}:a]` +
    filters.join(",") +
    `[sceneAudio${inputIndex}]`
  );
}
function buildNarrationText(storyboard) {
  if (
    !Array.isArray(storyboard?.scenes) ||
    storyboard.scenes.length === 0
  ) {
    throw new Error(
      "The storyboard contains no narration scenes."
    );
  }

  const narrationText = storyboard.scenes
    .map((scene) =>
      String(scene.narration ?? "").trim()
    )
    .filter(Boolean)
    .join(" ");

  if (!narrationText) {
    throw new Error(
      "The storyboard narration is empty."
    );
  }

  return narrationText;
}

const NARRATOR_CHOICES = {
  "woman-warm": {
    voice: "marin",
    instructions:
      "Speak with a warm, smooth, welcoming feminine presentation. Maintain a natural, confident pace."
  },
  "woman-energetic": {
    voice: "coral",
    instructions:
      "Speak with an upbeat, engaging feminine presentation. Sound promotional and positive without rushing."
  },
  "man-confident": {
    voice: "cedar",
    instructions:
      "Speak with a clear, confident masculine presentation. Sound polished, professional, and trustworthy."
  },
  "man-calm": {
    voice: "cedar",
    instructions:
      "Speak with a calm, reassuring masculine presentation. Use relaxed pacing and natural expression."
  }
};

function selectVoice(
  style,
  narratorChoice = "automatic"
) {
  if (
    narratorChoice !== "automatic" &&
    NARRATOR_CHOICES[narratorChoice]
  ) {
    return {
      ...NARRATOR_CHOICES[narratorChoice],
      narratorChoice
    };
  }

  return {
    ...(
      STYLE_VOICES[style] ||
      STYLE_VOICES.Professional
    ),
    narratorChoice: "automatic"
  };
}
export async function generateNarration({
  storyboard,
  projectDirectory,
  narratorChoice = "automatic",
  apiKey = process.env.OPENAI_API_KEY,
  model =
    process.env.OPENAI_TTS_MODEL ||
    "gpt-4o-mini-tts"
}) {
  if (!apiKey) {
    const error = new Error(
      "OPENAI_API_KEY is not configured."
    );

    error.code =
      "OPENAI_API_KEY_MISSING";

    throw error;
  }

  if (!projectDirectory) {
    throw new Error(
      "The project directory was not supplied."
    );
  }

  const narrationText =
    buildNarrationText(storyboard);

  const voiceSelection =
    selectVoice(
      storyboard.style,
      narratorChoice
    );

  const client = new OpenAI({
    apiKey
  });

  const temporaryName =
    "narration.tmp.mp3";

  const storedName =
    "narration.mp3";

  const temporaryPath = path.join(
    projectDirectory,
    temporaryName
  );

  const narrationPath = path.join(
    projectDirectory,
    storedName
  );

  const sceneAudioPaths = [];
  let timingRedistribution;
  let adjustedSceneTimings;
  let adjustedStoryboard;

  try {
    for (
      let sceneIndex = 0;
      sceneIndex < storyboard.scenes.length;
      sceneIndex += 1
    ) {
      const scene =
        storyboard.scenes[sceneIndex];

      const sceneText =
        String(
          scene.narration ??
          scene.caption ??
          ""
        ).trim();

      if (!sceneText) {
        throw new Error(
          `Scene ${sceneIndex + 1} contains no narration text.`
        );
      }

      const sceneDuration =
        Number(scene.endSeconds) -
        Number(scene.startSeconds);

      if (
        !Number.isFinite(sceneDuration) ||
        sceneDuration <= 0
      ) {
        throw new Error(
          `Scene ${sceneIndex + 1} has an invalid duration.`
        );
      }

      const audioResponse =
        await client.audio.speech.create({
          model,
          voice:
            voiceSelection.voice,
          input:
            sceneText,
          instructions:
            voiceSelection.instructions +
            " Read only the supplied narration. " +
            "Do not add, remove, or rewrite words. " +
            "Finish naturally without introducing the next scene.",
          response_format:
            "mp3"
        });

      const sceneAudioBuffer =
        Buffer.from(
          await audioResponse.arrayBuffer()
        );

      if (sceneAudioBuffer.length === 0) {
        const error = new Error(
          `OpenAI returned empty audio for scene ${sceneIndex + 1}.`
        );

        error.code =
          "NARRATION_AUDIO_EMPTY";

        throw error;
      }

      const sceneAudioPath =
        path.join(
          projectDirectory,
          `narration-scene-${String(
            sceneIndex + 1
          ).padStart(2, "0")}.tmp.mp3`
        );

      await fs.writeFile(
        sceneAudioPath,
        sceneAudioBuffer
      );

      const spokenDurationSeconds =
        await probeDuration(
          sceneAudioPath
        );

      sceneAudioPaths.push({
        path:
          sceneAudioPath,
        duration:
          sceneDuration,
        spokenDurationSeconds
      });
    }

    await fs.rm(
      temporaryPath,
      {
        force: true
      }
    );

    timingRedistribution =
      redistributeSceneDurations({
        totalDurationSeconds:
          storyboard.totalDurationSeconds,
        sceneTimings:
          storyboard.scenes.map(
            (scene, sceneIndex) => ({
              sceneNumber:
                scene.sceneNumber,
              sceneDurationSeconds:
                Number(scene.endSeconds) -
                Number(scene.startSeconds),
              spokenDurationSeconds:
                sceneAudioPaths[
                  sceneIndex
                ].spokenDurationSeconds
            })
          )
      });

    if (!timingRedistribution.ok) {
      throw timingRedistribution.error;
    }

    adjustedSceneTimings =
      timingRedistribution.sceneTimings;

    adjustedStoryboard = {
      ...storyboard,
      scenes:
        storyboard.scenes.map(
          (scene, sceneIndex) => ({
            ...scene,
            startSeconds:
              adjustedSceneTimings[
                sceneIndex
              ].startSeconds,
            endSeconds:
              adjustedSceneTimings[
                sceneIndex
              ].endSeconds
          })
        )
    };

    const ffmpegArguments = [
      "-y"
    ];

    for (const sceneAudio of sceneAudioPaths) {
      ffmpegArguments.push(
        "-i",
        sceneAudio.path
      );
    }

    const audioFilters =
      sceneAudioPaths.map(
        (sceneAudio, sceneIndex) =>
          buildSceneAudioFilter({
            inputIndex: sceneIndex,
            duration:
              adjustedSceneTimings[
                sceneIndex
              ].durationSeconds,
            spokenDurationSeconds:
              sceneAudio.spokenDurationSeconds,
            sceneNumber:
              storyboard.scenes[
                sceneIndex
              ]?.sceneNumber ??
              sceneIndex + 1
          })
      );

    const sceneAudioLabels =
      sceneAudioPaths
        .map(
          (_sceneAudio, sceneIndex) =>
            `[sceneAudio${sceneIndex}]`
        )
        .join("");

    audioFilters.push(
      `${sceneAudioLabels}` +
      `concat=n=${sceneAudioPaths.length}:v=0:a=1[audio]`
    );

    ffmpegArguments.push(
      "-filter_complex",
      audioFilters.join(";"),
      "-map",
      "[audio]",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "192k",
      temporaryPath
    );

    await runFfmpeg(
      ffmpegArguments,
      {
        timeoutMilliseconds:
          120000
      }
    );

    const temporaryStats =
      await fs.stat(temporaryPath);

    if (temporaryStats.size === 0) {
      const error = new Error(
        "The aligned narration file is empty."
      );

      error.code =
        "NARRATION_AUDIO_EMPTY";

      throw error;
    }

    await fs.rm(
      narrationPath,
      {
        force: true
      }
    );

    await fs.rename(
      temporaryPath,
      narrationPath
    );
  } finally {
    await Promise.all(
      sceneAudioPaths.map(
        (sceneAudio) =>
          fs.rm(
            sceneAudio.path,
            {
              force: true
            }
          )
      )
    );

    await fs.rm(
      temporaryPath,
      {
        force: true
      }
    );
  }

  const narrationStats =
    await fs.stat(narrationPath);
  return {
    storedName,
    model,
    voice:
      voiceSelection.voice,
    narratorChoice:
      voiceSelection.narratorChoice,
    format:
      "mp3",
    byteLength:
      narrationStats.size,
    narrationText,
    narrationWordCount:
      countWords(narrationText),
    generatedAt:
      new Date().toISOString(),
    sceneAligned:
      true,
    sceneCount:
      storyboard.scenes.length,
    sceneTimings:
      adjustedSceneTimings.map(
        (timing) => ({
          sceneNumber:
            timing.sceneNumber,
          sceneDurationSeconds:
            timing.durationSeconds,
          spokenDurationSeconds:
            timing.spokenDurationSeconds,
          startSeconds:
            timing.startSeconds,
          endSeconds:
            timing.endSeconds
        })
      ),
    timingRedistributed:
      timingRedistribution.redistributed,
    borrowedDurationSeconds:
      timingRedistribution.borrowedDurationSeconds,
    adjustedStoryboard,
    durationSeconds:
      storyboard.totalDurationSeconds,
    disclosure:
      "This narration uses an AI-generated voice."
  };
}
export const __narrationGeneratorTestHelpers = {
  buildSceneAudioFilter,
  redistributeSceneDurations,
  MAX_SCENE_AUDIO_TEMPO
};
