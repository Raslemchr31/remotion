import { existsSync, readFileSync, writeFileSync } from "node:fs";

import { FFMPEG, FFPROBE, flag, loadEnv, run } from "./lib.mjs";

/**
 * Checks that this session can actually do the job, and writes .env.local if the
 * credentials are supplied.
 *
 * A Claude Code cloud session starts from a fresh clone, which has the repo but not
 * .env.local — that file is gitignored, as a file holding a write token must be. So
 * the first run in a new session has nothing to authenticate with, and the failure
 * would otherwise surface deep inside an upload. This turns it into one obvious
 * message with the fix in it.
 *
 *   npm run setup                                    # report what is missing
 *   npm run setup -- --blob-token vercel_blob_rw_... # write it and re-check
 */

const DEFAULT_APP_URL = "https://video-review-lac.vercel.app";

const blobToken = flag(process.argv, "--blob-token");
const appUrlArg = flag(process.argv, "--app-url");

if (blobToken || appUrlArg) {
  const existing = existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "";
  const keep = existing
    .split("\n")
    .filter((l) => l.trim() && !/^(BLOB_READ_WRITE_TOKEN|APP_URL)=/.test(l.trim()));

  const lines = [
    ...keep,
    `BLOB_READ_WRITE_TOKEN=${blobToken ?? process.env.BLOB_READ_WRITE_TOKEN ?? ""}`,
    `APP_URL="${appUrlArg ?? process.env.APP_URL ?? DEFAULT_APP_URL}"`,
  ];
  writeFileSync(".env.local", lines.join("\n").trim() + "\n", "utf8");
  console.log("Wrote .env.local\n");
}

loadEnv();

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];

const appUrl = (process.env.APP_URL ?? DEFAULT_APP_URL).replace(/\/$/, "");

checks.push({
  name: "BLOB_READ_WRITE_TOKEN",
  ok: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
  detail: process.env.BLOB_READ_WRITE_TOKEN
    ? "present"
    : "MISSING — this is the only secret needed; see the fix below",
});

checks.push({ name: "APP_URL", ok: true, detail: appUrl });

// ffmpeg and ffprobe come from npm, so this is really a check that npm install ran.
for (const [name, bin, args] of [
  ["ffmpeg", FFMPEG, ["-version"]],
  ["ffprobe", FFPROBE, ["-version"]],
] as const) {
  try {
    const { stdout } = await run(bin, [...args]);
    checks.push({ name, ok: true, detail: stdout.split("\n")[0].slice(0, 60) });
  } catch (error) {
    checks.push({
      name,
      ok: false,
      detail: `cannot run (${error instanceof Error ? error.message.slice(0, 60) : "unknown"}) — run npm install`,
    });
  }
}

// Outbound network, and proof the deployment is reachable from wherever this runs.
try {
  const response = await fetch(`${appUrl}/api/v/connectivity-probe`, { cache: "no-store" });
  checks.push({
    name: "app reachable",
    // 404 is the expected, correct answer for a token that does not exist.
    ok: response.status === 404 || response.ok,
    detail: `HTTP ${response.status} from ${appUrl}`,
  });
} catch (error) {
  checks.push({
    name: "app reachable",
    ok: false,
    detail: `no network to ${appUrl} (${error instanceof Error ? error.message.slice(0, 50) : "unknown"})`,
  });
}

if (process.env.BLOB_READ_WRITE_TOKEN) {
  try {
    const { list } = await import("@vercel/blob");
    const page = await list({ limit: 1 });
    checks.push({
      name: "blob storage",
      ok: true,
      detail: `readable (${page.blobs.length > 0 ? "has data" : "empty"})`,
    });
  } catch (error) {
    checks.push({
      name: "blob storage",
      ok: false,
      detail: error instanceof Error ? error.message.slice(0, 70) : "unknown error",
    });
  }
}

const pad = Math.max(...checks.map((c) => c.name.length));
console.log("");
for (const check of checks) {
  console.log(`  ${check.ok ? "ok  " : "FAIL"}  ${check.name.padEnd(pad)}  ${check.detail}`);
}

const failed = checks.filter((c) => !c.ok);
if (failed.length === 0) {
  console.log(`
Ready. Publish a video:
  npm run video:new -- <video file or https URL> --brief "what he asked for"
`);
  process.exit(0);
}

console.log(`
${failed.length} problem(s).
`);

if (!process.env.BLOB_READ_WRITE_TOKEN) {
  console.log(
    `To fix the missing token, get it from the Vercel project (Storage -> the Blob
store -> .env.local tab, or run "vercel env pull .env.local" on a machine that is
logged in), then run:

  npm run setup -- --blob-token vercel_blob_rw_XXXXXXXX
`,
  );
}
process.exit(1);
