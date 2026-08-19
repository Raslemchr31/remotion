import { randomBytes } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { basename, extname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { editsSchema } from "../src/lib/schema";
import { createVideo, paths, putEdits, putVideoFile } from "../src/lib/store";
import { FFMPEG, FFPROBE, parseArgs, rememberProject, requireEnv, reviewLink, run } from "./lib.mjs";

/**
 * Publishes the clips the client just sent.
 *
 * Transcodes each onto one shared canvas, measures them, uploads them, creates a
 * pass-through first version that plays them in order, and prints the review link.
 *
 *   npm run video:new -- <CODE> [--brief "what he asked for"]
 *   npm run video:new -- <file or https URL> [more files...]
 */

requireEnv("BLOB_READ_WRITE_TOKEN");

const token = randomBytes(32).toString("base64url");
await mkdir("work", { recursive: true });

const { positional: inputs, flags } = parseArgs(process.argv);

async function download(url: string, name: string): Promise<string> {
  const target = `work/incoming-${name}`;
  console.log(`Fetching ${name}`);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    console.error(`Could not fetch ${name}: ${response.status} ${response.statusText}`);
    process.exit(1);
  }
  await pipeline(
    Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]),
    createWriteStream(target),
  );
  return target;
}

/**
 * Three ways the clips arrive, because the surface decides which is possible:
 *
 *   a 6-char code   what the client read off the send page — the normal case,
 *                   since Claude Code on a phone caps a chat attachment at 30 MB
 *   nothing         the newest upload waiting in storage
 *   paths or URLs   files Claude already has, or anything reachable over https
 *
 * A code can carry several clips; everything after this block treats them alike.
 */
type Incoming = { file: string; filename: string };
let incoming: Incoming[];
let intakeCode: string | undefined;

const first = inputs[0];
const looksLikeCode =
  inputs.length === 1 && first !== undefined && /^[0-9A-Za-z]{4,12}$/.test(first) && !existsSync(first);

if (inputs.length === 0 || looksLikeCode) {
  const { listPendingIntakes, loadIntake } = await import("../src/lib/store");
  const intake = looksLikeCode
    ? await loadIntake(first.toUpperCase())
    : (await listPendingIntakes())[0];

  if (!intake) {
    console.error(
      looksLikeCode
        ? `No upload found with code ${first.toUpperCase()}. Ask him to check the code on the send page.`
        : `No video is waiting.\n\nAsk him to open the send page, pick his clips, and tell you the code.`,
    );
    process.exit(1);
  }

  intakeCode = intake.code;
  console.log(
    `Upload ${intake.code}: ${intake.files.length} clip(s), ` +
      `${(intake.files.reduce((n, f) => n + f.sizeBytes, 0) / 1e6).toFixed(1)} MB total`,
  );
  incoming = [];
  for (const f of intake.files) {
    incoming.push({ file: await download(f.url, f.filename), filename: f.filename });
  }
} else {
  incoming = [];
  for (const input of inputs) {
    if (/^https?:\/\//.test(input)) {
      const name = basename(new URL(input).pathname) || "video.mp4";
      incoming.push({ file: await download(input, name), filename: name });
    } else {
      incoming.push({ file: input, filename: basename(input) });
    }
  }
}

const title =
  (typeof flags["--title"] === "string" ? flags["--title"] : undefined) ??
  incoming[0].filename.replace(extname(incoming[0].filename), "") +
    (incoming.length > 1 ? ` +${incoming.length - 1}` : "");
const brief = typeof flags["--brief"] === "string" ? flags["--brief"] : "";

/** Reads dimensions, frame rate and duration from a file. */
async function probe(file: string) {
  const { stdout } = await run(FFPROBE, [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height",
    "-show_entries", "format=duration",
    "-of", "json",
    file,
  ]);
  const parsed = JSON.parse(stdout) as {
    streams?: { width: number; height: number }[];
    format: { duration: string };
  };
  const stream = parsed.streams?.[0];
  if (!stream) throw new Error(`ffprobe found no video stream in ${file}`);
  return {
    width: stream.width,
    height: stream.height,
    durationSec: Number(Number(parsed.format.duration).toFixed(3)),
  };
}

/**
 * The canvas every clip is placed on: the first clip's shape, capped at 1920 on the
 * long edge and rounded to even numbers.
 *
 * Taking it from the first clip rather than, say, the largest keeps the result
 * predictable — the client's opening shot decides whether the ad is portrait or
 * landscape, which is the choice he actually made when he filmed it.
 */
