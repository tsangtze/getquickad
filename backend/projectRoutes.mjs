import crypto from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import express from "express";
import multer from "multer";
import {
  generateStoryboard
} from "./storyboardGenerator.mjs";
import {
  validateStoryboard
} from "./storyboardSchema.mjs";
import {
  generateNarration
} from "./narrationGenerator.mjs";
import {
  renderVideo
} from "./videoRenderer.mjs";


const MAX_IMAGE_COUNT = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"]
]);

const ALLOWED_STYLES = new Set([
  "Professional",
  "Energetic",
  "Elegant",
  "Simple"
]);

function cleanText(value, maximumLength) {
  return String(value ?? "")
    .trim()
    .slice(0, maximumLength);
}

function normalizeWebsite(value) {
  const suppliedWebsite =
    cleanText(value, 250);

  if (!suppliedWebsite) {
    return {
      website: ""
    };
  }

  if (/\s/.test(suppliedWebsite)) {
    return {
      error:
        "Enter only the website address, without additional words."
    };
  }

  const websiteWithProtocol =
    /^[a-z][a-z0-9+.-]*:\/\//i.test(
      suppliedWebsite
    )
      ? suppliedWebsite
      : `https://${suppliedWebsite}`;

  try {
    const parsedWebsite =
      new URL(websiteWithProtocol);

    if (
      !["http:", "https:"].includes(
        parsedWebsite.protocol
      ) ||
      !parsedWebsite.hostname
    ) {
      return {
        error:
          "Enter a valid website address."
      };
    }

    return {
      website:
        parsedWebsite.toString()
    };
  } catch {
    return {
      error:
        "Enter a valid website address."
    };
  }
}

function createUploadMiddleware(tempDirectory) {
  const storage = multer.diskStorage({
    destination: (_request, _file, callback) => {
      callback(null, tempDirectory);
    },
    filename: (_request, file, callback) => {
      const extension =
        ALLOWED_MIME_TYPES.get(file.mimetype) || "";

      callback(
        null,
        `${Date.now()}-${crypto.randomUUID()}${extension}`
      );
    }
  });

  return multer({
    storage,
    limits: {
      files: MAX_IMAGE_COUNT + 1,
      fileSize: MAX_FILE_SIZE,
      fields: 10
    },
    fileFilter: (_request, file, callback) => {
      if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
        callback(
          new multer.MulterError(
            "LIMIT_UNEXPECTED_FILE",
            file.fieldname
          )
        );
        return;
      }

      callback(null, true);
    }
  }).fields([
    {
      name: "productImages",
      maxCount: MAX_IMAGE_COUNT
    },
    {
      name: "productLogo",
      maxCount: 1
    }
  ]);
}

function allUploadedFiles(request) {
  if (!request.files) {
    return [];
  }

  return Object.values(request.files).flat();
}

async function removeFiles(files) {
  await Promise.all(
    files.map((file) =>
      fs.rm(file.path, { force: true }).catch(() => {})
    )
  );
}

function validateProject(request) {
  const productImages =
    request.files?.productImages ?? [];

  const description = cleanText(
    request.body.description,
    500
  );

  const websiteResult =
    normalizeWebsite(
      request.body.website
    );

  const callToAction = cleanText(
    request.body.callToAction,
    40
  ) || "Shop Now";

  const style = cleanText(
    request.body.style,
    40
  );

  if (productImages.length < 1) {
    return {
      error: "Please upload at least one product image."
    };
  }

  if (productImages.length > MAX_IMAGE_COUNT) {
    return {
      error: `A maximum of ${MAX_IMAGE_COUNT} product images is allowed.`
    };
  }


  if (websiteResult.error) {
    return {
      error:
        websiteResult.error
    };
  }

  if (!ALLOWED_STYLES.has(style)) {
    return {
      error: "Please choose a valid video style."
    };
  }

  return {
    productImages,
    productLogo:
      request.files?.productLogo?.[0] ?? null,
    description,
    website:
      websiteResult.website,
    callToAction,
    style
  };
}

