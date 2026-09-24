import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import { z } from "zod";
import {
  zodTextFormat
} from "openai/helpers/zod";
import {
  StoryboardSchema,
  validateStoryboard,
  getNarrationWordLimit
} from "./storyboardSchema.mjs";

const AutoStoryboardResultSchema = z
  .object({
    durationTierSeconds: z.union([
      z.literal(30),
      z.literal(45),
      z.literal(60)
    ]),
    storyboard: StoryboardSchema
  })
  .strict();

const NarrationCorrectionSchema = z
  .object({
    scenes: z.array(
      z
        .object({
          sceneNumber: z.number().int(),
          captionSegments: z
            .array(
              z
                .object({
                  text: z.string(),
                  emphasisWords: z
                    .array(z.string())
                    .min(1)
                    .max(2)
                })
                .strict()
            )
            .min(1)
            .max(3)
        })
        .strict()
    )
  })
  .strict();

function countWords(text) {
  return String(text)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function describeLanguage(language = "en") {
  const normalized = String(language || "en").toLowerCase();

  if (normalized.startsWith("es")) return "Spanish (Mexican Spanish, es-419)";
  if (normalized.startsWith("pt")) return "Portuguese (Brazilian Portuguese, pt-BR)";
  if (normalized.startsWith("fr")) return "French (fr)";
  if (normalized.startsWith("de")) return "German (de)";
  if (normalized.startsWith("it")) return "Italian (it)";
  if (normalized.startsWith("ja")) return "Japanese (ja)";
  if (normalized.startsWith("ko")) return "Korean (ko)";
  if (
    normalized === "zh-tw" ||
    normalized === "zh-hant" ||
    normalized.startsWith("zh-hant-") ||
    normalized === "zh-hk" ||
    normalized === "zh-mo"
  ) {
    return "Chinese (Traditional Chinese, Taiwan, zh-TW)";
  }

  if (normalized.startsWith("zh")) {
    return "Chinese (Simplified Chinese, zh)";
  }
  if (normalized.startsWith("tr")) return "Turkish (tr)";
  if (normalized.startsWith("hi")) return "Hindi (hi)";

  return "English (en)";
}
function getTargetDurationFloor(durationTierSeconds) {
  const duration = Number(durationTierSeconds);

  if (duration <= 30) return 27;
  if (duration <= 45) return 41;
  return 55;
}

function buildSystemInstructions(
  language = "en",
  maxDurationSeconds = 30,
  durationMode = "manual",
  imageCount = 1
) {
  const requiredSceneCount =
    imageCount <= 4
      ? 5
      : imageCount + 1;
  const languageDescription = describeLanguage(language);
  const maxNarrationWords =
    getNarrationWordLimit(
      maxDurationSeconds
    );

  return `
You create concise vertical promotional-video storyboards in the requested language.

LANGUAGE RULE - CRITICAL:
- Target language: ${languageDescription}
- Write ALL titles, captions, and narration in the target language.
- Use natural marketing language for the target locale.
- Do not translate product names, brand names, URLs, or file names unless the customer supplied them translated.

Return one complete storyboard for a 9:16 social-media advertisement that follows the applicable duration-tier rules below and never exceeds ${maxDurationSeconds} seconds.

Rules:
- Treat every new project as a fresh creative generation.
- Create a fresh creative treatment for this request rather than relying on a fixed wording pattern or template.
- When the same or similar product information could support multiple good advertisements, vary the hook, scene emphasis, caption wording, and the lead-in to the call to action where naturally appropriate.
- Keep all supplied product facts, brand names, URLs, and required customer details accurate. Creative variation must never come from inventing unsupported claims, features, reviews, discounts, guarantees, or certifications.
- Repetition of unavoidable product names, supplied facts, URLs, and the customer's exact call to action is acceptable and should not be changed merely for variety.
- Use exactly ${requiredSceneCount} scenes.
- Scene 1 must be the hook.
- Scene ${requiredSceneCount} must be the call to action.
${durationMode === "manual"
  ? `- Treat the customer's selected maximum duration as the desired ad-length tier, not merely as an upper bound.
- If maxDurationSeconds is 30, totalDurationSeconds must be 27-30 seconds.
- If maxDurationSeconds is 45, totalDurationSeconds must be 41-45 seconds.
- If maxDurationSeconds is 60, totalDurationSeconds must be 55-60 seconds.
- The customer chose this duration tier intentionally. Do not shorten the video below its target range because there are few images or limited product details.
- Develop useful narration across the full selected duration using the customer's supplied facts, description, website, call to action, and the visible content of the uploaded images.
- A small number of uploaded images does not require a short video. Reuse available images across scenes when necessary to support the selected duration.
- Never invent unsupported product facts, certifications, reviews, discounts, guarantees, or features just to make the video longer.
- Avoid repetitive filler. When product facts are limited, use truthful creative structure, pacing, benefits already supplied by the customer, visual emphasis, and a natural call to action to fill the selected duration without inventing claims.`
  : `- maxDurationSeconds is only the plan ceiling while AI duration selection is being performed.
- Do not treat maxDurationSeconds as the customer's desired video length.
- Do not prefer the longest available duration.
- The AI DURATION DECISION rules determine the actual duration tier.
- Develop only enough useful narration to support the duration tier selected by the AI duration decision.
- Reuse available images across scenes when useful, but never lengthen the video merely to use more time.
- Never invent unsupported product facts, certifications, reviews, discounts, guarantees, or features to justify a longer video.
- Avoid repetitive filler.`}
- The total duration must stay within the applicable duration-tier range defined above and must never exceed ${maxDurationSeconds} seconds.
- Give every scene a continuous timeline with no gaps or overlaps.
- Scene 1 must start at 0 seconds.
- Scene ${requiredSceneCount} must end exactly at totalDurationSeconds.
- Set totalDurationSeconds to the actual chosen duration.
- Narration across all scenes must contain no more than ${maxNarrationWords} words.
- SEQUENTIAL CAPTION RULE: Every scene must contain 1 to 3 captionSegments shown in order while that scene's narration is spoken.
- Each captionSegments item must contain text and emphasisWords.
- Each caption segment text must be concise, natural to read on screen, natural to speak aloud, and contain no more than 60 characters.
- The complete scene narration must be exactly the caption segment texts joined in order with a single normal space between segments.
- Do not add narration words that are absent from captionSegments, and do not omit spoken words from captionSegments.
- Use 1 segment when the spoken message is naturally short. Use 2 or 3 segments when a longer scene needs richer narration. Do not force extra segments merely to reach 3.
- When dividing narration into 2 or 3 caption segments, split at natural language boundaries first: prefer complete sentences or clauses, then punctuation boundaries, then natural phrase boundaries.
- Never end a caption segment at a grammatically incomplete or awkward point when a natural phrase boundary is available.
- Keep sequential caption segments roughly balanced by natural spoken duration when practical, but never damage grammar or meaning merely to make segment lengths equal.
- Do not split by equal character count. Natural phrasing and readability take priority over equal-length segments.
- Every spoken word must remain in the caption segments in the same order, so joining the segments reconstructs the complete narration exactly.
- For longer 45-second and 60-second videos, prefer multiple sequential caption segments in longer scenes when needed to support useful natural narration and avoid long silent tails.
- For every caption segment, set emphasisWords to 1 or 2 meaningful words or short terms copied exactly from that segment's text.
- Choose the strongest product, benefit, action, number, or emotionally meaningful terms for emphasis.
- Do not choose filler words merely to reach two items. One strong emphasis term is better than two weak ones.
- Every caption-segment emphasisWords item must appear exactly in that segment's text. Do not invent, translate, reword, or change the capitalization of the selected text.
- Keep caption-segment emphasisWords appropriate for the target language, including Chinese, Japanese, and Korean.
- COMPATIBILITY FIELDS: For each newly generated scene, set caption exactly equal to captionSegments[0].text and set the scene-level emphasisWords exactly equal to captionSegments[0].emphasisWords.
- GLOBAL NARRATION BUDGET: Estimate the natural spoken duration of all narration across the complete video in the target language. Keep the combined natural narration duration at or below 90% of the selected duration tier.
- For a 30-second duration tier, target no more than 27 seconds of natural narration. For 45 seconds, target no more than 40.5 seconds. For 60 seconds, target no more than 54 seconds.
- Treat this as a speaking-duration budget, not merely a word-count budget. Account for the target language, punctuation, phrasing, numbers, and natural speaking rhythm. This is especially important for Chinese, Japanese, Korean, and other languages where whitespace word counts do not reliably predict spoken duration.
- Leave the remaining time as natural breathing room for transitions and visual pacing. Do not deliberately fill the full video duration with continuous narration.
- Keep each scene narration short enough to be spoken naturally within that scene's assigned duration.
- When a scene would otherwise contain too little narration for its assigned duration, enrich the caption/narration with useful, truthful details supported by the customer's supplied information or clearly visible image content.
- If there is not enough truthful material to enrich that scene naturally, shorten that scene and redistribute the available time among other scenes that can support useful narration.
- Across longer 45-second and 60-second videos, use the additional available time for proportionally richer useful storytelling rather than stretching short 30-second-style captions across longer scenes.
- Never leave a long silent tail merely to fill the selected video duration.
- Never add repetitive filler or invent unsupported claims merely to occupy time.
- Keep every caption segment concise and natural. The sequential caption segments collectively contain the complete spoken narration for the scene.
- Never invent certifications, reviews, discounts, guarantees, or product features.
- Use only facts supplied by the customer.
- imageIndex must reference an available uploaded image.
- Follow the customer's upload order by default.
- The final Scene ${requiredSceneCount} is a dedicated call-to-action scene.
- The final CTA visual is supplied separately by the renderer, so its imageIndex remains only a valid structural product-image reference required by the storyboard schema.
- Do not write the final CTA caption or narration as though the CTA scene visibly shows the product image referenced by imageIndex.
- For the final CTA scene, focus the caption and narration on the customer's exact call to action and, when supplied, the website.
- Every uploaded image must be used by at least one non-CTA scene.
- PRODUCT IMAGE ORDER RULE: Product scenes must follow the customer's uploaded image order and must never return to an earlier uploaded image.
- Preserve this order whether the images show unrelated products or different views of the same product.
- With 1 uploaded image, the four non-CTA scenes must use image indexes 1, 1, 1, 1.
- With 2 uploaded images, the four non-CTA scenes must use image indexes 1, 1, 2, 2.
- With 3 uploaded images, the four non-CTA scenes must use image indexes 1, 1, 2, 3.
- With 4 uploaded images, the four non-CTA scenes must use image indexes 1, 2, 3, 4.
- With 5 through 10 uploaded images, give every uploaded image exactly one normal content scene in upload order, followed by the dedicated CTA scene. Scenes 1 through ${imageCount} must use image indexes 1 through ${imageCount} exactly once.
- Do not turn Scene ${imageCount} into the call to action when there are 5 through 10 uploaded images. Scene ${imageCount} must remain a normal content scene for uploaded image ${imageCount}.
- For every non-CTA scene, write the caption and narration specifically for the visible content of its assigned product image.
- Motion must remain controlled and subtle.
- Avoid rapid or excessive zooming.
- Use the customer's exact call to action.
- If no website is supplied, return an empty website string.
- narrationWordCount must equal the actual narration word count.
`.trim();
}

function buildAutoDurationInstructions({
  minimumDurationTierSeconds,
  maxDurationSeconds
}) {
  const eligibleTiers = [30, 45, 60]
    .filter(
      (seconds) =>
        seconds >= minimumDurationTierSeconds &&
        seconds <= maxDurationSeconds
    );

  return `
AI DURATION DECISION:
- The customer selected Let AI Decide.
- Choose exactly one duration tier from: ${eligibleTiers.join(", ")} seconds.
- Base the decision on the customer description, website, call to action, and visible useful content in the uploaded images.
- Uploaded image count establishes which tiers are eligible, but image count alone must not determine the chosen tier.
- Prefer the shortest eligible tier that gives the supplied content enough room for a strong, natural, useful advertisement.
- Choose a longer eligible tier only when the supplied content genuinely benefits from the additional storytelling time.
- Do not choose a longer tier merely because it is available.
- Do not invent or repeat unsupported claims to justify a longer video.
- durationTierSeconds must be the duration tier you choose.
- Generate the storyboard to fit naturally within the chosen durationTierSeconds tier.
- If durationTierSeconds is 30, totalDurationSeconds must be 27-30 seconds.
- If durationTierSeconds is 45, totalDurationSeconds must be 41-45 seconds.
- If durationTierSeconds is 60, totalDurationSeconds must be 55-60 seconds.
- If durationTierSeconds is 30, total narration must contain no more than 65 words.
- If durationTierSeconds is 45, total narration must contain no more than 95 words.
- If durationTierSeconds is 60, total narration must contain no more than 125 words.
- The narration word limit for the chosen durationTierSeconds overrides any larger narration allowance stated by the plan ceiling.
`.trim();
}

function buildProjectPrompt(project, language = "en") {
  const imageCount =
    project.assets.productImages.length;
  const languageDescription = describeLanguage(language);

  return `
Create a finished promotional-video storyboard using these customer details.

TARGET LANGUAGE: ${languageDescription}
You MUST write ALL titles, captions, and narration in this language.

Product description:
${project.description || "(none supplied — identify the product or business only from clearly visible image content)"}

Website:
${project.website || "(none supplied)"}

Call to action:
${project.callToAction}

Selected style:
${project.style}

Available product images:
${imageCount}

Valid image indexes:
1 through ${imageCount}

The title should be short and customer-facing.
The music direction should match the selected style.
Use concrete benefit-focused language without inventing unsupported facts.
If the customer supplied a description, treat it as authoritative.
If no description was supplied, infer only what is clearly visible in the uploaded images.
Do not invent a brand, price, material, feature, compatibility, certification, guarantee, or unsupported use case.
When the image is ambiguous, use cautious generic wording that the customer can revise during plan review.
Preserve the uploaded image order when assigning scenes.
For example, with 3 uploaded images, the four normal content scenes must use image indexes 1, 1, 2, 3, followed by the dedicated CTA scene.
Never alternate backward between uploaded images such as 1, 2, 1, 2.
The customer can revise scene content during plan review.
`.trim();
}

function getImageMimeType(asset) {
  if (
    typeof asset.mimeType === "string" &&
    asset.mimeType.startsWith("image/")
  ) {
    return asset.mimeType;
  }

  const extension = path
    .extname(asset.storedName)
    .toLowerCase();

  const mimeTypes = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp"
  };

  const mimeType = mimeTypes[extension];

  if (!mimeType) {
    throw new Error(
      `Unsupported product image: ${asset.storedName}`
    );
  }

  return mimeType;
}

