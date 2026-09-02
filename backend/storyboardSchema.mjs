import { z } from "zod";

export const VIDEO_STYLES = [
  "Professional",
  "Energetic",
  "Elegant",
  "Simple"
];

export const SCENE_ROLES = [
  "hook",
  "product",
  "benefit",
  "proof",
  "cta"
];

export const MOTION_TYPES = [
  "none",
  "slow-pan-left",
  "slow-pan-right",
  "slow-zoom-in",
  "slow-zoom-out"
];

export const TRANSITION_TYPES = [
  "cut",
  "fade",
  "slide",
  "dissolve"
];

export const SceneSchema = z
  .object({
    sceneNumber: z.number().int(),
    startSeconds: z.number(),
    endSeconds: z.number(),
    imageIndex: z.number().int(),
    role: z.enum(SCENE_ROLES),
    narration: z.string(),
    caption: z.string(),
    motion: z.enum(MOTION_TYPES),
    transition: z.enum(TRANSITION_TYPES)
  })
  .strict();

export const StoryboardSchema = z
  .object({
    version: z.literal("1.0"),
    title: z.string(),
    style: z.enum(VIDEO_STYLES),
    aspectRatio: z.literal("9:16"),
    totalDurationSeconds: z.number().int(),
    narrationWordCount: z.number().int(),
    musicDirection: z.string(),
    scenes: z.array(SceneSchema),
    cta: z
      .object({
        text: z.string(),
        website: z.string()
      })
      .strict()
  })
  .strict();

function countWords(text) {
  return String(text)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

export function getNarrationWordLimit(maxDurationSeconds = 30) {
  const duration = Number(maxDurationSeconds);

  if (duration <= 30) return 65;
  if (duration <= 45) return 95;
  return 125;
}

export function validateStoryboard(
  storyboard,
  {
    imageCount,
    maxDurationSeconds = 30
  }
) {
  const parsed =
    StoryboardSchema.safeParse(storyboard);

  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map(
        (issue) =>
          `${issue.path.join(".")}: ${issue.message}`
      )
    };
  }

  const value = parsed.data;
  const errors = [];

  if (
    value.totalDurationSeconds < 20 ||
    value.totalDurationSeconds > maxDurationSeconds
  ) {
    errors.push(
      `Video duration must be between 20 and ${maxDurationSeconds} seconds.`
    );
  }

  if (
    value.scenes.length < 3 ||
    value.scenes.length > 5
  ) {
    errors.push(
      "Storyboard must contain between 3 and 5 scenes."
    );
  }

  let expectedStart = 0;

  value.scenes.forEach((scene, index) => {
    if (scene.sceneNumber !== index + 1) {
      errors.push(
        `Scene ${index + 1} has an incorrect scene number.`
      );
    }

    if (scene.startSeconds !== expectedStart) {
      errors.push(
        `Scene ${scene.sceneNumber} does not begin where the previous scene ended.`
      );
    }

    if (scene.endSeconds <= scene.startSeconds) {
      errors.push(
        `Scene ${scene.sceneNumber} must end after it begins.`
      );
    }

    if (
      scene.imageIndex < 1 ||
      scene.imageIndex > imageCount
    ) {
      errors.push(
        `Scene ${scene.sceneNumber} references an unavailable image.`
      );
    }

    if (scene.caption.length > 60) {
      errors.push(
        `Scene ${scene.sceneNumber} caption is too long.`
      );
    }


    const sceneDurationSeconds =
      scene.endSeconds - scene.startSeconds;

    const sceneNarrationWords =
      countWords(scene.narration);

    const maxSceneNarrationWords =
      Math.max(
        1,
        Math.floor(
          sceneDurationSeconds * 2.5
        )
      );

    if (
      sceneNarrationWords >
      maxSceneNarrationWords
    ) {
      errors.push(
        `Scene ${scene.sceneNumber} narration is too long for its ${sceneDurationSeconds}-second duration.`
      );
    }
    expectedStart = scene.endSeconds;
  });

  if (expectedStart !== value.totalDurationSeconds) {
    errors.push(
      "The final scene must end at the total video duration."
    );
  }

  const narration = value.scenes
    .map((scene) => scene.narration)
    .join(" ");

  const actualWordCount =
    countWords(narration);

  const maxNarrationWords =
    getNarrationWordLimit(
      maxDurationSeconds
    );

  if (
    actualWordCount < 9 ||
    actualWordCount > maxNarrationWords
  ) {
    errors.push(
      `Narration must contain between 9 and ${maxNarrationWords} words.`
    );
  }

  if (
    actualWordCount !==
    value.narrationWordCount
  ) {
    errors.push(
      "The saved narration word count is incorrect."
    );
  }

  if (value.scenes[0]?.role !== "hook") {
    errors.push(
      "The first scene must be the hook."
    );
  }

  if (
    value.scenes.at(-1)?.role !== "cta"
  ) {
    errors.push(
      "The final scene must be the call to action."
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    storyboard: value
  };
}
