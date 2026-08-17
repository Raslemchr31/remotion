import { execFile } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { put } from "@vercel/blob";

const run = promisify(execFile);

/**
 * Renders the approved version to a final MP4.
 *
 * The props come from the app rather than from workflow inputs on purpose:
 * workflow_dispatch inputs are always strings and capped at 25 properties, which
 * an edits object with captions and overlays would blow through immediately. The
 * workflow is told only which project and version to fetch.
 *
 * Usage: node scripts/render.mjs <projectId> <version>
 * Env:   APP_URL, CI_API_KEY, BLOB_READ_WRITE_TOKEN
 */

const [projectId, expectedVersion] = process.argv.slice(2);
if (!projectId) {
  console.error("usage: node scripts/render.mjs <projectId> [version]");
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

async function report(body) {
  const response = await fetch(`${APP_URL}/api/projects/${projectId}/render`, {
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
  if (!project.edits) throw new Error("Project has no edits to render");

  const version = project.editsVersion;
  if (expectedVersion && String(version) !== String(expectedVersion)) {
    // Claude posted a newer version between approval and this run. Rendering the
    // newer cut would deliver something the client never approved.
    throw new Error(
      `Version mismatch: approved v${expectedVersion} but the project is now at v${version}`,
    );
  }

  await mkdir("work", { recursive: true });
  const propsFile = "work/props.json";
  const output = `work/final-v${version}.mp4`;

  await writeFile(propsFile, JSON.stringify(project.edits, null, 2), "utf8");
  console.log(`Rendering v${version} of "${project.title}"`);

  /**
   * --concurrency=2 matches a 4-vCPU runner (Remotion's own default), and going
   * higher starves each Chromium tab into "Target closed" crashes.
   *
   * --timeout raises the delayRender ceiling from its 30s default: four font
   * families plus a phone-sized video pulled from Blob storage all hold handles
   * against it on a cold runner.
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
      "--log=info",
    ],
    {
      maxBuffer: 64 * 1024 * 1024,
      shell: process.platform === "win32",
      env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=8192" },
    },
  );

  const size = (await stat(output)).size;
  console.log(`Rendered ${(size / 1e6).toFixed(1)} MB, uploading`);

  const blob = await put(`projects/${projectId}/final-v${version}.mp4`, createReadStream(output), {
    access: "public",
    contentType: "video/mp4",
    addRandomSuffix: false,
    allowOverwrite: true,
    multipart: true,
    cacheControlMaxAge: 60 * 60 * 24 * 365,
  });

  await report({ renderUrl: blob.url, version, renderedAt: new Date().toISOString() });
  console.log(`Done: ${blob.url}`);

  await rm("work", { recursive: true, force: true });
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Render failed:", message);
  try {
    await report({ error: message.slice(0, 900) });
  } catch (reportError) {
    console.error("Could not report the failure either:", reportError);
  }
  process.exit(1);
});