async function buildImageContent({
  project,
  projectDirectory
}) {
  const imageContent = [];

  for (
    let index = 0;
    index < project.assets.productImages.length;
    index += 1
  ) {
    const asset =
      project.assets.productImages[index];

    const imagePath = path.join(
      projectDirectory,
      asset.storedName
    );

    const imageBuffer =
      await fs.readFile(imagePath);

    const mimeType =
      getImageMimeType(asset);

    imageContent.push(
      {
        type: "input_text",
        text:
          `Product image ${index + 1}. ` +
          "Use this exact number when assigning imageIndex."
      },
      {
        type: "input_image",
        image_url:
          `data:${mimeType};base64,${imageBuffer.toString("base64")}`,
        detail: "auto"
      }
    );
  }

  return imageContent;
}

function splitCaptionText(text, maxCharacters = 60) {
  const source =
    String(text ?? "").trim();

  if (source.length <= maxCharacters) {
    return [source];
  }

  const characters =
    Array.from(source);

  const chunks = [];
  let remaining =
    characters;

  const punctuationBoundaries =
    new Set([
      "।",
      ".",
      "!",
      "?",
      "！",
      "？",
      "。",
      ";",
      "；",
      ":",
      "：",
      ",",
      "，",
      "、",
      "—",
      "–",
      "-"
    ]);

  while (remaining.length > maxCharacters) {
    let splitIndex = -1;

    const targetIndex =
      Math.min(
        Math.round(remaining.length / 2),
        maxCharacters
      );

    const minimumBalancedIndex =
      Math.max(
        1,
        Math.floor(targetIndex * 0.6)
      );

    let bestBoundaryIndex = -1;
    let bestBoundaryScore =
      Number.POSITIVE_INFINITY;

    for (
      let index = minimumBalancedIndex;
      index <= maxCharacters;
      index++
    ) {
      const boundaryCharacter =
        remaining[index - 1];

      const isPunctuation =
        punctuationBoundaries.has(
          boundaryCharacter
        );

      const isSpace =
        boundaryCharacter === " ";

      if (
        !isPunctuation &&
        !isSpace
      ) {
        continue;
      }

      const distance =
        Math.abs(index - targetIndex);

      const punctuationBonus =
        isPunctuation
          ? Math.min(
              8,
              Math.floor(targetIndex * 0.15)
            )
          : 0;

      const score =
        distance - punctuationBonus;

      if (score < bestBoundaryScore) {
        bestBoundaryScore = score;
        bestBoundaryIndex = index;
      }
    }

    if (bestBoundaryIndex > 0) {
      splitIndex =
        bestBoundaryIndex;
    }

    if (splitIndex <= 0) {
      splitIndex =
        maxCharacters;
    }

    const chunk =
      remaining
        .slice(0, splitIndex)
        .join("")
        .trim();

    if (chunk) {
      chunks.push(chunk);
    }

    remaining =
      remaining
        .slice(splitIndex);

    while (
      remaining.length > 0 &&
      remaining[0] === " "
    ) {
      remaining =
        remaining.slice(1);
    }
  }

  const finalChunk =
    remaining
      .join("")
      .trim();

  if (finalChunk) {
    chunks.push(finalChunk);
  }

  return chunks;
}
function normalizeGeneratedCaptionSegments(storyboard) {
  return {
    ...storyboard,
    scenes: storyboard.scenes.map((scene) => {
      if (
        !Array.isArray(scene.captionSegments) ||
        scene.captionSegments.length === 0
      ) {
        return scene;
      }

      let captionSegments =
        scene.captionSegments.map((segment) => ({
          ...segment,
          text: String(segment.text ?? "").trim(),
          emphasisWords:
            Array.isArray(segment.emphasisWords)
              ? segment.emphasisWords
                  .map((term) =>
                    String(term).trim()
                  )
                  .filter(Boolean)
              : []
        }));

      const needsRedistribution =
        captionSegments.some(
          (segment) =>
            Array.from(segment.text).length > 60
        );

      if (needsRedistribution) {
        const completeText =
          captionSegments
            .map((segment) => segment.text)
            .join(" ")
            .trim()
            .replace(/\s+/gu, " ");

        const redistributedTexts =
          splitCaptionText(
            completeText,
            60
          );

        if (
          redistributedTexts.length >= 1 &&
          redistributedTexts.length <= 3
        ) {
          const originalEmphasis =
            captionSegments
              .flatMap((segment) =>
                segment.emphasisWords
              )
              .filter(Boolean);

          captionSegments =
            redistributedTexts.map((text) => {
              const matchingEmphasis =
                originalEmphasis
                  .filter((term) =>
                    text.includes(term)
                  )
                  .filter(
                    (term, index, terms) =>
                      terms.indexOf(term) === index
                  )
                  .slice(0, 2);

              if (matchingEmphasis.length === 0) {
                const fallbackTerm =
                  text
                    .split(/\s+/u)
                    .filter(Boolean)
                    .sort(
                      (left, right) =>
                        Array.from(right).length -
                        Array.from(left).length
                    )[0] ?? text;

                matchingEmphasis.push(
                  fallbackTerm
                );
              }

              return {
                text,
                emphasisWords:
                  matchingEmphasis
              };
            });
        }
      }

      const firstSegment =
        captionSegments[0];

      return {
        ...scene,
        captionSegments,
        narration:
          captionSegments
            .map((segment) => segment.text)
            .join(" "),
        caption:
          firstSegment.text,
        emphasisWords:
          [...firstSegment.emphasisWords]
      };
    })
  };
}
export const __storyboardGeneratorTestHelpers = {
  buildSystemInstructions,
  normalizeGeneratedCaptionSegments,
  mergeNarrationCorrection,
  normalizeGeneratedStoryboard,
  splitCaptionText
};
function normalizeWordCount(storyboard) {
  const narration = storyboard.scenes
    .map((scene) => scene.narration)
    .join(" ");

  return {
    ...storyboard,
    narrationWordCount:
      countWords(narration)
  };
}

