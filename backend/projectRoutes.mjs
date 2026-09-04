import { prepareMusic, validateMusicVolume } from "./musicCatalog.mjs";
import { getUserUsage, getPlan, recordSuccessfulFinalVideo, countUserProjects, canCreateProject, canGenerateFinalVideo, LIMITS } from "./usageLimits.mjs";
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
  renderVideo,
  uploadToR2
} from "./videoRenderer.mjs";
import { r2Client, R2_BUCKET } from "./r2Client.mjs";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";


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
      code: "PROJECT_WEBSITE_INVALID",
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
        code: "PROJECT_WEBSITE_INVALID",
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
      code: "PROJECT_WEBSITE_INVALID",
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

export function getMinimumDurationTierForImageCount(imageCount) {
  const count = Number(imageCount);

  if (!Number.isInteger(count) || count < 1 || count > 10) {
    throw new Error(
      "imageCount must be an integer from 1 through 10."
    );
  }

  if (count <= 5) {
    return 30;
  }

  if (count <= 7) {
    return 45;
  }

  return 60;
}

function validateProject(request, sourceProductImages = []) {
  const productImages =
    request.files?.productImages ?? [];

  const sourceProjectId = cleanText(
    request.body.sourceProjectId,
    36
  );

  const effectiveImageCount =
    productImages.length > 0
      ? productImages.length
      : sourceProductImages.length;

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

  const requestedDurationValue =
    String(
      request.body.maxDurationSeconds ?? "auto"
    ).trim();

  const durationMode =
    requestedDurationValue === "auto"
      ? "auto"
      : "manual";

  const requestedMaxDurationSeconds =
    durationMode === "auto"
      ? null
      : Number(requestedDurationValue);

  if (
    durationMode === "manual" &&
    ![30, 45, 60].includes(
      requestedMaxDurationSeconds
    )
  ) {
    return {
      code: "PROJECT_DURATION_INVALID",
      error:
        "Please choose AI Decide or a video length of 30, 45, or 60 seconds."
    };
  }

  const language = cleanText(
    request.body.language || request.body.targetLanguage || "en",
    10
  ) || "en";

  if (productImages.length < 1 && !sourceProjectId) {
    return {
      code: "PROJECT_IMAGE_REQUIRED",
      error: "Please upload at least one product image."
    };
  }

  if (
    sourceProjectId &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      .test(sourceProjectId)
  ) {
    return {
      code: "SOURCE_PROJECT_ID_INVALID",
      error: "Invalid source project ID."
    };
  }

  if (productImages.length > 10) {
    return {
      code: "PROJECT_IMAGE_LIMIT",
      params: {
        max: 10
      },
      error:
        "QuickAd AI supports up to 10 product images."
    };
  }

  const minimumDurationTierSeconds =
    getMinimumDurationTierForImageCount(
      effectiveImageCount
    );

  if (durationMode === "manual") {
    const maxImagesForDuration =
      requestedMaxDurationSeconds === 30
        ? 5
        : requestedMaxDurationSeconds === 45
          ? 7
          : 10;

    if (
      effectiveImageCount >
      maxImagesForDuration
    ) {
      return {
        code: "PROJECT_DURATION_IMAGE_LIMIT",
        params: {
          seconds:
            requestedMaxDurationSeconds,
          max:
            maxImagesForDuration
        },
        error:
          `${requestedMaxDurationSeconds}-second videos support up to ${maxImagesForDuration} product images.`
      };
    }
  }


  if (websiteResult.error) {
    return {
      code:
        websiteResult.code ||
        "PROJECT_WEBSITE_INVALID",
      error:
        websiteResult.error
    };
  }

  if (!ALLOWED_STYLES.has(style)) {
    return {
      code: "PROJECT_STYLE_INVALID",
      error: "Please choose a valid video style."
    };
  }

  return {
    productImages,
    sourceProjectId,
    effectiveImageCount,
    productLogo:
      request.files?.productLogo?.[0] ?? null,
    description,
    website:
      websiteResult.website,
    callToAction,
    style,
    durationMode,
    minimumDurationTierSeconds,
    maxDurationSeconds: requestedMaxDurationSeconds
  };
}

