import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import {
  runFfmpeg
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

      sceneAudioPaths.push({
        path:
          sceneAudioPath,
        duration:
          sceneDuration
      });
    }

    await fs.rm(
      temporaryPath,
      {
        force: true
      }
    );

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
          `[${sceneIndex}:a]` +
          `apad=pad_dur=${sceneAudio.duration},` +
          `atrim=duration=${sceneAudio.duration},` +
          "asetpts=PTS-STARTPTS" +
          `[sceneAudio${sceneIndex}]`
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
    durationSeconds:
      storyboard.totalDurationSeconds,
    disclosure:
      "This narration uses an AI-generated voice."
  };
}
