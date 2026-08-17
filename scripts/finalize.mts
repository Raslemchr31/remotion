import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";

import { paths, putFinal, putVideoFile } from "../src/lib/store";
import { requireEnv, resolveProject, reviewLink, run } from "./lib.mjs";

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

if (project.finalUrl && project.finalVersion === project.version) {
  console.log(`v${project.version} is already rendered:\n  ${project.finalUrl}`);
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
console.log(`Rendered ${(size / 1e6).toFixed(1)} MB, uploading`);

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
