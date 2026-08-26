import {
  ffmpegPath,
  ffprobePath,
  runFfmpeg,
  runFfprobe
} from "../mediaTools.mjs";

const ffmpegVersion =
  await runFfmpeg([
    "-version"
  ]);

const ffprobeVersion =
  await runFfprobe([
    "-version"
  ]);

const encoders =
  await runFfmpeg([
    "-hide_banner",
    "-encoders"
  ]);

const filters =
  await runFfmpeg([
    "-hide_banner",
    "-filters"
  ]);

const encoderOutput =
  encoders.standardOutput +
  encoders.standardError;

const filterOutput =
  filters.standardOutput +
  filters.standardError;

const requiredCapabilities = {
  h264:
    encoderOutput.includes("libx264"),
  aac:
    /\bAAC\b/i.test(encoderOutput),
  scale:
    /\bscale\b/.test(filterOutput),
  pad:
    /\bpad\b/.test(filterOutput),
  zoompan:
    /\bzoompan\b/.test(filterOutput)
};

console.log(
  ffmpegVersion.standardOutput
    .split(/\r?\n/)[0]
);

console.log(
  ffprobeVersion.standardOutput
    .split(/\r?\n/)[0]
);

console.log(
  `FFmpeg path present: ${Boolean(ffmpegPath)}`
);

console.log(
  `FFprobe path present: ${Boolean(ffprobePath)}`
);

for (
  const [capability, available]
  of Object.entries(requiredCapabilities)
) {
  console.log(
    `${capability} available: ${available}`
  );

  if (!available) {
    throw new Error(
      `Required FFmpeg capability is missing: ${capability}`
    );
  }
}

console.log(
  "PASS: Video rendering tools are ready."
);
