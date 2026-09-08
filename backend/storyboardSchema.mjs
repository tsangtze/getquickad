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

const CaptionSegmentSchema = z
  .object({
    text: z.string(),
    emphasisWords: z.array(z.string()).min(1).max(2)
  })
  .strict();

export const SceneSchema = z
  .object({
    sceneNumber: z.number().int(),
    startSeconds: z.number(),
    endSeconds: z.number(),
    imageIndex: z.number().int(),
    role: z.enum(SCENE_ROLES),
    narration: z.string(),
    caption: z.string(),
    emphasisWords: z.array(z.string()).min(1).max(2),
    captionSegments: z.array(CaptionSegmentSchema).min(1).max(3),
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
const LegacySceneSchema =
  SceneSchema.extend({
    emphasisWords:
      z.array(z.string()).max(2),
    captionSegments:
      z.array(CaptionSegmentSchema).max(3).optional()
  });

const LegacyStoryboardSchema =
  StoryboardSchema.extend({
    scenes:
      z.array(LegacySceneSchema)
  });


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
    minDurationSeconds = 20,
    maxDurationSeconds = 30,
    allowLegacyMissingEmphasis = false
  }
) {
  const storyboardForValidation =
    allowLegacyMissingEmphasis &&
    Array.isArray(storyboard?.scenes)
      ? {
          ...storyboard,
          scenes:
            storyboard.scenes.map(
              (scene) =>
                Object.prototype.hasOwnProperty.call(
                  scene,
                  "emphasisWords"
                )
                  ? scene
                  : {
                      ...scene,
                      emphasisWords: []
                    }
            )
        }
      : storyboard;

  const validationSchema =
    allowLegacyMissingEmphasis
      ? LegacyStoryboardSchema
      : StoryboardSchema;

  const parsed =
    validationSchema.safeParse(
      storyboardForValidation
    );

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
    value.totalDurationSeconds < minDurationSeconds ||
    value.totalDurationSeconds > maxDurationSeconds
  ) {
    errors.push(
      `Video duration must be between ${minDurationSeconds} and ${maxDurationSeconds} seconds.`
    );
  }

  const requiredSceneCount =
    imageCount <= 5
      ? 5
      : imageCount + 1;

  if (
    value.scenes.length !== requiredSceneCount
  ) {
    errors.push(
      `Storyboard must contain exactly ${requiredSceneCount} scenes for ${imageCount} uploaded image${imageCount === 1 ? "" : "s"}.`
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

    for (const emphasisWord of scene.emphasisWords) {
      if (!scene.caption.includes(emphasisWord)) {
        errors.push(
          `Scene ${scene.sceneNumber} emphasis term must appear exactly in its caption: ${emphasisWord}`
        );
      }
    }

    if (Array.isArray(scene.captionSegments)) {
      const segmentNarration =
        scene.captionSegments
          .map((segment) => segment.text)
          .join(" ");

      if (scene.narration !== segmentNarration) {
        errors.push(
          `Scene ${scene.sceneNumber} narration must exactly equal its caption segments joined in order.`
        );
      }

      const firstSegment =
        scene.captionSegments[0];

      if (
        firstSegment &&
        scene.caption !== firstSegment.text
      ) {
        errors.push(
          `Scene ${scene.sceneNumber} compatibility caption must exactly equal its first caption segment.`
        );
      }

      const legacyMissingCompatibilityEmphasis =
        allowLegacyMissingEmphasis &&
        scene.emphasisWords.length === 0;

      if (
        !legacyMissingCompatibilityEmphasis &&
        firstSegment &&
        (
          scene.emphasisWords.length !==
            firstSegment.emphasisWords.length ||
          scene.emphasisWords.some(
            (term, index) =>
              term !==
              firstSegment.emphasisWords[index]
          )
        )
      ) {
        errors.push(
          `Scene ${scene.sceneNumber} compatibility emphasisWords must exactly equal its first caption segment emphasisWords.`
        );
      }

      for (
        let segmentIndex = 0;
        segmentIndex < scene.captionSegments.length;
        segmentIndex += 1
      ) {
        const segment =
          scene.captionSegments[segmentIndex];

        if (
          segment.text.length === 0 ||
          segment.text.length > 60
        ) {
          errors.push(
            `Scene ${scene.sceneNumber} caption segment ${segmentIndex + 1} must contain 1-60 characters.`
          );
        }

        for (
          const emphasisWord of
          segment.emphasisWords
        ) {
          if (!segment.text.includes(emphasisWord)) {
            errors.push(
              `Scene ${scene.sceneNumber} caption segment ${segmentIndex + 1} emphasis term must appear exactly in its text: ${emphasisWord}`
            );
          }
        }
      }
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

  for (
    let imageIndex = 1;
    imageIndex <= imageCount;
    imageIndex += 1
  ) {
    const imageIsUsed =
      value.scenes.some(
        (scene) =>
          scene.imageIndex === imageIndex
      );

    if (!imageIsUsed) {
      errors.push(
        `Uploaded image ${imageIndex} is not used by any scene.`
      );
    }
  }

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
    actualWordCount > maxNarrationWords
  ) {
    errors.push(
      `Narration must contain no more than ${maxNarrationWords} words.`
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