const firstProbe = await probe(incoming[0].file);
const scale = Math.min(1, 1920 / Math.max(firstProbe.width, firstProbe.height));
const canvasWidth = Math.max(16, Math.round((firstProbe.width * scale) / 2) * 2);
const canvasHeight = Math.max(16, Math.round((firstProbe.height * scale) / 2) * 2);
const fps = 30;

console.log(`Canvas ${canvasWidth}x${canvasHeight} @ ${fps}fps, from ${incoming[0].filename}`);

const sources: { url: string; filename: string; durationSec: number }[] = [];

for (const [index, clip] of incoming.entries()) {
  const output = `work/${token}-${index}.mp4`;
  const sizeMb = ((await stat(clip.file)).size / 1e6).toFixed(1);
  console.log(`Transcoding ${clip.filename} (${sizeMb} MB)`);

  /**
   * The transcode is not a quality step — it is why this works on the client's phone
   * at all. Phone recordings are commonly HEVC in a .mov, which mobile browsers
   * refuse to decode, and carry rotation as metadata rather than rotated pixels.
   * ffmpeg applies the rotation and re-encodes to H.264/AAC.
   *
   * -r 30 forces a constant frame rate: footage arrives at 29.97, 30, 60 or
   * something variable, and a fractional fps makes every seconds-to-frames
   * conversion inexact, which shows up as captions drifting off the moments the
   * client pinned them to.
   *
   * scale+pad puts every clip on the identical canvas, letterboxing rather than
   * cropping a clip that was shot the other way round — losing half a handbag to a
   * centre-crop is worse than a black bar. With clips of the same shape, which is
   * the normal case, the pad is a no-op.
   */
  await run(
    FFMPEG,
    [
      "-y",
      "-i", clip.file,
      "-vf",
      `scale=${canvasWidth}:${canvasHeight}:force_original_aspect_ratio=decrease,` +
        `pad=${canvasWidth}:${canvasHeight}:(ow-iw)/2:(oh-ih)/2:black,setsar=1`,
      "-r", String(fps),
      "-c:v", "libx264",
      "-profile:v", "high",
      "-preset", "medium",
      "-crf", "22",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "128k",
      "-ac", "2",
      "-ar", "48000",
      // moov atom first, so the phone can start playing before the whole file has
      // arrived. On mobile data that is the difference between an instant preview
      // and a long blank wait.
      "-movflags", "+faststart",
      output,
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );

  const measured = await probe(output);
  if (!Number.isFinite(measured.durationSec) || measured.durationSec <= 0) {
    throw new Error(`Transcode of ${clip.filename} produced an unusable duration`);
  }

  console.log(`  uploading (${measured.durationSec}s)`);
  const url = await putVideoFile(paths.sourceVideo(token, index), createReadStream(output));
  sources.push({ url, filename: clip.filename, durationSec: measured.durationSec });
}

await createVideo({
  token,
  title,
  brief,
  createdAt: new Date().toISOString(),
  sources,
  fps,
  width: canvasWidth,
  height: canvasHeight,
});

/**
 * A pass-through v1: every clip in order, untouched, no captions or cards. The link
 * therefore works the instant it is handed over, even if the real edit lands a
 * moment later, so the client never opens a broken page.
 */
await putEdits(token, {
  version: 1,
  edits: editsSchema.parse({
    clips: sources.map((s) => ({
      sourceUrl: s.url,
      durationSec: s.durationSec,
      label: s.filename,
    })),
    fps,
    width: canvasWidth,
    height: canvasHeight,
  }),
  answeredRounds: 0,
  postedAt: new Date().toISOString(),
});

// Mark the upload used so a later publish does not pick it up again. Done last, so
// a failure anywhere above leaves it pending and the ingest stays retryable.
if (intakeCode) {
  const { markIntakeConsumed } = await import("../src/lib/store");
  await markIntakeConsumed(intakeCode, token);
}

rememberProject(token);
await rm("work", { recursive: true, force: true });

const total = sources.reduce((n, s) => n + s.durationSec, 0);
console.log(
  `
Published ${sources.length} clip(s), ${total.toFixed(2)}s of footage.

  link     ${reviewLink(token)}
  canvas   ${canvasWidth}x${canvasHeight} @ ${fps}fps
  brief    ${brief || "(none given)"}

Clips, in order — use these values EXACTLY in edits.json:
${sources
  .map(
    (s, i) =>
      `  [${i}] ${s.filename}  ${s.durationSec}s\n      "sourceUrl": "${s.url}"`,
  )
  .join("\n")}

Before editing: watch the footage, then ask him your clarifying questions.
`.trim(),
);
