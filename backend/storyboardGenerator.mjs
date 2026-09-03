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
  if (normalized.startsWith("zh")) return "Chinese (Simplified Chinese, zh)";
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

function buildSystemInstructions(language = "en", maxDurationSeconds = 30, durationMode = "manual") {
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
- Use exactly 5 scenes.
- Scene 1 must be the hook.
- Scene 5 must be the call to action.
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
- Scene 5 must end exactly at totalDurationSeconds.
- Set totalDurationSeconds to the actual chosen duration.
- Narration across all scenes must contain 9-${maxNarrationWords} words.
- Captions must be concise and contain no more than 60 characters.
- Narration is the spoken voiceover and may be longer than the caption.
- Keep each scene narration short enough to be spoken naturally within that scene's assigned duration.
- Each scene narration must contain no more than floor(scene duration in seconds × 2.5) words. Examples: 4 seconds = 10 words, 6 seconds = 15 words, 10 seconds = 25 words.
- Keep captions short and readable on screen; do not copy the full narration into the caption unless it is naturally brief.
- Never invent certifications, reviews, discounts, guarantees, or product features.
- Use only facts supplied by the customer.
- imageIndex must reference an available uploaded image.
- Follow the customer's upload order by default.
- Scene 1 must use imageIndex 1.
- Scene 2 must use imageIndex 2 when at least 2 images are available.
- Continue matching scene numbers to image indexes in upload order while unused images are available.
- Uploaded images are an available creative pool; it is not required to use every uploaded image when more images are supplied than the storyboard needs.
- When there are fewer uploaded images than scenes, reuse images as needed, restarting from imageIndex 1 and continuing in upload order.
- One uploaded image may be reused across all 5 scenes when it is the only image available.
- Write each scene caption and narration specifically for the visible content of its assigned image.
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
- If durationTierSeconds is 30, total narration must contain 9-65 words.
- If durationTierSeconds is 45, total narration must contain 9-95 words.
- If durationTierSeconds is 60, total narration must contain 9-125 words.
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
For example, with 3 images use image indexes 1, 2, 3, 1, 2.
The customer can revise this order during plan review.
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
          durationMode
        ) +
        "\n\n" +
        buildAutoDurationInstructions({
          minimumDurationTierSeconds,
          maxDurationSeconds
        })
      : buildSystemInstructions(
          project.language || project.targetLanguage || "en",
          maxDurationSeconds,
          durationMode
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

    const storyboard =
      normalizeWordCount(
        durationMode === "auto"
          ? parsedResult.storyboard
          : parsedResult
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