async function loadOwnedSourceProject({
  projectsDirectory,
  sourceProjectId,
  ownerId
}) {
  if (!sourceProjectId) {
    return null;
  }

  const sourceDirectory = path.join(
    projectsDirectory,
    sourceProjectId
  );

  try {
    const stat = await fs.lstat(sourceDirectory);

    if (
      !stat.isDirectory() ||
      stat.isSymbolicLink()
    ) {
      const error = new Error("Source project not found.");
      error.code = "SOURCE_PROJECT_NOT_FOUND";
      throw error;
    }

    const sourceProject = JSON.parse(
      await fs.readFile(
        path.join(sourceDirectory, "project.json"),
        "utf8"
      )
    );

    if (
      sourceProject?.id !== sourceProjectId ||
      sourceProject?.ownerId !== ownerId
    ) {
      const error = new Error("Source project not found.");
      error.code = "SOURCE_PROJECT_NOT_FOUND";
      throw error;
    }

    const productImages =
      Array.isArray(
        sourceProject.assets?.productImages
      )
        ? sourceProject.assets.productImages
        : [];

    if (productImages.length < 1) {
      const error = new Error("Source project has no reusable product images.");
      error.code = "SOURCE_PROJECT_IMAGES_MISSING";
      throw error;
    }

    if (productImages.length > MAX_IMAGE_COUNT) {
      const error = new Error("Source project has too many product images.");
      error.code = "SOURCE_PROJECT_IMAGE_LIMIT";
      throw error;
    }

    for (const asset of productImages) {
      const storedName =
        String(asset?.storedName ?? "");

      if (
        !storedName ||
        path.basename(storedName) !== storedName ||
        !ALLOWED_MIME_TYPES.has(asset?.mimeType)
      ) {
        const error = new Error("Source project contains an invalid product image.");
        error.code = "SOURCE_PROJECT_ASSET_INVALID";
        throw error;
      }
    }

    const productLogo =
      sourceProject.assets?.productLogo ?? null;

    if (productLogo) {
      const storedName =
        String(productLogo?.storedName ?? "");

      if (
        !storedName ||
        path.basename(storedName) !== storedName ||
        !ALLOWED_MIME_TYPES.has(productLogo?.mimeType)
      ) {
        const error = new Error("Source project contains an invalid product logo.");
        error.code = "SOURCE_PROJECT_ASSET_INVALID";
        throw error;
      }
    }

    return {
      project: sourceProject,
      directory: sourceDirectory,
      productImages,
      productLogo
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      const notFound = new Error("Source project not found.");
      notFound.code = "SOURCE_PROJECT_NOT_FOUND";
      throw notFound;
    }

    throw error;
  }
}

async function copySourceProductImages({
  sourceProject,
  projectDirectory
}) {
  if (!sourceProject) {
    return [];
  }

  const copiedImages = [];

  for (
    let index = 0;
    index < sourceProject.productImages.length;
    index += 1
  ) {
    const asset =
      sourceProject.productImages[index];

    const extension =
      ALLOWED_MIME_TYPES.get(asset.mimeType);

    if (!extension) {
      const error = new Error("Source project contains an invalid product image.");
      error.code = "SOURCE_PROJECT_ASSET_INVALID";
      throw error;
    }

    const sourcePath = path.join(
      sourceProject.directory,
      asset.storedName
    );

    const sourceStat =
      await fs.lstat(sourcePath);

    if (
      !sourceStat.isFile() ||
      sourceStat.isSymbolicLink()
    ) {
      const error = new Error("Source project product image is unavailable.");
      error.code = "SOURCE_PROJECT_ASSET_MISSING";
      throw error;
    }

    if (sourceStat.size > MAX_FILE_SIZE) {
      const error = new Error("Source project product image is too large.");
      error.code = "SOURCE_PROJECT_ASSET_TOO_LARGE";
      throw error;
    }

    const storedName =
      `product-${String(index + 1).padStart(2, "0")}${extension}`;

    const destinationPath = path.join(
      projectDirectory,
      storedName
    );

    await fs.copyFile(
      sourcePath,
      destinationPath
    );

    copiedImages.push({
      originalName:
        String(
          asset.originalName ??
          asset.storedName
        ),
      storedName,
      mimeType: asset.mimeType,
      size: sourceStat.size
    });
  }

  return copiedImages;
}

