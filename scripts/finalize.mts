import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";

import { finalDurationSec } from "../src/lib/schema";
import { paths, putFinal, putVideoFile } from "../src/lib/store";
import { FFPROBE, requireEnv, resolveProject, reviewLink, run } from "./lib.mjs";

/**
 * Renders the final MP4 and makes the download live on the client's page.
 *
 * This is the only full render in the system. Every review iteration before it is
 * composited in the client's browser by @remotion/player, which is what keeps the
 * loop fast — a render here costs minutes, and doing one per iteration would put
 * that cost in front of every comment.
 *
 *   npm run video:final
 */

requireEnv("BLOB_READ_WRITE_TOKEN");

const project = await resolveProject(process.argv);
if (!project.edits || !project.version) {
  console.error("Nothing to render: no version has been posted yet.");
  process.exit(1);
}

// --force re-renders a version that already has a final. Needed when a render
// produced the wrong file: without it, the bad output blocks its own replacement.
const force = process.argv.includes("--force");

if (!force && project.finalUrl && project.finalVersion === project.version) {
  console.log(
    `v${project.version} is already rendered:\n  ${project.finalUrl}\n\n` +
      `Pass --force to render it again.`,
  );
  process.exit(0);
}

await mkdir("work", { recursive: true });
const propsFile = "work/props.json";
const output = `work/final-v${project.version}.mp4`;
await writeFile(propsFile, JSON.stringify(project.edits, null, 2), "utf8");

console.log(`Rendering v${project.version} of "${project.title}" — this takes a few minutes.`);

/**
 * --concurrency=2 matches a modest runner; going higher starves each Chromium tab
 * and shows up as "Target closed" crashes.
 *
 * --timeout raises the delayRender ceiling from its 30s default, since four font
 * families plus a phone-sized video pulled from Blob storage all hold handles
 * against it on a cold start.
 */
await run(
  "npx",
  [
    "remotion", "render",
    "src/remotion/index.ts",
    "MainVideo",
    output,
    `--props=${propsFile}`,
    "--codec=h264",
    "--crf=20",
    "--concurrency=2",
    "--timeout=300000",
    "--log=error",
  ],
  {
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === "win32",
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=8192" },
  },
);

const size = (await stat(output)).size;

/**
 * Verify the render is the length the preview promised.
 *
 * `remotion render --props` merges the composition's defaultProps per key, so an
 * edit that omits an optional key silently inherits the demo's. That once welded a
 * placeholder intro card onto a client's video: the Player showed 11s and the file
 * was 13s. The preview cannot catch it — it never merges — so the check belongs
 * here, where the file exists and the expected length is known.
 */
const expectedSec = finalDurationSec(project.edits);
const { stdout } = await run(FFPROBE, [
  "-v", "error",
  "-show_entries", "format=duration",
  "-of", "default=noprint_wrappers=1:nokey=1",
  output,
]);
const actualSec = Number(stdout.trim());
if (!Number.isFinite(actualSec) || Math.abs(actualSec - expectedSec) > 0.3) {
  console.error(
    `Render length is wrong: expected ${expectedSec.toFixed(2)}s, got ${actualSec}s.\n` +
      `Something is being merged into the props that is not in the edits — check that\n` +
      `SAMPLE_EDITS in src/remotion/Root.tsx sets no optional key (intro, outro, logo).\n` +
      `Not uploading; the client would have received the wrong video.`,
  );
  process.exit(1);
}

console.log(`Rendered ${(size / 1e6).toFixed(1)} MB, ${actualSec}s as expected. Uploading.`);

const url = await putVideoFile(
  paths.finalVideo(project.token, project.version),
  createReadStream(output),
);

await putFinal(project.token, {
  url,
  version: project.version,
  renderedAt: new Date().toISOString(),
});

await rm("work", { recursive: true, force: true });

console.log(
  `
Done. The download button is live on his page:
  ${reviewLink(project.token)}

Direct file: ${url}
`.trim(),
);
