import {
  spawn
} from "node:child_process";
import bundledFfmpegPath from "ffmpeg-static";

const ffmpegPath = process.env.FFMPEG_PATH?.trim() || bundledFfmpegPath || "ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";

const ffprobePath =
  ffprobeInstaller.path;

function runExecutable({
  executable,
  arguments: commandArguments,
  timeoutMilliseconds = 120000
}) {
  return new Promise(
    (resolve, reject) => {
      const child = spawn(
        executable,
        commandArguments,
        {
          windowsHide: true,
          stdio: [
            "ignore",
            "pipe",
            "pipe"
          ]
        }
      );

      let standardOutput = "";
      let standardError = "";
      let completed = false;

      const timeout = setTimeout(
        () => {
          if (completed) {
            return;
          }

          child.kill();

          const error = new Error(
            `Media command exceeded ${timeoutMilliseconds} milliseconds.`
          );

          error.code =
            "MEDIA_COMMAND_TIMEOUT";

          reject(error);
        },
        timeoutMilliseconds
      );

      child.stdout.on(
        "data",
        (chunk) => {
          standardOutput +=
            chunk.toString();
        }
      );

      child.stderr.on(
        "data",
        (chunk) => {
          standardError +=
            chunk.toString();
        }
      );

      child.on(
        "error",
        (error) => {
          clearTimeout(timeout);
          completed = true;
          reject(error);
        }
      );

      child.on(
        "close",
        (exitCode) => {
          clearTimeout(timeout);
          completed = true;

          if (exitCode !== 0) {
            const error = new Error(
              standardError.trim() ||
              standardOutput.trim() ||
              `Media command failed with exit code ${exitCode}.`
            );

            error.code =
              "MEDIA_COMMAND_FAILED";

            error.exitCode =
              exitCode;

            error.standardOutput =
              standardOutput;

            error.standardError =
              standardError;

            reject(error);
            return;
          }

          resolve({
            exitCode,
            standardOutput,
            standardError
          });
        }
      );
    }
  );
}

export function runFfmpeg(
  commandArguments,
  options = {}
) {
  if (!ffmpegPath) {
    throw new Error(
      "The FFmpeg executable is unavailable."
    );
  }

  return runExecutable({
    executable:
      ffmpegPath,
    arguments:
      commandArguments,
    ...options
  });
}

export function runFfprobe(
  commandArguments,
  options = {}
) {
  if (!ffprobePath) {
    throw new Error(
      "The FFprobe executable is unavailable."
    );
  }

  return runExecutable({
    executable:
      ffprobePath,
    arguments:
      commandArguments,
    ...options
  });
}

export async function probeDuration(
  mediaPath
) {
  const result =
    await runFfprobe([
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      mediaPath
    ]);

  const durationSeconds =
    Number.parseFloat(
      result.standardOutput.trim()
    );

  if (
    !Number.isFinite(durationSeconds) ||
    durationSeconds <= 0
  ) {
    const error = new Error(
      `Could not determine media duration: ${mediaPath}`
    );

    error.code =
      "MEDIA_DURATION_INVALID";

    throw error;
  }

  return durationSeconds;
}

export {
  ffmpegPath,
  ffprobePath
};