function normalizeGeneratedStoryboard(
  storyboard
) {
  return normalizeWordCount(
    normalizeGeneratedCaptionSegments(
      storyboard
    )
  );
}

function mergeNarrationCorrection({
  storyboard,
  correctedScenes
}) {
  if (
    !storyboard ||
    !Array.isArray(storyboard.scenes)
  ) {
    throw new Error(
      "Storyboard is required for narration correction."
    );
  }

  if (
    !Array.isArray(correctedScenes) ||
    correctedScenes.length !==
      storyboard.scenes.length
  ) {
    throw new Error(
      "Narration correction must contain exactly one entry for every scene."
    );
  }

  const correctionBySceneNumber =
    new Map();

  for (const correction of correctedScenes) {
    const sceneNumber =
      Number(correction?.sceneNumber);

    if (
      !Number.isInteger(sceneNumber) ||
      correctionBySceneNumber.has(
        sceneNumber
      )
    ) {
      throw new Error(
        "Narration correction scene numbers must be unique integers."
      );
    }

    if (
      !Array.isArray(
        correction.captionSegments
      ) ||
      correction.captionSegments.length < 1 ||
      correction.captionSegments.length > 3
    ) {
      throw new Error(
        `Scene ${sceneNumber} narration correction must contain 1-3 caption segments.`
      );
    }

    correctionBySceneNumber.set(
      sceneNumber,
      correction.captionSegments
    );
  }

  const correctedStoryboard = {
    ...storyboard,
    scenes: storyboard.scenes.map(
      (scene) => {
        const captionSegments =
          correctionBySceneNumber.get(
            scene.sceneNumber
          );

        if (!captionSegments) {
          throw new Error(
            `Narration correction is missing scene ${scene.sceneNumber}.`
          );
        }

        return {
          ...scene,
          captionSegments
        };
      }
    )
  };

  return normalizeGeneratedStoryboard(
    correctedStoryboard
  );
}

