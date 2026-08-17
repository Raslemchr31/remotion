import { createReadStream } from "node:fs";
import { basename } from "node:path";
import { put } from "@vercel/blob";

/**
 * Development helper: uploads a local video straight to Blob and creates a
 * project from it, standing in for what the phone's browser does.
 *
 * Usage: node scripts/seed-test-project.mjs <file> [title] [brief]
 * Env:   APP_URL, REVIEW_KEY, BLOB_READ_WRITE_TOKEN
 */

const [file, title, brief] = process.argv.slice(2);
if (!file) {
  console.error("usage: node scripts/seed-test-project.mjs <file> [title] [brief]");
  process.exit(1);
}

const APP_URL = process.env.APP_URL?.replace(/\/$/, "");
const REVIEW_KEY = process.env.REVIEW_KEY;
if (!APP_URL || !REVIEW_KEY || !process.env.BLOB_READ_WRITE_TOKEN) {
  console.error("Set APP_URL, REVIEW_KEY and BLOB_READ_WRITE_TOKEN");
  process.exit(1);
}

const filename = basename(file);
const blob = await put(`incoming/${Date.now()}-${filename}`, createReadStream(file), {
  access: "public",
  contentType: filename.endsWith(".mov") ? "video/quicktime" : "video/mp4",
  addRandomSuffix: false,
  allowOverwrite: true,
  multipart: true,
});
console.log("Uploaded:", blob.url);

const response = await fetch(`${APP_URL}/api/projects?key=${encodeURIComponent(REVIEW_KEY)}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    title: title ?? filename,
    brief: brief ?? "",
    originalUrl: blob.url,
    originalFilename: filename,
  }),
});

const body = await response.json();
console.log(response.status, JSON.stringify(body, null, 2));
if (body.id) {
  console.log(`\nReview: ${APP_URL}/review/${body.id}?key=${REVIEW_KEY}`);
}
