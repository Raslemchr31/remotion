import { randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { editsSchema } from "../src/lib/schema";
import { createVideo, paths, putEdits, putVideoFile } from "../src/lib/store";
import { FFMPEG, FFPROBE, flag, rememberProject, requireEnv, reviewLink, run } from "./lib.mjs";

/**
 * Publishes a video the client just gave you.
 *
 * Transcodes it, measures it, uploads it, creates a pass-through first version so
 * the link is never broken, prints the link and the numbers needed to write edits.
 *
 *   npm run video:new -- <video file or https URL> [--title "..."] [--brief "..."]
 */

requireEnv("BLOB_READ_WRITE_TOKEN");

const token = randomBytes(32).toString("base64url");
await mkdir("work", { recursive: true });

const input = process.argv[2];
if (!input || input.startsWith("--")) {
  console.error(
    'usage: npm run video:new -- <video file or https URL> [--title "..."] [--brief "..."]',
  );
  process.exit(1);
}

/**
 * A path or an https URL. The path is the normal case: the client attaches the video
 * in the chat and it lands on this session's filesystem, so Claude already has it.
 */
let file = input;
const filename = basename(input.startsWith("http") ? new URL(input).pathname : input) || "video.mp4";

if (/^https?:\/\//.test(input)) {
  file = `work/incoming-${filename}`;
  console.log(`Fetching ${input}`);
  const response = await fetch(input);
  if (!response.ok || !response.body) {
    console.error(`Could not fetch that URL: ${response.status} ${response.statusText}`);
    process.exit(1);
  }
  await pipeline(
    Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
    createWriteStream(file),
  );
}

const title = flag(process.argv, "--title") ?? filename.replace(extname(filename), "");
const brief = flag(process.argv, "--brief") ?? "";

const output = `work/${token}.mp4`;

console.log(`Transcoding ${filename} (${((await stat(file)).size / 1e6).toFixed(1)} MB)`);

/**
 * The transcode is not a quality step — it is why this works on the client's phone
 * at all. Phone recordings are commonly HEVC in a .mov, which mobile browsers
 * refuse to decode, and carry rotation as metadata rather than rotated pixels.
 * ffmpeg applies the rotation and re-encodes to H.264/AAC.
 *
 * -r 30 forces a constant frame rate: source footage arrives at 29.97, 30, 60 or
 * something variable, and a fractional fps makes every seconds-to-frames
 * conversion inexact, which shows up as captions drifting from where the client
 * pinned them.
 *
 * The scale pair caps the long edge at 1920 (a 4K phone video would otherwise make
 * every render several times slower for no visible gain) then rounds to even
 * dimensions, which libx264 with yuv420p requires.
 */
await run(
  FFMPEG,
  [
    "-y",
    "-i", file,
    "-vf",
    "scale='min(1920,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2",
    "-r", "30",
    "-c:v", "libx264",
    "-profile:v", "high",
    "-preset", "medium",
    "-crf", "22",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "128k",
    "-ac", "2",
    // moov atom first, so the phone can start playing before the whole file has
    // arrived. On mobile data that is the difference between an instant preview
    // and a long blank wait.
    "-movflags", "+faststart",
    output,
  ],
  { maxBuffer: 64 * 1024 * 1024 },
);

const { stdout } = await run(FFPROBE, [
  "-v", "error",
  "-select_streams", "v:0",
  "-show_entries", "stream=width,height,r_frame_rate",
  "-show_entries", "format=duration",
  "-of", "json",
  output,
]);

const probed = JSON.parse(stdout) as {
  streams?: { width: number; height: number; r_frame_rate: string }[];
  format: { duration: string };
};
const stream = probed.streams?.[0];
if (!stream) throw new Error("ffprobe found no video stream in the transcode");

const [num, den] = String(stream.r_frame_rate).split("/");
const durationSec = Number(Number(probed.format.duration).toFixed(3));
const fps = Math.round(Number(num) / Number(den || 1));
const { width, height } = stream;

if (!Number.isFinite(durationSec) || durationSec <= 0) {
  throw new Error(`Transcode produced an unusable duration: ${probed.format.duration}`);
}

console.log("Uploading");
const sourceUrl = await putVideoFile(paths.sourceVideo(token), createReadStream(output));

await createVideo({
  token,
  title,
  brief,
  createdAt: new Date().toISOString(),
  sourceUrl,
  originalFilename: filename,
  durationSec,
  fps,
  width,
  height,
});

/**
 * A pass-through v1: the untouched video, no captions or cards. The link therefore
 * works the instant it is handed over, even if the real edit lands a moment later,
 * so the client never opens a broken page.
 */
await putEdits(token, {
  version: 1,
  edits: editsSchema.parse({
    sourceUrl,
    sourceDurationSec: durationSec,
    fps,
    width,
    height,
  }),
  answeredRounds: 0,
  postedAt: new Date().toISOString(),
});

rememberProject(token);
await rm("work", { recursive: true, force: true });

console.log(
  `
Published.

  link      ${reviewLink(token)}
  duration  ${durationSec}s   fps ${fps}   ${width}x${height}
  brief     ${brief || "(none given)"}

Write edits.json using EXACTLY these values for sourceUrl, fps, width and height:
  "sourceUrl": "${sourceUrl}"
  "sourceDurationSec": ${durationSec}, "fps": ${fps}, "width": ${width}, "height": ${height}

Then:  npm run video:update -- edits.json --note "what you changed"
`.trim(),
);
