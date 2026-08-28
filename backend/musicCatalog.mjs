import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const MUSIC_TRACKS = Object.freeze({
  none: Object.freeze({id: "none", title: "No music"}),
  upbeat: Object.freeze({id: "upbeat", title: "Funked Up", artist: "Joth", license: "CC0-1.0"}),
  calm: Object.freeze({id: "calm", title: "Vaporware", artist: "The Cynic Project", license: "CC0-1.0"}),
  piano: Object.freeze({id: "piano", title: "JRPG Piano", artist: "Joth", license: "CC0-1.0"}),
  ambient: Object.freeze({id: "ambient", title: "Lifewave 2k", artist: "The Cynic Project", license: "CC0-1.0"})
});

// IDs are the only accepted input: never accept filenames or remote URLs.
export async function prepareMusic(choice = "none") {
  if (typeof choice !== "string" || !Object.hasOwn(MUSIC_TRACKS, choice)) {
    const error = new Error("Select a valid background music track.");
    error.status = 400;
    throw error;
  }
  const metadata = MUSIC_TRACKS[choice];
  if (choice === "none") return {metadata, path: null};
  const path = fileURLToPath(new URL(`../Frontend/music/${choice}.mp3`, import.meta.url));
  try {
    const stat = await fs.stat(path);
    if (!stat.isFile() || stat.size < 1000) throw new Error("Missing audio");
  } catch {
    const error = new Error("The selected music is unavailable. Choose No music or repair the music files before retrying.");
    error.status = 503;
    throw error;
  }
  return {metadata, path};
}

export function validateMusicVolume(value = 10) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100) {
    const error = new Error("Choose a music volume from 0 to 100 percent.");
    error.status = 400;
    throw error;
  }
  return value;
}

export function audioMixFilters(voiceIndex, musicIndex, duration, musicVolume = 10) {
  validateMusicVolume(musicVolume);
  if (!Number.isInteger(voiceIndex) || voiceIndex < 0 ||
      (musicIndex !== null && (!Number.isInteger(musicIndex) || musicIndex < 0 || musicIndex === voiceIndex)) ||
      !Number.isFinite(duration) || duration <= 0 || duration > 300) {
    throw new Error("Invalid audio mix inputs.");
  }
  const voice = `[${voiceIndex}:a]apad=pad_dur=${duration},atrim=duration=${duration},asetpts=PTS-STARTPTS`;
  if (musicIndex === null || musicVolume === 0) return [voice + "[audio]"];
  const fade = Math.min(1.5, duration / 2);
  return [
    voice + ",aformat=sample_rates=48000:channel_layouts=stereo[voice]",
    `[${musicIndex}:a]atrim=duration=${duration},asetpts=PTS-STARTPTS,` +
      `aformat=sample_rates=48000:channel_layouts=stereo,volume=${musicVolume / 100},` +
      `afade=t=in:d=${Math.min(0.75, duration/2)},afade=t=out:st=${duration-fade}:d=${fade}[music]`,
    "[voice][music]amix=inputs=2:duration=first:dropout_transition=0:normalize=0," +
      `alimiter=limit=0.95:level=false:latency=true,atrim=duration=${duration}[audio]`
  ];
}