async function copySourceProductLogo({
  sourceProject,
  projectDirectory
}) {
  const asset =
    sourceProject?.productLogo ?? null;

  if (!asset) {
    return null;
  }

  const extension =
    ALLOWED_MIME_TYPES.get(asset.mimeType);

  if (!extension) {
    const error = new Error("Source project contains an invalid product logo.");
    error.code = "SOURCE_PROJECT_ASSET_INVALID";
    throw error;
  }

  const sourcePath = path.join(
    sourceProject.directory,
    asset.storedName
  );

  const sourceStat =
    await fs.lstat(sourcePath);

  if (
    !sourceStat.isFile() ||
    sourceStat.isSymbolicLink()
  ) {
    const error = new Error("Source project product logo is unavailable.");
    error.code = "SOURCE_PROJECT_ASSET_MISSING";
    throw error;
  }

  if (sourceStat.size > MAX_FILE_SIZE) {
    const error = new Error("Source project product logo is too large.");
    error.code = "SOURCE_PROJECT_ASSET_TOO_LARGE";
    throw error;
  }

  const storedName =
    `logo${extension}`;

  await fs.copyFile(
    sourcePath,
    path.join(
      projectDirectory,
      storedName
    )
  );

  return {
    originalName:
      String(
        asset.originalName ??
        asset.storedName
      ),
    storedName,
    mimeType: asset.mimeType,
    size: sourceStat.size
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

  // Held until the asynchronous operation finishes, even if the client disconnects.
  const activeProjects = new Set();
  const withProjectLock = (handler) => async (request, response, next) => {
    const id = request.params.projectId.toLowerCase();
    if (activeProjects.has(id)) {
      return response.status(409).json({ok: false, code: "PROJECT_BUSY", error: "This project is busy. Please wait until processing finishes."});
    }
    activeProjects.add(id);
    try { return await handler(request, response, next); }
    finally { activeProjects.delete(id); }
  };


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
        code: "APP_ORIGIN_MISCONFIGURED",

        error: "Application origin is not configured correctly."
      });
    }

    if (request.get("origin") !== expectedOrigin) {
      return response.status(403).json({
        ok: false,
        code: "REQUEST_ORIGIN_INVALID",

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
        code: "PROJECT_ID_INVALID",

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
          code: "PROJECT_NOT_FOUND",

          error: "Project not found."
        });
      }

      next();
    } catch (error) {
      if (error?.code === "ENOENT") {
        return response.status(404).json({
          ok: false,
          code: "PROJECT_NOT_FOUND",

          error: "Project not found."
        });
      }

      response.status(503).json({
        ok: false,
        code: "PROJECT_ACCESS_FAILED",

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

  router.delete("/:projectId", withProjectLock(async (request, response) => {
    const id = request.params.projectId;
    const directory = path.join(projectsDirectory, id);
    try {
      // Recheck ownership inside the lock; never trust a submitted owner ID.
      const stat = await fs.lstat(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        return response.status(404).json({ok: false, code: "PROJECT_NOT_FOUND", error: "Project not found."});
      }
      const project = JSON.parse(await fs.readFile(path.join(directory, "project.json"), "utf8"));
      if (project.id !== id || project.ownerId !== request.authUser.id) {
        return response.status(404).json({ok: false, code: "PROJECT_NOT_FOUND", error: "Project not found."});
      }
      const idleStatuses = new Set(["storyboard_ready", "video_ready", "storyboard_failed", "narration_failed", "video_failed", "approval_failed"]);
      if (!idleStatuses.has(project.status)) {
        return response.status(409).json({ok: false, code: "PROJECT_DELETE_BLOCKED", error: "This project is still processing or needs review. It cannot be deleted yet."});
      }
      await fs.rm(directory, {recursive: true, force: false});
      return response.json({ok: true, deletedProjectId: id});
    } catch (error) {
      if (error?.code === "ENOENT") return response.status(404).json({ok: false, code: "PROJECT_NOT_FOUND", error: "Project not found."});
      return response.status(503).json({ok: false, code: "PROJECT_DELETE_FAILED", error: "Project deletion could not be completed. Refresh the project list before retrying."});
    }
  }));

  function buildUsageResponse(
    usage,
    projectCount
  ) {
    const plan =
      getPlan(usage.planId);

    const monthlyCreditsUsed =
      Number(usage.monthlyCreditsUsed) || 0;

    const monthlyCreditsTotal =
      plan.monthlyCredits;

    const monthlyCreditsRemaining =
      Math.max(
        0,
        monthlyCreditsTotal -
          monthlyCreditsUsed
      );

    const isFree =
      plan.id === "free";

    const freeVideosRemaining =
      isFree
        ? Math.max(
            0,
            LIMITS.FREE_FINAL_VIDEOS -
              usage.finalVideoCount
          )
        : 0;

    const canGenerateMoreVideos =
      isFree
        ? freeVideosRemaining > 0
        : monthlyCreditsRemaining >= 10;

    return {
      finalVideoCount:
        usage.finalVideoCount,

      projectCount,

      planId:
        plan.id,

      planName:
        plan.name,

      priceMonthlyUsd:
        plan.priceMonthlyUsd,

      monthlyCreditsTotal,

      monthlyCreditsUsed,

      monthlyCreditsRemaining,

      maxVideoSeconds:
        plan.maxVideoSeconds,

      currentPeriodStart:
        usage.currentPeriodStart || null,

      currentPeriodEnd:
        usage.currentPeriodEnd || null,
      cancelAtPeriodEnd:
        Boolean(usage.cancelAtPeriodEnd),

      freeVideosRemaining,

      canCreateMoreProjects:
        projectCount < LIMITS.MAX_PROJECTS,

      canGenerateMoreVideos
    };
  }
  router.get("/usage", async (request, response) => {
    try {
      const [usage, projectCount] = await Promise.all([
        getUserUsage(projectRoot, request.authUser.id),
        countUserProjects(projectRoot, request.authUser.id)
      ]);
      response.json({
        ok: true,
        limits: LIMITS,
        usage:
          buildUsageResponse(
            usage,
            projectCount
          )
      });
    } catch {
      response.status(503).json({ ok: false, code: "USAGE_LOAD_FAILED", error: "Usage could not be loaded." });
    }
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

      const usage = await getUserUsage(projectRoot, request.authUser.id);

      response.json({
        ok: true,
        projects: projects.slice(0, 10),
        limits: LIMITS,
        usage:
          buildUsageResponse(
            usage,
            projects.length
          )
      });
    } catch {
      response.status(503).json({
        ok: false,
        code: "PROJECT_LIST_LOAD_FAILED",

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
        // --- v0.9.4: Enforce max 10 projects per user ---
        const userProjectCount = await countUserProjects(projectRoot, request.authUser.id);
        const createCheck = canCreateProject(userProjectCount);
        if (!createCheck.ok) {
          await removeFiles(uploadedFiles);
          response.status(createCheck.status).json({
            ok: false,
            code: createCheck.code,
            error: createCheck.error,
            limits: LIMITS,
            projectCount: userProjectCount
          });
          return;
        }

        const requestedSourceProjectId =
          cleanText(
            request.body.sourceProjectId,
            36
          );

        let sourceProject = null;

        if (requestedSourceProjectId) {
          if (
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
              .test(requestedSourceProjectId)
          ) {
            await removeFiles(uploadedFiles);

            response.status(400).json({
              ok: false,
              code: "SOURCE_PROJECT_ID_INVALID",
              error: "Invalid source project ID."
            });
            return;
          }

          try {
            sourceProject =
              await loadOwnedSourceProject({
                projectsDirectory,
                sourceProjectId:
                  requestedSourceProjectId,
                ownerId:
                  request.authUser.id
              });
          } catch (error) {
            await removeFiles(uploadedFiles);

            if (
              String(error?.code ?? "").startsWith(
                "SOURCE_PROJECT_"
              )
            ) {
              response.status(404).json({
                ok: false,
                code: error.code,
                error: error.message
              });
              return;
            }

            throw error;
          }
        }

        const validated =
          validateProject(
            request,
            sourceProject?.productImages ?? []
          );

        if (validated.error) {
          await removeFiles(uploadedFiles);

          response.status(400).json({
            ok: false,
            code:
              validated.code ||
              "PROJECT_INPUT_INVALID",
            ...(validated.params
              ? { params: validated.params }
              : {}),
            error: validated.error
          });
          return;
        }

        const usage =
          await getUserUsage(
            projectRoot,
            request.authUser.id
          );

        const plan =
          getPlan(usage.planId);

        const durationMode =
          validated.durationMode;

        const maxVideoSeconds =
          durationMode === "auto"
            ? plan.maxVideoSeconds
            : validated.maxDurationSeconds;

        if (
          durationMode === "manual" &&
          maxVideoSeconds >
            plan.maxVideoSeconds
        ) {
          await removeFiles(uploadedFiles);

          response.status(403).json({
            ok: false,
            code: "VIDEO_DURATION_NOT_ALLOWED",
            error:
              `Your ${plan.name} plan supports videos up to ${plan.maxVideoSeconds} seconds.`
          });
          return;
        }

        if (
          durationMode === "auto" &&
          validated.minimumDurationTierSeconds >
            plan.maxVideoSeconds
        ) {
          await removeFiles(uploadedFiles);

          response.status(403).json({
            ok: false,
            code: "VIDEO_DURATION_NOT_ALLOWED",
            error:
              `Your ${plan.name} plan supports videos up to ${plan.maxVideoSeconds} seconds and cannot use this many images.`
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

        if (
          validated.productImages.length < 1 &&
          sourceProject
        ) {
          assets.productImages =
            await copySourceProductImages({
              sourceProject,
              projectDirectory
            });
        }

        if (
          !validated.productLogo &&
          sourceProject?.productLogo
        ) {
          assets.productLogo =
            await copySourceProductLogo({
              sourceProject,
              projectDirectory
            });
        }

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
          language:
            (request.body.language || request.body.targetLanguage || "en").toString().slice(0,10),
          targetLanguage:
            (request.body.targetLanguage || request.body.language || "en").toString().slice(0,10),
          output: {
            aspectRatio: "9:16",
            durationMode,
            durationSeconds:
              durationMode === "auto"
                ? null
                : `20-${maxVideoSeconds}`,
            maxDurationSeconds:
              durationMode === "auto"
                ? null
                : maxVideoSeconds,
            generationMaxDurationSeconds:
              maxVideoSeconds,
            format: "mp4"
          },
          assets
        };;

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
              projectDirectory,
              maxDurationSeconds:
                maxVideoSeconds,
              durationMode,
              minimumDurationTierSeconds:
                validated.minimumDurationTierSeconds
            });

          const resolvedDurationTierSeconds =
            result.durationTierSeconds;

          project.output.durationMode =
            durationMode;

          project.output.maxDurationSeconds =
            resolvedDurationTierSeconds;

          project.output.durationSeconds =
            `20-${resolvedDurationTierSeconds}`;

          if (durationMode === "auto") {
            project.output.aiSelectedDurationSeconds =
              resolvedDurationTierSeconds;
          }

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
              code: "STORYBOARD_GENERATION_FAILED",
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
          code: "PROJECT_ID_INVALID",

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
            code: "SAVED_PROJECT_NOT_FOUND",
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
          code: "SAVED_PROJECT_OPEN_FAILED",
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
          code: "PROJECT_ID_INVALID",

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
          code: "PROJECT_ASSET_NAME_INVALID",
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
            code: "PROJECT_ASSET_NOT_FOUND",
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
            code: "PROJECT_ASSET_NOT_FOUND",
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
          code: "PROJECT_ASSET_OPEN_FAILED",
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
          code: "PROJECT_ID_INVALID",

          error: "Invalid project ID."
        });
        return;
      }

      // R2 videos stay redirect-based for playback, but downloads are
      // proxied through QuickAd so browsers receive attachment headers.
      try {
        const projJsonPath = path.join(projectsDirectory, projectId, "project.json");
        const projRaw = await fs.readFile(projJsonPath, "utf8");
        const proj = JSON.parse(projRaw);
        const r2Url = proj?.video?.r2Url ||
          (proj?.video?.url?.includes("r2.dev") ? proj.video.url : "");
        const r2Key = String(proj?.video?.r2Key ?? "");
        const wantsDownload = String(request.query.download ?? "") === "1";

        if (wantsDownload && r2Key) {
          const object = await r2Client.send(
            new GetObjectCommand({
              Bucket: R2_BUCKET,
              Key: r2Key
            })
          );

          if (!object.Body) {
            throw new Error("R2 video body is missing.");
          }

          response.set("Content-Type", object.ContentType || "video/mp4");
          response.set("Content-Disposition", 'attachment; filename="quickad-video.mp4"');

          if (Number.isFinite(Number(object.ContentLength))) {
            response.set("Content-Length", String(object.ContentLength));
          }

          object.Body.on(
            "error",
            (error) => {
              console.error("R2 video download stream failed:", error);
              if (!response.headersSent) {
                response.status(502).end();
              } else {
                response.destroy(error);
              }
            }
          );

          object.Body.pipe(response);
          return;
        }

        if (r2Url) {
          return response.redirect(302, r2Url);
        }
      } catch (error) {
        console.error("R2 video delivery failed, trying local video:", error);
      }

      const videoPath = path.join(
        projectsDirectory,
        projectId,
        "video.mp4"
      );

      try {
        await fs.access(videoPath);
        if (String(request.query.download ?? "") === "1") {
          response.download(videoPath, "quickad-video.mp4");
          return;
        }

        response.sendFile(videoPath);
      } catch {
        response.status(404).json({
          ok: false,
          code: "FINISHED_VIDEO_NOT_FOUND",
          error: "The finished video was not found."
        });
      }
    }
  );

  router.post(
    "/:projectId/finalize",
    withProjectLock(async (request, response) => {
      const projectId =
        String(request.params.projectId ?? "");

      if (
        !/^[0-9a-f-]{36}$/i.test(projectId)
      ) {
        response.status(400).json({
          ok: false,
          code: "PROJECT_ID_INVALID",

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

        if (project.status === "video_ready") {
          return response.status(409).json({ok: false,
            code: "VIDEO_ALREADY_COMPLETE",

            error: "This video is already complete. Create a new project to choose different music."});
        }
        let selectedMusic;
        let musicVolume;
        try {
          musicVolume = validateMusicVolume(request.body?.musicVolume);
          selectedMusic = await prepareMusic(request.body?.musicChoice ?? "none");
        } catch (error) {
          return response.status(
            error.status || 503
          ).json({
            ok: false,
            code:
              error.code ||
              "MUSIC_PREPARATION_FAILED",
            error:
              error.message ||
              "Background music could not be prepared."
          });
        }
        const musicChoice = selectedMusic.metadata.id;

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
            code: "NARRATOR_INVALID",

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
            code: "SCENE_CAPTION_INVALID",

            error:
              "Every scene needs a caption containing 1–60 characters."
          });
          return;
        }

        const selectedMaxDurationSeconds =
          Number(
            project.output?.maxDurationSeconds
          ) || 30;

        const selectedMinDurationSeconds =
          selectedMaxDurationSeconds <= 30
            ? 27
            : selectedMaxDurationSeconds <= 45
              ? 41
              : 55;

        const validation =
          validateStoryboard(
            submittedStoryboard,
            {
              imageCount:
                project.assets.productImages.length,
              minDurationSeconds:
                selectedMinDurationSeconds,
              maxDurationSeconds:
                selectedMaxDurationSeconds
            }
          );

        if (!validation.ok) {
          response.status(400).json({
            ok: false,
            code: "STORYBOARD_INVALID",

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
            musicChoice,
            musicVolume,
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
          musicChoice,
          musicVolume,
          narratorChoice
        };

        await fs.writeFile(
          projectPath,
          JSON.stringify(project, null, 2),
          "utf8"
        );

                // --- v0.9.4: Enforce 2 free final videos ---
        const usage = await getUserUsage(projectRoot, request.authUser.id);
        const videoCheck =
          canGenerateFinalVideo(
            usage,
            project,
            selectedMaxDurationSeconds
          );
        if (!videoCheck.ok) {
          response.status(videoCheck.status).json({
            ok: false,
            code: videoCheck.code,
            error: videoCheck.error,
            limits: LIMITS,
            usage: { finalVideoCount: usage.finalVideoCount }
          });
          return;
        }

        const isFreeRerender = videoCheck.freeRerender;

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
            projectDirectory,
            musicChoice,
            musicVolume
          });

        // --- R2: upload final MP4 to Cloudflare ---
        try {
          const localVideoPath = path.join(projectDirectory, "video.mp4");
          const r2Key = `videos/${request.authUser.id}/${projectId}/final-${Date.now()}.mp4`;
          const r2Url = await uploadToR2(localVideoPath, r2Key);
          video.r2Key = r2Key;
          video.r2Url = r2Url;
          video.url = r2Url; // override local url
          console.log(`Uploaded to R2: ${r2Url}`);
        } catch (r2Err) {
          console.error("R2 upload failed, keeping local:", r2Err);
        }

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

        // Record usage before exposing the project as video_ready.
        // Free users consume one lifetime video.
        // Paid users consume credits based on the selected duration tier.
        if (!isFreeRerender) {
          const usageResult =
            await recordSuccessfulFinalVideo(
              projectRoot,
              request.authUser.id,
              selectedMaxDurationSeconds
            );

          console.log(
            "Recorded final video usage:",
            {
              userId: request.authUser.id,
              planId: usageResult.planId,
              creditCost: usageResult.creditCost,
              selectedMaxDurationSeconds,
              actualDurationSeconds:
                approvedStoryboard.totalDurationSeconds
            }
          );
        }

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
          code:
            "FINAL_VIDEO_GENERATION_FAILED",
          error:
            generationStage === "narration"
              ? "Narration could not be generated. Please try again."
              : generationStage === "video"
              ? "The narration was created but the final video could not be rendered. The temporary media may be missing. Please try generating again."
                : "The approved video plan could not be saved.",
          stage:
            generationStage
        });
      }
    })
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


