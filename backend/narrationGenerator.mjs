import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";

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

function selectVoice(style) {
  return (
    STYLE_VOICES[style] ||
    STYLE_VOICES.Professional
  );
}

export async function generateNarration({
  storyboard,
  projectDirectory,
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
    selectVoice(storyboard.style);

  const client = new OpenAI({
    apiKey
  });

  const audioResponse =
    await client.audio.speech.create({
      model,
      voice:
        voiceSelection.voice,
      input:
        narrationText,
      instructions:
        voiceSelection.instructions +
        " Read only the supplied narration. " +
        "Do not add, remove, or rewrite words.",
      response_format:
        "mp3"
    });

  const audioBuffer = Buffer.from(
    await audioResponse.arrayBuffer()
  );

  if (audioBuffer.length === 0) {
    const error = new Error(
      "OpenAI returned an empty narration file."
    );

    error.code =
      "NARRATION_AUDIO_EMPTY";

    throw error;
  }

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

  await fs.writeFile(
    temporaryPath,
    audioBuffer
  );

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

  return {
    storedName,
    model,
    voice:
      voiceSelection.voice,
    format:
      "mp3",
    byteLength:
      audioBuffer.length,
    narrationText,
    narrationWordCount:
      countWords(narrationText),
    generatedAt:
      new Date().toISOString(),
    disclosure:
      "This narration uses an AI-generated voice."
  };
}
