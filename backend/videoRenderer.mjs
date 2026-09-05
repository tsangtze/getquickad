import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { r2Client, R2_BUCKET, R2_PUBLIC_BASE } from "./r2Client.mjs";
import path from "node:path";
import {
  probeDuration,
  runFfmpeg
} from "./mediaTools.mjs";

const VIDEO_WIDTH = 720;
const VIDEO_HEIGHT = 1280;
const VIDEO_FRAME_RATE = 30;

function formatNumber(value) {
  return Number(value).toFixed(3);
}

function wrapText(value, maximumCharacters = 28) {
  const words = String(value ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const lines = [];
  let currentLine = "";

  for (const word of words) {
    const candidate =
      currentLine
        ? `${currentLine} ${word}`
        : word;

    if (
      candidate.length <= maximumCharacters ||
      !currentLine
    ) {
      currentLine = candidate;
      continue;
    }

    lines.push(currentLine);
    currentLine = word;
  }

  if (currentLine) {
    lines.push(currentLine);
  }

  return lines
    .slice(0, 3)
    .join("\n");
}

function getBrandText(project) {
  if (project.website) {
    try {
      const parsedWebsite =
        new URL(project.website);

      return parsedWebsite.hostname
        .replace(/^www\./i, "");
    } catch {
      return String(project.website)
        .replace(/^https?:\/\//i, "")
        .replace(/\/.*$/, "");
    }
  }

  return "QuickAd AI";
}

function getRoleLabel(role) {
  const labels = {
    hook: "DISCOVER",
    product: "THE PRODUCT",
    benefit: "WHY IT MATTERS",
    proof: "BUILT FOR YOU",
    cta: "TAKE THE NEXT STEP"
  };

  return (
    labels[role] ||
    String(role || "FEATURE").toUpperCase()
  );
}

function escapeFilterPath(filePath) {
  return path
    .resolve(filePath)
    .replace(/\\/g, "/")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'");
}

async function findVideoFont(language = "en") {
  const windowsDirectory =
    process.env.WINDIR ||
    "C:\\Windows";

  const normalizedLanguage = String(language || "en").toLowerCase();
  const needsTraditionalChineseFont =
    normalizedLanguage === "zh-tw" ||
    normalizedLanguage === "zh-hant" ||
    normalizedLanguage.startsWith("zh-hant-") ||
    normalizedLanguage === "zh-hk" ||
    normalizedLanguage === "zh-mo";
  const needsCjkFont =
    normalizedLanguage.startsWith("zh") ||
    normalizedLanguage.startsWith("ja") ||
    normalizedLanguage.startsWith("ko");
  const needsHindiFont =
    normalizedLanguage.startsWith("hi");

  const bundledFont = path.join(
    process.cwd(),
    "backend/fonts/Inter-Bold.ttf"
  );

  const bundledCjkFont = path.join(
    process.cwd(),
    "backend/fonts/NotoSansCJKsc-Bold.otf"
  );

  const bundledTraditionalChineseFont = path.join(
    process.cwd(),
    "backend/fonts/NotoSansCJKtc-Bold.otf"
  );

  const bundledHindiFont = path.join(
    process.cwd(),
    "backend/fonts/NotoSerifDevanagari-Bold.ttf"
  );

  const candidates = [
    ...(needsHindiFont ? [bundledHindiFont] : []),
    ...(needsTraditionalChineseFont ? [bundledTraditionalChineseFont] : []),
    ...(needsCjkFont ? [bundledCjkFont] : []),
    bundledFont,
    path.join(
      windowsDirectory,
      "Fonts",
      "segoeuib.ttf"
    ),
    path.join(
      windowsDirectory,
      "Fonts",
      "arialbd.ttf"
    ),
    path.join(
      windowsDirectory,
      "Fonts",
      "arial.ttf"
    )
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // Continue to the next suitable font.
    }
  }

  throw new Error(
    "No suitable video caption font was found."
  );
}

function buildVideoFilter({
  scene,
  inputIndex,
  fontPath,
  titlePath,
  captionPath,
  rolePath,
  brandPath,
  showCtaWebsite
}) {
  const duration =
    scene.endSeconds -
    scene.startSeconds;

  const fadeDuration =
    Math.min(0.3, duration / 4);

  const fadeOutStart =
    Math.max(
      0,
      duration - fadeDuration
    );

  const font =
    escapeFilterPath(fontPath);

  const title =
    escapeFilterPath(titlePath);

  const caption =
    escapeFilterPath(captionPath);

  const role =
    escapeFilterPath(rolePath);

  const brand =
    escapeFilterPath(brandPath);

  const accentColor =
    scene.role === "cta"
      ? "0x6C5CFF@0.94"
      : "0x111827@0.76";

  return [
    `[${inputIndex}:v]split=2` +
      `[backgroundSource${inputIndex}]` +
      `[cardSource${inputIndex}]`,

    `[backgroundSource${inputIndex}]` +
      `scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:` +
      "force_original_aspect_ratio=increase," +
      `crop=${VIDEO_WIDTH}:${VIDEO_HEIGHT},` +
      "boxblur=24:12," +
      "eq=brightness=-0.42:saturation=0.72," +
      "setsar=1" +
      `[background${inputIndex}]`,

    `[background${inputIndex}]` +
      "drawbox=" +
      "x=28:y=225:w=664:h=750:" +
      "color=0x07101F@0.78:t=fill," +
      "drawbox=" +
      "x=28:y=225:w=664:h=750:" +
      "color=white@0.20:t=2" +
      `[panel${inputIndex}]`,

    `[cardSource${inputIndex}]` +
      "scale=640:700:" +
      "force_original_aspect_ratio=decrease," +
      "setsar=1" +
      `[card${inputIndex}]`,

    `[panel${inputIndex}]` +
      `[card${inputIndex}]` +
      "overlay=" +
      "x=(W-w)/2:" +
      "y=250+(700-h)/2" +
      `[composite${inputIndex}]`,

    `[composite${inputIndex}]` +
      "drawbox=" +
      `x=40:y=44:w=640:h=62:` +
      `color=${accentColor}:t=fill,` +

      "drawtext=" +
      `fontfile='${font}':` +
      `textfile='${role}':` +
      "expansion=none:" +
      "fontcolor=0xB8B3FF:" +
      "fontsize=22:" +
      "x=(w-text_w)/2:" +
      "y=63," +

      "drawtext=" +
      `fontfile='${font}':` +
      `textfile='${title}':` +
      "expansion=none:" +
      "fontcolor=white:" +
      "fontsize=34:" +
      "x=(w-text_w)/2:" +
      "y=126:" +
      "shadowcolor=black@0.65:" +
      "shadowx=2:" +
      "shadowy=2," +

      "drawbox=" +
      "x=34:y=1000:w=652:h=176:" +
      `color=${accentColor}:t=fill,` +

      "drawtext=" +
      `fontfile='${font}':` +
      `textfile='${caption}':` +
      "expansion=none:" +
      "fontcolor=white:" +
      "fontsize=40:" +
      "line_spacing=10:" +
      "x=(w-text_w)/2:" +
      "y=1028:" +
      "shadowcolor=black@0.70:" +
      "shadowx=2:" +
      "shadowy=2," +

      (
        scene.role === "cta" &&
        showCtaWebsite
          ? (
              "drawtext=" +
              `fontfile='${font}':` +
              `textfile='${brand}':` +
              "expansion=none:" +
              "fontcolor=white@0.96:" +
              "fontsize=28:" +
              "x=(w-text_w)/2:" +
              "y=1124:" +
              "shadowcolor=black@0.75:" +
              "shadowx=2:" +
              "shadowy=2,"
            )
          : ""
      ) +

      "drawtext=" +
      `fontfile='${font}':` +
      `textfile='${brand}':` +
      "expansion=none:" +
      "fontcolor=white@0.92:" +
      "fontsize=24:" +
      "x=(w-text_w)/2:" +
      "y=1217:" +
      "shadowcolor=black@0.70:" +
      "shadowx=2:" +
      "shadowy=2," +

      `trim=duration=${formatNumber(duration)},` +
      "setpts=PTS-STARTPTS," +
      `fade=t=in:st=0:d=${formatNumber(fadeDuration)},` +
      `fade=t=out:st=${formatNumber(fadeOutStart)}:` +
      `d=${formatNumber(fadeDuration)}` +
      `[scene${inputIndex}]`
  ];
}

function validateInputs({
  project,
  storyboard,
  projectDirectory
}) {
  if (!projectDirectory) {
    throw new Error(
      "The project directory was not supplied."
    );
  }

  if (
    !Array.isArray(storyboard?.scenes) ||
    storyboard.scenes.length === 0
  ) {
    throw new Error(
      "The storyboard has no video scenes."
    );
  }

  if (
    !Array.isArray(
      project?.assets?.productImages
    ) ||
    project.assets.productImages.length === 0
  ) {
    throw new Error(
      "The project has no product images."
    );
  }
}

import { prepareMusic, audioMixFilters, validateMusicVolume } from "./musicCatalog.mjs";

async function renderSceneClip({
  scene,
  imagePath,
  logoPath,
  outputPath,
  fontPath,
  titlePath,
  captionPath,
  rolePath,
  brandPath,
  showCtaWebsite
}) {
  const sceneDuration =
    scene.endSeconds -
    scene.startSeconds;

  const sceneFilters =
    buildVideoFilter({
      scene,
      inputIndex: 0,
      fontPath,
      titlePath,
      captionPath,
      rolePath,
      brandPath,
      showCtaWebsite
    });

  const commandArguments = [
    "-hide_banner",
    "-loglevel",
    "warning",
    "-y",
    "-threads",
    "1",
    "-filter_threads",
    "1",
    "-filter_complex_threads",
    "1",
    "-loop",
    "1",
    "-framerate",
    String(VIDEO_FRAME_RATE),
    "-t",
    formatNumber(sceneDuration),
    "-i",
    imagePath
  ];

  let videoLabel =
    "[scene0]";

  if (logoPath) {
    commandArguments.push(
      "-loop",
      "1",
      "-framerate",
      String(VIDEO_FRAME_RATE),
      "-t",
      formatNumber(sceneDuration),
      "-i",
      logoPath
    );

    sceneFilters.push(
      "[1:v]" +
        "scale=96:96:" +
        "force_original_aspect_ratio=decrease," +
        "format=rgba" +
        "[logoOverlay]"
    );

    sceneFilters.push(
      "[scene0][logoOverlay]" +
        "overlay=" +
        "x=W-w-46:" +
        "y=245:" +
        "format=auto" +
        "[sceneFinal]"
    );

    videoLabel =
      "[sceneFinal]";
  }

  commandArguments.push(
    "-filter_complex",
    sceneFilters.join(";"),
    "-map",
    videoLabel,
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "20",
    "-pix_fmt",
    "yuv420p",
    "-r",
    String(VIDEO_FRAME_RATE),
    "-threads",
    "1",
    "-an",
    outputPath
  );

  await runFfmpeg(
    commandArguments,
    {
      timeoutMilliseconds:
        10 * 60 * 1000
    }
  );

  const outputStats =
    await fs.stat(outputPath);

  if (outputStats.size === 0) {
    throw new Error(
      `FFmpeg created an empty scene clip for scene ${scene.sceneNumber}.`
    );
  }

  return {
    outputPath,
    durationSeconds:
      sceneDuration
  };
}
export async function renderVideo({
  project,
  storyboard,
  projectDirectory,
  musicChoice = "none",
  musicVolume = 10
}) {
  validateMusicVolume(musicVolume);
  const music = await prepareMusic(musicChoice);
  validateInputs({
    project,
    storyboard,
    projectDirectory
  });

  const narrationPath = path.join(
    projectDirectory,
    "narration.mp3"
  );

  await fs.access(narrationPath);

  const fontPath =
    await findVideoFont(project.language || project.targetLanguage || "en");

  const outputName =
    "video.mp4";

  const temporaryName =
    "video.tmp.mp4";

  const outputPath = path.join(
    projectDirectory,
    outputName
  );

  const temporaryPath = path.join(
    projectDirectory,
    temporaryName
  );

  const textFiles = [];
  const temporaryFiles = [];
  const hideRoleLabel =
    String(project.language || project.targetLanguage || "en")
      .toLowerCase()
      .startsWith("hi");


  const createTextFile =
    async (name, content) => {
      const filePath = path.join(
        projectDirectory,
        name
      );

      await fs.writeFile(
        filePath,
        String(content ?? "").trim(),
        "utf8"
      );

      textFiles.push(filePath);

      return filePath;
    };

  await fs.rm(
    temporaryPath,
    {
      force: true
    }
  );

  try {
    const titlePath =
      await createTextFile(
        "video-title.tmp.txt",
        wrapText(
          storyboard.title,
          34
        )
      );

    const brandPath =
      await createTextFile(
        "video-brand.tmp.txt",
        getBrandText(project)
      );

    const logoAsset =
      project.assets?.productLogo || null;

    const logoPath =
      logoAsset
        ? path.join(
            projectDirectory,
            logoAsset.storedName
          )
        : null;

    if (logoPath) {
      await fs.access(logoPath);
    }

    const sceneClipPaths = [];

    for (
      let sceneIndex = 0;
      sceneIndex < storyboard.scenes.length;
      sceneIndex += 1
    ) {
      const scene =
        storyboard.scenes[sceneIndex];

      const asset =
        project.assets.productImages[
          scene.imageIndex - 1
        ];

      if (!asset) {
        throw new Error(
          `Scene ${scene.sceneNumber} references unavailable image ${scene.imageIndex}.`
        );
      }

      const imagePath =
        path.join(
          projectDirectory,
          asset.storedName
        );

      await fs.access(imagePath);

      const captionPath =
        await createTextFile(
          `video-caption-${sceneIndex + 1}.tmp.txt`,
          wrapText(
            scene.caption,
            28
          )
        );

      const rolePath =
        await createTextFile(
          `video-role-${sceneIndex + 1}.tmp.txt`,
          hideRoleLabel
            ? ""
            : getRoleLabel(scene.role)
        );

      const sceneClipPath =
        path.join(
          projectDirectory,
          `video-scene-${sceneIndex + 1}-${randomUUID()}.tmp.mp4`
        );

      temporaryFiles.push(
        sceneClipPath
      );

      await renderSceneClip({
        scene,
        imagePath,
        logoPath:
          logoAsset
            ? logoPath
            : null,
        outputPath:
          sceneClipPath,
        fontPath,
        titlePath,
        captionPath,
        rolePath,
        brandPath,
        showCtaWebsite:
          Boolean(project.website)
      });

      sceneClipPaths.push(
        sceneClipPath
      );
    }

    if (
      sceneClipPaths.length !==
      storyboard.scenes.length
    ) {
      throw new Error(
        "Not all storyboard scenes were rendered."
      );
    }

    const concatListPath =
      path.join(
        projectDirectory,
        `video-concat-${randomUUID()}.tmp.txt`
      );

    temporaryFiles.push(
      concatListPath
    );

    const escapeConcatPath =
      (filePath) =>
        filePath
          .replace(/\\/g, "/")
          .replace(/'/g, "'\\''");

    const concatList =
      sceneClipPaths
        .map(
          (sceneClipPath) =>
            `file '${escapeConcatPath(sceneClipPath)}'`
        )
        .join("\n");

    await fs.writeFile(
      concatListPath,
      `${concatList}\n`,
      "utf8"
    );

    const commandArguments = [
      "-hide_banner",
      "-loglevel",
      "warning",
      "-y",
      "-threads",
      "1",
      "-filter_threads",
      "1",
      "-filter_complex_threads",
      "1",
      "-f",
      "concat",
      "-safe",
      "0",
      "-i",
      concatListPath,
      "-i",
      narrationPath
    ];

    const narrationInputIndex = 1;

    let musicInputIndex = null;

    if (music.path) {
      musicInputIndex = 2;

      commandArguments.push(
        "-stream_loop",
        "-1",
        "-i",
        music.path
      );
    }

    const audioFilters =
      audioMixFilters(
        narrationInputIndex,
        musicInputIndex,
        storyboard.totalDurationSeconds,
        musicVolume
      );

    commandArguments.push(
      "-filter_complex",
      audioFilters.join(";"),
      "-map",
      "0:v:0",
      "-map",
      "[audio]",
      "-c:v",
      "copy",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-ar",
      "48000",
      "-movflags",
      "+faststart",
      temporaryPath
    );

    await runFfmpeg(
      commandArguments,
      {
        timeoutMilliseconds:
          10 * 60 * 1000
      }
    );

    const durationSeconds =
      await probeDuration(
        temporaryPath
      );

    const outputStats =
      await fs.stat(
        temporaryPath
      );

    if (outputStats.size === 0) {
      throw new Error(
        "FFmpeg created an empty video."
      );
    }

    await fs.rm(
      outputPath,
      {
        force: true
      }
    );

    await fs.rename(
      temporaryPath,
      outputPath
    );

    return {
      storedName:
        outputName,
      format:
        "mp4",
      width:
        VIDEO_WIDTH,
      height:
        VIDEO_HEIGHT,
      aspectRatio:
        "9:16",
      frameRate:
        VIDEO_FRAME_RATE,
      durationSeconds:
        Number(
          durationSeconds.toFixed(3)
        ),
      byteLength:
        outputStats.size,
      videoCodec:
        "h264",
      audioCodec:
        "aac",
      music: {...music.metadata, volume: musicVolume},
      visualTemplate:
        "automatic-polished",
      generatedAt:
        new Date().toISOString()
    };
  } finally {
    await fs.rm(
      temporaryPath,
      {
        force: true
      }
    );

    await Promise.all(
      textFiles.map(
        (filePath) =>
          fs.rm(
            filePath,
            {
              force: true
            }
          )
      )
    );
    await Promise.all(
      temporaryFiles.map(
        (filePath) =>
          fs.rm(
            filePath,
            {
              force: true
            }
          )
      )
    );
  }
}


export async function uploadToR2(localPath, key) {
  const stream = fsSync.createReadStream(localPath);
  await r2Client.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: stream, ContentType: "video/mp4" }));
  return `${R2_PUBLIC_BASE}/${key}`;
}