async function moveProjectAssets({
  projectDirectory,
  productImages,
  productLogo
}) {
  const savedImages = [];

  for (const [index, file] of productImages.entries()) {
    const extension =
      ALLOWED_MIME_TYPES.get(file.mimetype);

    const storedName =
      `product-${String(index + 1).padStart(2, "0")}${extension}`;

    await fs.rename(
      file.path,
      path.join(projectDirectory, storedName)
    );

    savedImages.push({
      originalName: file.originalname,
      storedName,
      mimeType: file.mimetype,
      size: file.size
    });
  }

  let savedLogo = null;

  if (productLogo) {
    const extension =
      ALLOWED_MIME_TYPES.get(productLogo.mimetype);

    const storedName = `logo${extension}`;

    await fs.rename(
      productLogo.path,
      path.join(projectDirectory, storedName)
    );

    savedLogo = {
      originalName: productLogo.originalname,
      storedName,
      mimeType: productLogo.mimetype,
      size: productLogo.size
    };
  }

  return {
    productImages: savedImages,
    productLogo: savedLogo
  };
}

export async function createProjectRouter({
  projectRoot
}) {
  const router = express.Router();

  const tempDirectory =
    path.join(projectRoot, "temp");

  const projectsDirectory =
    path.join(projectRoot, "projects");

  await fs.mkdir(tempDirectory, {
    recursive: true
  });

  await fs.mkdir(projectsDirectory, {
    recursive: true
  });

  const uploadProject =
    createUploadMiddleware(tempDirectory);

  router.post(
    "/",
    uploadProject,
    async (request, response, next) => {
      const uploadedFiles =
        allUploadedFiles(request);

      let projectDirectory = "";

      try {
        const validated =
          validateProject(request);

        if (validated.error) {
          await removeFiles(uploadedFiles);

          response.status(400).json({
            ok: false,
            error: validated.error
          });
          return;
        }

        const projectId =
          crypto.randomUUID();

        projectDirectory = path.join(
          projectsDirectory,
          projectId
        );

        await fs.mkdir(projectDirectory, {
          recursive: false
        });

        const assets =
          await moveProjectAssets({
            projectDirectory,
            productImages:
              validated.productImages,
            productLogo:
              validated.productLogo
          });

        const project = {
          id: projectId,
          status: "uploaded",
          createdAt: new Date().toISOString(),
          description:
            validated.description,
          website:
            validated.website,
          callToAction:
            validated.callToAction,
          style:
            validated.style,
          output: {
            aspectRatio: "9:16",
            durationSeconds: "20-30",
            format: "mp4"
          },
          assets
        };

        const projectPath = path.join(
          projectDirectory,
          "project.json"
        );

        project.status =
          "generating_storyboard";

        await fs.writeFile(
          projectPath,
          JSON.stringify(project, null, 2),
          "utf8"
        );

        try {
          const result =
            await generateStoryboard({
              project,
              projectDirectory
            });

          const storyboardRecord = {
            projectId:
              project.id,
            ...result
          };

          await fs.writeFile(
            path.join(
              projectDirectory,
              "storyboard.json"
            ),
            JSON.stringify(
              storyboardRecord,
              null,
              2
            ),
            "utf8"
          );

          project.status =
            "storyboard_ready";

          project.storyboard = {
            title:
              result.storyboard.title,
            sceneCount:
              result.storyboard.scenes.length,
            durationSeconds:
              result.storyboard.totalDurationSeconds,
            narrationWordCount:
              result.storyboard.narrationWordCount,
            model:
              result.generation.model,
            generatedAt:
              result.generation.generatedAt,
            reviewRequired:
              true
          };

          await fs.writeFile(
            projectPath,
            JSON.stringify(
              project,
              null,
              2
            ),
            "utf8"
          );

          response.status(201).json({
            ok: true,
            stage:
              "plan_review",
            project,
            storyboard:
              result.storyboard
          });
        } catch (generationError) {
          console.error(
            "Storyboard generation failed:",
            generationError
          );

          project.status =
            "storyboard_failed";

          project.generationError = {
            stage:
              "storyboard",
            code:
              generationError.code ||
              "STORYBOARD_GENERATION_FAILED",
            failedAt:
              new Date().toISOString()
          };

          await fs.writeFile(
            projectPath,
            JSON.stringify(
              project,
              null,
              2
            ),
            "utf8"
          );

          const missingConfiguration =
            generationError.code ===
            "OPENAI_API_KEY_MISSING";

          response
            .status(
              missingConfiguration
                ? 503
                : 502
            )
            .json({
              ok: false,
              error:
                missingConfiguration
                  ? "AI storyboard generation is not configured."
                  : "The project was uploaded, but its video plan could not be generated. Please try again.",
              project: {
                id:
                  project.id,
                status:
                  project.status
              }
            });
        }      } catch (error) {
        await removeFiles(uploadedFiles);

        if (projectDirectory) {
          await fs.rm(projectDirectory, {
            recursive: true,
            force: true
          });
        }

        next(error);
      }
    }
  );

  router.get(
    "/:projectId/video",
    async (request, response) => {
      const projectId =
        String(request.params.projectId ?? "");

      if (
        !/^[0-9a-f-]{36}$/i.test(projectId)
      ) {
        response.status(400).json({
          ok: false,
          error: "Invalid project ID."
        });
        return;
      }

      const videoPath = path.join(
        projectsDirectory,
        projectId,
        "video.mp4"
      );

      try {
        await fs.access(videoPath);
        response.sendFile(videoPath);
      } catch {
        response.status(404).json({
          ok: false,
          error: "The finished video was not found."
        });
      }
    }
  );

  router.post(
    "/:projectId/finalize",
    async (request, response) => {
      const projectId =
        String(request.params.projectId ?? "");

      if (
        !/^[0-9a-f-]{36}$/i.test(projectId)
      ) {
        response.status(400).json({
          ok: false,
          error: "Invalid project ID."
        });
        return;
      }

      const projectDirectory = path.join(
        projectsDirectory,
        projectId
      );

      const projectPath = path.join(
        projectDirectory,
        "project.json"
      );

      const storyboardPath = path.join(
        projectDirectory,
        "storyboard.json"
      );

      let project;
      let generationStage = "approval";

      try {
        project = JSON.parse(
          await fs.readFile(
            projectPath,
            "utf8"
          )
        );

        const existingStoryboardRecord =
          JSON.parse(
            await fs.readFile(
              storyboardPath,
              "utf8"
            )
          );

        const submittedStoryboardInput =
          request.body?.storyboard;

        const synchronizedScenes =
          Array.isArray(
            submittedStoryboardInput?.scenes
          )
            ? submittedStoryboardInput.scenes.map(
                (scene) => {
                  const caption =
                    String(
                      scene.caption ?? ""
                    ).trim();

                  return {
                    ...scene,
                    caption,
                    narration:
                      caption
                  };
                }
              )
            : null;

        const synchronizedNarrationText =
          synchronizedScenes
            ?.map((scene) =>
              scene.narration
            )
            .filter(Boolean)
            .join(" ") || "";

        const synchronizedWordCount =
          synchronizedNarrationText
            ? synchronizedNarrationText
                .split(/\s+/)
                .filter(Boolean)
                .length
            : 0;

        const submittedStoryboard =
          synchronizedScenes
            ? {
                ...submittedStoryboardInput,
                scenes:
                  synchronizedScenes,
                narrationWordCount:
                  synchronizedWordCount
              }
            : submittedStoryboardInput;

        const narratorChoice =
          String(
            request.body?.narratorChoice ||
            "automatic"
          );

        const allowedNarrators = new Set([
          "automatic",
          "woman-warm",
          "woman-energetic",
          "man-confident",
          "man-calm"
        ]);

        if (!allowedNarrators.has(narratorChoice)) {
          response.status(400).json({
            ok: false,
            error: "Select a valid narrator."
          });
          return;
        }

        if (
          !Array.isArray(
            submittedStoryboard?.scenes
          ) ||
          submittedStoryboard.scenes.some(
            (scene) => {
              const caption =
                String(
                  scene.caption ?? ""
                ).trim();

              return (
                caption.length === 0 ||
                caption.length > 60
              );
            }
          )
        ) {
          response.status(400).json({
            ok: false,
            error:
              "Every scene needs a caption containing 1–60 characters."
          });
          return;
        }

        const validation =
          validateStoryboard(
            submittedStoryboard,
            {
              imageCount:
                project.assets.productImages.length
            }
          );

        if (!validation.ok) {
          response.status(400).json({
            ok: false,
            error:
              validation.errors.join(" ")
          });
          return;
        }

        const approvedStoryboard =
          validation.storyboard;

        const approvedAt =
          new Date().toISOString();

        const approvedStoryboardRecord = {
          ...existingStoryboardRecord,
          storyboard:
            approvedStoryboard,
          approval: {
            approvedAt,
            narratorChoice
          }
        };

        await fs.writeFile(
          storyboardPath,
          JSON.stringify(
            approvedStoryboardRecord,
            null,
            2
          ),
          "utf8"
        );

        project.status =
          "generating_narration";

        project.storyboard = {
          ...project.storyboard,
          reviewRequired: false,
          approvedAt,
          narratorChoice
        };

        await fs.writeFile(
          projectPath,
          JSON.stringify(project, null, 2),
          "utf8"
        );

        generationStage = "narration";

        const narration =
          await generateNarration({
            storyboard:
              approvedStoryboard,
            projectDirectory,
            narratorChoice
          });

        await fs.writeFile(
          path.join(
            projectDirectory,
            "narration.json"
          ),
          JSON.stringify(
            {
              projectId,
              narration
            },
            null,
            2
          ),
          "utf8"
        );

        project.status =
          "rendering_video";

        project.narration = {
          storedName:
            narration.storedName,
          model:
            narration.model,
          voice:
            narration.voice,
          narratorChoice:
            narration.narratorChoice,
          format:
            narration.format,
          byteLength:
            narration.byteLength,
          narrationWordCount:
            narration.narrationWordCount,
          generatedAt:
            narration.generatedAt,
          disclosure:
            narration.disclosure
        };

        await fs.writeFile(
          projectPath,
          JSON.stringify(project, null, 2),
          "utf8"
        );

        generationStage = "video";

        const video =
          await renderVideo({
            project,
            storyboard:
              approvedStoryboard,
            projectDirectory
          });

        await fs.writeFile(
          path.join(
            projectDirectory,
            "video.json"
          ),
          JSON.stringify(
            {
              projectId,
              video
            },
            null,
            2
          ),
          "utf8"
        );

        project.status =
          "video_ready";

        project.video = video;
        delete project.generationError;

        await fs.writeFile(
          projectPath,
          JSON.stringify(project, null, 2),
          "utf8"
        );

        response.status(201).json({
          ok: true,
          stage: "video_ready",
          project: {
            id: project.id,
            status: project.status
          },
          narration:
            project.narration,
          video,
          videoUrl:
            `/api/projects/${projectId}/video`
        });
      } catch (error) {
        console.error(
          "Final video generation failed:",
          error
        );

        if (project) {
          project.status =
            generationStage === "narration"
              ? "narration_failed"
              : generationStage === "video"
                ? "video_failed"
                : "approval_failed";

          project.generationError = {
            stage:
              generationStage,
            code:
              error.code ||
              "FINAL_VIDEO_GENERATION_FAILED",
            failedAt:
              new Date().toISOString()
          };

          await fs.writeFile(
            projectPath,
            JSON.stringify(project, null, 2),
            "utf8"
          ).catch(() => {});
        }

        response.status(502).json({
          ok: false,
          error:
            generationStage === "narration"
              ? "Narration could not be generated. Please try again."
              : generationStage === "video"
                ? "The narration was created, but the video could not be rendered. Please try again."
                : "The approved video plan could not be saved.",
          stage:
            generationStage
        });
      }
    }
  );

  return router;
}

export async function cleanFailedUpload(
  request
) {
  await removeFiles(
    allUploadedFiles(request)
  );
}
