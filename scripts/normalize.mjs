import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, rm, stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import { promisify } from "node:util";
import { put } from "@vercel/blob";

const run = promisify(execFile);

/**
 * Turns whatever the client's phone produced into something a browser can play,
 * and measures it.
 *
 * This step is the fix for the original failure: the first version of this
 * workflow handed the raw upload to the browser, and iPhone recordings (HEVC in a
 * .mov container, often with rotation metadata rather than rotated pixels) simply
 * would not decode on the client's phone while playing fine on a desktop. Every
 * upload is now transcoded to baseline-friendly H.264/AAC before anyone sees it.
 *
 * Usage: node scripts/normalize.mjs <projectId>
 * Env:   APP_URL, CI_API_KEY, BLOB_READ_WRITE_TOKEN
 */

const projectId = process.argv[2];
if (!projectId) {
  console.error("usage: node scripts/normalize.mjs <projectId>");
  process.exit(1);
}

const APP_URL = requiredEnv("APP_URL").replace(/\/$/, "");
const CI_API_KEY = requiredEnv("CI_API_KEY");
requiredEnv("BLOB_READ_WRITE_TOKEN");

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env var ${name}`);
    process.exit(1);
  }
  return value;
}

/** Reports the outcome to the app; an error here still marks the project failed. */
async function report(body) {
  const response = await fetch(`${APP_URL}/api/projects/${projectId}/source`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": CI_API_KEY },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`Reporting failed: ${response.status} ${await response.text()}`);
  }
}

async function main() {
  const projectResponse = await fetch(`${APP_URL}/api/projects/${projectId}`, {
    headers: { "x-api-key": CI_API_KEY },
    cache: "no-store",
  });
  if (!projectResponse.ok) {
    throw new Error(`Could not load project: ${projectResponse.status}`);
  }
  const project = await projectResponse.json();
  if (!project.originalUrl) throw new Error("Project has no originalUrl");

  await mkdir("work", { recursive: true });
  const input = "work/original";
  const output = "work/normalized.mp4";

  console.log(`Downloading ${project.originalUrl}`);
  const download = await fetch(project.originalUrl);
  if (!download.ok || !download.body) {
    throw new Error(`Download failed: ${download.status}`);
  }
  await pipeline(Readable.fromWeb(download.body), createWriteStream(input));
  console.log(`Downloaded ${((await stat(input)).size / 1e6).toFixed(1)} MB`);

  /**
   * -r 30 forces a constant frame rate. Phone footage arrives at 29.97, 30, 60 or
   * something variable, and a fractional fps makes every seconds-to-frames
   * conversion in the composition inexact — captions would drift from where the
   * client pinned them. Fixing it at 30 keeps that maths integral.
   *
   * The scale pair caps the long edge at 1920 (a 4K phone video would otherwise
   * make each render several times slower for no visible gain at this size) and
   * then rounds to even dimensions, which libx264 with yuv420p requires.
   *
   * ffmpeg applies rotation metadata by default, so a portrait clip comes out
   * genuinely portrait rather than sideways with a rotation flag.
   */
  console.log("Transcoding to H.264/AAC");
  await run(
    "ffmpeg",
    [
      "-y",
      "-i", input,
      "-vf", "scale='min(1920,iw)':'min(1920,ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2",
      "-r", "30",
      "-c:v", "libx264",
      "-profile:v", "high",
      "-preset", "medium",
      "-crf", "22",
      "-pix_fmt", "yuv420p",
      "-c:a", "aac",
      "-b:a", "128k",
      "-ac", "2",
      // Puts the moov atom first so the browser can start playing before the whole
      // file has arrived — on mobile data that is the difference between an
      // instant preview and a long blank wait.
      "-movflags", "+faststart",
      output,
    ],
    { maxBuffer: 64 * 1024 * 1024 },
  );

  const { stdout } = await run("ffprobe", [
    "-v", "error",
    "-select_streams", "v:0",
    "-show_entries", "stream=width,height,r_frame_rate",
    "-show_entries", "format=duration",
    "-of", "json",
    output,
  ]);
  const probed = JSON.parse(stdout);
  const stream = probed.streams?.[0];
  if (!stream) throw new Error("ffprobe found no video stream in the transcode");

  const [num, den] = String(stream.r_frame_rate).split("/");
  const probe = {
    durationSec: Number(Number(probed.format.duration).toFixed(3)),
    fps: Math.round(Number(num) / Number(den || 1)),
    width: Number(stream.width),
    height: Number(stream.height),
  };
  console.log("Probe:", probe);

  if (!Number.isFinite(probe.durationSec) || probe.durationSec <= 0) {
    throw new Error(`Transcode produced an unusable duration: ${probed.format.duration}`);
  }

  console.log("Uploading normalized video");
  const blob = await put(`projects/${projectId}/normalized.mp4`, createReadStream(output), {
    access: "public",
    contentType: "video/mp4",
    addRandomSuffix: false,
    allowOverwrite: true,
    multipart: true,
    // The normalized file never changes once written, so cache it hard: the
    // client's phone re-fetches it on every review round.
    cacheControlMaxAge: 60 * 60 * 24 * 365,
  });

  await report({ normalizedUrl: blob.url, probe, normalizedAt: new Date().toISOString() });
  console.log(`Done: ${blob.url}`);

  await rm("work", { recursive: true, force: true });
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Normalization failed:", message);
  try {
    await report({ error: message.slice(0, 900) });
  } catch (reportError) {
    console.error("Could not report the failure either:", reportError);
  }
  process.exit(1);
});