export async function correctNarrationToDurationBudget({
  storyboard,
  durationTierSeconds,
  measuredNarrationDurationSeconds,
  language = "en",
  apiKey = process.env.OPENAI_API_KEY,
  model =
    process.env.OPENAI_MODEL ||
    "gpt-5.6-luna"
}) {
  const allowedDurationTiers =
    [30, 45, 60];

  if (
    !allowedDurationTiers.includes(
      durationTierSeconds
    )
  ) {
    throw new Error(
      "durationTierSeconds must be 30, 45, or 60."
    );
  }

  const measuredDuration =
    Number(
      measuredNarrationDurationSeconds
    );

  if (
    !Number.isFinite(measuredDuration) ||
    measuredDuration < 0
  ) {
    throw new Error(
      "Measured narration duration must be non-negative."
    );
  }

  if (
    !storyboard ||
    !Array.isArray(storyboard.scenes) ||
    storyboard.scenes.length === 0
  ) {
    throw new Error(
      "Storyboard is required for narration correction."
    );
  }

  if (!apiKey) {
    const error = new Error(
      "OPENAI_API_KEY is not configured."
    );

    error.code =
      "OPENAI_API_KEY_MISSING";

    throw error;
  }

  const budgetSeconds =
    durationTierSeconds * 0.9;

  const languageDescription =
    describeLanguage(language);

  const originalScenes =
    storyboard.scenes.map(
      (scene) => ({
        sceneNumber:
          scene.sceneNumber,
        narration:
          scene.narration
      })
    );

  const client = new OpenAI({
    apiKey
  });

  const response =
    await client.responses.parse({
      model,
      store: false,
      input: [
        {
          role: "system",
          content:
            "You shorten narration for a vertical promotional video. " +
            "Return only corrected caption segments for every scene. " +
            "Preserve the original meaning, product facts, scene order, CTA intent, brand names, URLs, and target language. " +
            "Do not add new claims or facts. " +
            "Do not change scene numbers. " +
            "Each scene must contain 1-3 caption segments. " +
            "Each caption segment must be 1-60 characters and contain 1-2 emphasis terms copied exactly from that segment text. " +
            "Every spoken word must appear in the caption segments in the same order. " +
            "The joined caption segments become the complete narration for that scene. " +
            "Shorten the combined narration enough that its natural spoken duration is comfortably at or below the supplied duration budget. " +
            `Use concise, natural ${languageDescription} marketing language. ` +
            "Do not mention this correction process."
        },
        {
          role: "user",
          content:
            `Duration tier: ${durationTierSeconds} seconds.\n` +
            `Maximum natural narration budget: ${budgetSeconds} seconds.\n` +
            `Measured natural narration before correction: ${measuredDuration} seconds.\n` +
            `Target language: ${languageDescription}.\n\n` +
            "Shorten these scene narrations while preserving their meaning:\n" +
            JSON.stringify(
              originalScenes,
              null,
              2
            )
        }
      ],
      text: {
        format: zodTextFormat(
          NarrationCorrectionSchema,
          "pix2vid_narration_correction"
        )
      }
    });

  if (!response.output_parsed) {
    const error = new Error(
      "OpenAI did not return a narration correction."
    );

    error.code =
      "NARRATION_CORRECTION_OUTPUT_MISSING";

    throw error;
  }

  const correctedStoryboard =
    mergeNarrationCorrection({
      storyboard,
      correctedScenes:
        response.output_parsed.scenes
    });

  const validation =
    validateStoryboard(
      correctedStoryboard,
      {
        imageCount:
          Math.max(
            1,
            ...correctedStoryboard.scenes.map(
              (scene) =>
                Number(scene.imageIndex) + 1
            )
          ),
        minDurationSeconds:
          getTargetDurationFloor(
            durationTierSeconds
          ),
        maxDurationSeconds:
          durationTierSeconds
      }
    );

  if (!validation.ok) {
    const error = new Error(
      `Corrected narration failed storyboard validation: ${validation.errors.join("; ")}`
    );

    error.code =
      "NARRATION_CORRECTION_INVALID";

    error.validationErrors =
      validation.errors;

    throw error;
  }

  return {
    storyboard:
      validation.storyboard,
    generation: {
      provider: "openai",
      model,
      responseId:
        response.id,
      generatedAt:
        new Date().toISOString(),
      usage:
        response.usage ?? null,
      reason:
        "narration_duration_budget",
      durationTierSeconds,
      budgetSeconds,
      measuredBeforeSeconds:
        measuredDuration
    }
  };
}

