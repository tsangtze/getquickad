import fs from "node:fs/promises";
import path from "node:path";
import OpenAI from "openai";
import {
  zodTextFormat
} from "openai/helpers/zod";
import {
  StoryboardSchema,
  validateStoryboard
} from "./storyboardSchema.mjs";

function countWords(text) {
  return String(text)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .length;
}

function buildSystemInstructions() {
  return `
You create concise vertical promotional-video storyboards.

Return one complete storyboard for a 20-30 second 9:16 social-media advertisement.

Rules:
- Use exactly 5 scenes.
- Scene 1 must be the hook.
- Scene 5 must be the call to action.
- Use this exact timeline:
  Scene 1: 0-4 seconds
  Scene 2: 4-9 seconds
  Scene 3: 9-15 seconds
  Scene 4: 15-20 seconds
  Scene 5: 20-25 seconds
- Set totalDurationSeconds to 25.
- Narration across all scenes must contain 9-50 words.
- Captions must be concise and contain no more than 60 characters.
- For every scene, narration must exactly equal caption so the spoken and displayed words match.
- Never invent certifications, reviews, discounts, guarantees, or product features.
- Use only facts supplied by the customer.
- imageIndex must reference an available uploaded image.
- Follow the customer's upload order by default.
- Scene 1 must use imageIndex 1.
- Scene 2 must use imageIndex 2 when at least 2 images are available.
- Continue matching scene numbers to image indexes until every uploaded image has been used or all 5 scenes are assigned.
- Reuse images only after every available uploaded image has appeared once.
- When images must be reused, restart from imageIndex 1 and continue in upload order.
- Write each scene caption and narration specifically for the visible content of its assigned image.
- Motion must remain controlled and subtle.
- Avoid rapid or excessive zooming.
- Use the customer's exact call to action.
- If no website is supplied, return an empty website string.
- narrationWordCount must equal the actual narration word count.
`.trim();
}

function buildProjectPrompt(project) {
  const imageCount =
    project.assets.productImages.length;

  return `
Create a finished promotional-video storyboard using these customer details.

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
  apiKey = process.env.OPENAI_API_KEY,
  model =
    process.env.OPENAI_MODEL ||
    "gpt-5.6-luna"
}) {
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

  const response =
    await client.responses.parse({
      model,
      store: false,
      input: [
        {
          role: "system",
          content:
            buildSystemInstructions()
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text:
                buildProjectPrompt(project) +
                "\n\nInspect every supplied image before writing the storyboard. " +
                "Match each scene to visible image content. " +
                "Do not claim that an object or feature is visible unless it actually appears. " +
                "If the customer description and images conflict, avoid inventing details."
            },
            ...imageContent
          ]
        }
      ],
      text: {
        format: zodTextFormat(
          StoryboardSchema,
          "quickad_storyboard"
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

  const storyboard =
    normalizeWordCount(
      response.output_parsed
    );

  const validation =
    validateStoryboard(
      storyboard,
      {
        imageCount:
          project.assets.productImages.length
      }
    );

  if (!validation.ok) {
    const error = new Error(
      `Generated storyboard failed validation: ${validation.errors.join(" ")}`
    );

    error.code =
      "STORYBOARD_VALIDATION_FAILED";

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
      responseId: response.id,
      generatedAt:
        new Date().toISOString(),
      usage: response.usage ?? null
    }
  };
}
