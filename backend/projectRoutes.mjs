import cookieParser from "cookie-parser";
import { requireUser } from "./authRoutes.mjs";
import { authConfiguration } from "./authService.mjs";
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

  // Authentication runs before any upload or project handler.
  router.use(cookieParser());
  router.use((_request, response, next) => {
    response.set("Cache-Control", "private, no-store");
    response.vary("Cookie");
    next();
  });
  router.use(requireUser);

  // Protect cookie-authenticated writes, including multipart uploads.
  router.use((request, response, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      return next();
    }

    let expectedOrigin;
    try {
      expectedOrigin =
        new URL(authConfiguration().applicationOrigin).origin;
    } catch {
      return response.status(503).json({
        ok: false,
        error: "Application origin is not configured correctly."
      });
    }

    if (request.get("origin") !== expectedOrigin) {
      return response.status(403).json({
        ok: false,
        error: "This request must come from QuickAd AI."
      });
    }

    next();
  });

  // Every existing route with :projectId passes through this check.
  router.param("projectId", async (request, response, next, projectId) => {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        .test(projectId)
    ) {
      return response.status(400).json({
        ok: false,
        error: "Invalid project ID."
      });
    }

    try {
      const savedProject = JSON.parse(
        await fs.readFile(
          path.join(projectRoot, "projects", projectId, "project.json"),
          "utf8"
        )
      );

      // Missing owners are denied, not automatically assigned.
      if (
        !savedProject ||
        typeof savedProject.ownerId !== "string" ||
        savedProject.ownerId !== request.authUser.id
      ) {
        return response.status(404).json({
          ok: false,
          error: "Project not found."
        });
      }

      next();
    } catch (error) {
      if (error?.code === "ENOENT") {
        return response.status(404).json({
          ok: false,
          error: "Project not found."
        });
      }

      response.status(503).json({
        ok: false,
        error: "Project access could not be verified. Please try again."
      });
    }
  });

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

  // Authentication middleware above applies to this list too.
  router.get("/", async (request, response) => {
    try {
      const entries = await fs.readdir(projectsDirectory, {
        withFileTypes: true
      });
      const projects = [];

      for (const entry of entries) {
        if (
          !entry.isDirectory() ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
            .test(entry.name)
        ) {
          continue;
        }

        let project;
        try {
          project = JSON.parse(
            await fs.readFile(
              path.join(projectsDirectory, entry.name, "project.json"),
              "utf8"
            )
          );
        } catch (error) {
          // A directory may exist briefly before its first metadata write.
          if (error?.code === "ENOENT") continue;
          throw error;
        }

        if (
          !project ||
          project.ownerId !== request.authUser.id ||
          project.id !== entry.name
        ) {
          continue;
        }

        const createdAt = String(project.createdAt ?? "");
        const updatedAt = String(
          project.updatedAt ??
          project.video?.generatedAt ??
          project.storyboard?.approvedAt ??
          project.storyboard?.generatedAt ??
          createdAt
        );

        projects.push({
          id: project.id,
          title: String(
            project.storyboard?.title || "Untitled video"
          ).slice(0, 200),
          style: String(project.style ?? ""),
          status: String(project.status ?? "uploaded"),
          createdAt,
          updatedAt
        });
      }

      const timestamp = (project) =>
        Date.parse(project.updatedAt) || Date.parse(project.createdAt) || 0;

      projects.sort((a, b) =>
        timestamp(b) - timestamp(a) || a.id.localeCompare(b.id)
      );

      response.json({
        ok: true,
        projects: projects.slice(0, 10)
      });
    } catch {
      response.status(503).json({
        ok: false,
        error: "Your project list could not be loaded. Please try again."
      });
    }
  });

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
          ownerId: request.authUser.id,
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
    "/:projectId",
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

      try {
        const project =
          JSON.parse(
            await fs.readFile(
              projectPath,
              "utf8"
            )
          );

        let storyboard = null;

        try {
          const storyboardRecord =
            JSON.parse(
              await fs.readFile(
                storyboardPath,
                "utf8"
              )
            );

          storyboard =
            storyboardRecord.storyboard ??
            null;
        } catch (storyboardError) {
          if (
            storyboardError?.code !==
            "ENOENT"
          ) {
            throw storyboardError;
          }
        }

        const productImages =
          Array.isArray(
            project.assets?.productImages
          )
            ? project.assets.productImages
            : [];

        const publicProject = {
          id:
            project.id,
          status:
            project.status,
          createdAt:
            project.createdAt,
          description:
            project.description,
          website:
            project.website,
          callToAction:
            project.callToAction,
          style:
            project.style,
          output:
            project.output,
          storyboard:
            project.storyboard,
          assets: {
            productImages:
              productImages.map(
                (asset) => ({
                  originalName:
                    asset.originalName,
                  mimeType:
                    asset.mimeType,
                  size:
                    asset.size,
                  storedName:
                    asset.storedName,
                  url:
                    `/api/projects/${projectId}/assets/${encodeURIComponent(
                      asset.storedName
                    )}`
                })
              ),
            productLogo:
              project.assets?.productLogo
                ? {
                    originalName:
                      project.assets.productLogo.originalName,
                    mimeType:
                      project.assets.productLogo.mimeType,
                    size:
                      project.assets.productLogo.size,
                    storedName:
                      project.assets.productLogo.storedName,
                    url:
                      `/api/projects/${projectId}/assets/${encodeURIComponent(
                        project.assets.productLogo.storedName
                      )}`
                  }
                : null
          }
        };

        const videoReady =
          project.status ===
          "video_ready";

        response.json({
          ok: true,
          stage:
            videoReady
              ? "video_ready"
              : storyboard
                ? "plan_review"
                : project.status,
          project:
            publicProject,
          storyboard,
          videoUrl:
            videoReady
              ? `/api/projects/${projectId}/video`
              : null
        });
      } catch (error) {
        if (error?.code === "ENOENT") {
          response.status(404).json({
            ok: false,
            error: "The saved project was not found."
          });
          return;
        }

        console.error(
          "Saved project recovery failed:",
          error
        );

        response.status(500).json({
          ok: false,
          error: "The saved project could not be opened."
        });
      }
    }
  );

  router.get(
    "/:projectId/assets/:storedName",
    async (request, response) => {
      const projectId =
        String(request.params.projectId ?? "");

      const storedName =
        String(request.params.storedName ?? "");

      if (
        !/^[0-9a-f-]{36}$/i.test(projectId)
      ) {
        response.status(400).json({
          ok: false,
          error: "Invalid project ID."
        });
        return;
      }

      if (
        !/^[a-z0-9][a-z0-9._-]{0,100}$/i.test(
          storedName
        )
      ) {
        response.status(400).json({
          ok: false,
          error: "Invalid asset name."
        });
        return;
      }

      const projectDirectory = path.join(
        projectsDirectory,
        projectId
      );

      try {
        const project =
          JSON.parse(
            await fs.readFile(
              path.join(
                projectDirectory,
                "project.json"
              ),
              "utf8"
            )
          );

        const allowedAssetNames =
          new Set(
            [
              ...(
                Array.isArray(
                  project.assets?.productImages
                )
                  ? project.assets.productImages
                  : []
              ),
              project.assets?.productLogo
            ]
              .filter(Boolean)
              .map(
                (asset) =>
                  asset.storedName
              )
              .filter(Boolean)
          );

        if (
          !allowedAssetNames.has(storedName)
        ) {
          response.status(404).json({
            ok: false,
            error: "The project asset was not found."
          });
          return;
        }

        const assetPath = path.join(
          projectDirectory,
          storedName
        );

        await fs.access(assetPath);

        response.sendFile(assetPath);
      } catch (error) {
        if (error?.code === "ENOENT") {
          response.status(404).json({
            ok: false,
            error: "The project asset was not found."
          });
          return;
        }

        console.error(
          "Saved project asset recovery failed:",
          error
        );

        response.status(500).json({
          ok: false,
          error: "The project asset could not be opened."
        });
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