export async function generateStoryboard({
  project,
  projectDirectory,
  maxDurationSeconds = 30,
  durationMode = "manual",
  minimumDurationTierSeconds = 30,
  apiKey = process.env.OPENAI_API_KEY,
  model =
    process.env.OPENAI_MODEL ||
    "gpt-5.6-luna"
}) {
  const allowedDurationTiers = [30, 45, 60];

  if (!["manual", "auto"].includes(durationMode)) {
    throw new Error(
      "durationMode must be manual or auto."
    );
  }

  if (
    !allowedDurationTiers.includes(
      maxDurationSeconds
    )
  ) {
    throw new Error(
      "maxDurationSeconds must be 30, 45, or 60."
    );
  }

  if (
    !allowedDurationTiers.includes(
      minimumDurationTierSeconds
    ) ||
    minimumDurationTierSeconds >
      maxDurationSeconds
  ) {
    throw new Error(
      "minimumDurationTierSeconds must be an allowed tier at or below maxDurationSeconds."
    );
  }

  if (!apiKey) {
    const error = new Error(
      "OPENAI_API_KEY is not configured."
    );

    error.code = "OPENAI_API_KEY_MISSING";
    throw error;
  }

  if (
    !project?.assets?.productImages?.length
  ) {
    throw new Error(
      "The project has no product images."
    );
  }

  if (!projectDirectory) {
    throw new Error(
      "The project directory was not supplied."
    );
  }

  const imageCount =
    project.assets.productImages.length;

  const imageContent =
    await buildImageContent({
      project,
      projectDirectory
    });

  const client = new OpenAI({
    apiKey
  });

  const systemInstructions =
    durationMode === "auto"
      ? buildSystemInstructions(
          project.language || project.targetLanguage || "en",
          maxDurationSeconds,
          durationMode,
          imageCount
        ) +
        "\n\n" +
        buildAutoDurationInstructions({
          minimumDurationTierSeconds,
          maxDurationSeconds
        })
      : buildSystemInstructions(
          project.language || project.targetLanguage || "en",
          maxDurationSeconds,
          durationMode,
          imageCount
        );

  const projectInstructions =
    buildProjectPrompt(
      project,
      project.language ||
        project.targetLanguage ||
        "en"
    ) +
    "\n\nInspect every supplied image before writing the storyboard. " +
    "Match each scene to visible image content. " +
    "Do not claim that an object or feature is visible unless it actually appears. " +
    "If the customer description and images conflict, avoid inventing details.";

  let validationErrors = null;
  let retryDurationTierSeconds = null;

  for (
    let attempt = 1;
    attempt <= 2;
    attempt += 1
  ) {
    const correctionInstructions =
      attempt === 2
        ? "\n\nCORRECTION REQUIRED:\n" +
          "The previous storyboard failed validation for these reasons:\n- " +
          validationErrors.join("\n- ") +
          "\nRegenerate the complete storyboard from scratch. " +
          "Correct every listed validation problem while preserving the customer's supplied facts. " +
          (
            durationMode === "auto"
              ? `You MUST keep durationTierSeconds exactly ${retryDurationTierSeconds}. `
              : `You MUST keep the ${maxDurationSeconds}-second duration tier. `
          ) +
          "Do not mention the correction or validation process in the customer-facing storyboard."
        : "";

    const response =
      await client.responses.parse({
        model,
        store: false,
        input: [
          {
            role: "system",
            content:
              systemInstructions +
              correctionInstructions
          },
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text:
                  projectInstructions
              },
              ...imageContent
            ]
          }
        ],
        text: {
          format: zodTextFormat(
            durationMode === "auto"
              ? AutoStoryboardResultSchema
              : StoryboardSchema,
            durationMode === "auto"
              ? "quickad_auto_storyboard"
              : "quickad_storyboard"
          )
        }
      });

    if (!response.output_parsed) {
      const error = new Error(
        "OpenAI did not return a completed storyboard."
      );

      error.code =
        "STORYBOARD_OUTPUT_MISSING";

      throw error;
    }

    const parsedResult =
      response.output_parsed;

    const resolvedDurationTierSeconds =
      durationMode === "auto"
        ? parsedResult.durationTierSeconds
        : maxDurationSeconds;

    if (
      !allowedDurationTiers.includes(
        resolvedDurationTierSeconds
      ) ||
      resolvedDurationTierSeconds <
        minimumDurationTierSeconds ||
      resolvedDurationTierSeconds >
        maxDurationSeconds
    ) {
      const error = new Error(
        "AI selected an ineligible duration tier."
      );

      error.code =
        "STORYBOARD_DURATION_TIER_INVALID";

      throw error;
    }

    if (
      attempt === 2 &&
      durationMode === "auto" &&
      resolvedDurationTierSeconds !==
        retryDurationTierSeconds
    ) {
      const error = new Error(
        "AI changed the selected duration tier during storyboard correction."
      );

      error.code =
        "STORYBOARD_DURATION_TIER_CHANGED";

      throw error;
    }

    const generatedStoryboard =
      durationMode === "auto"
        ? parsedResult.storyboard
        : parsedResult;

    const storyboard =
      normalizeGeneratedStoryboard(
        generatedStoryboard
      );
    const validation =
      validateStoryboard(
        storyboard,
        {
          imageCount:
            project.assets.productImages.length,
          minDurationSeconds:
            getTargetDurationFloor(
              resolvedDurationTierSeconds
            ),
          maxDurationSeconds:
            resolvedDurationTierSeconds
        }
      );

    if (validation.ok) {
      return {
        storyboard:
          validation.storyboard,
        durationTierSeconds:
          resolvedDurationTierSeconds,
        generation: {
          provider: "openai",
          model,
          responseId: response.id,
          generatedAt:
            new Date().toISOString(),
          usage: response.usage ?? null,
          attempts: attempt
        }
      };
    }

    validationErrors =
      validation.errors;

    retryDurationTierSeconds =
      resolvedDurationTierSeconds;

    if (attempt === 2) {
      const error = new Error(
        `Generated storyboard failed validation after retry: ${validation.errors.join(" ")}`
      );

      error.code =
        "STORYBOARD_VALIDATION_FAILED";

      error.validationErrors =
        validation.errors;

      throw error;
    }
  }
}
