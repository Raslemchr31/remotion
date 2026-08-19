import { readFileSync } from "node:fs";

import { editsSchema, finalDurationSec } from "../src/lib/schema";
import { putEdits } from "../src/lib/store";
import { flag, requireEnv, resolveProject, reviewLink } from "./lib.mjs";

/**
 * Posts a new version. The client's open page picks it up on its own.
 *
 *   npm run video:update -- edits.json --note "كبّرت السعر"
 */

const file = process.argv[2];
if (!file || file.startsWith("--")) {
  console.error('usage: npm run video:update -- <edits.json> [--note "..."] [--token <token>]');
  process.exit(1);
}

requireEnv("BLOB_READ_WRITE_TOKEN");

const project = await resolveProject(process.argv);
const { video } = project;

const parsed = editsSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
if (!parsed.success) {
  console.error(`${file} does not match the edits schema:\n`);
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join(".") || "(root)"}: ${issue.message}`);
  }
  process.exit(1);
}
const edits = parsed.data;

/**
 * The timeline must describe the file that actually exists. These come from
 * ffprobe at publish time, and inventing them produces a preview that silently
 * disagrees with the render — so this fails loudly instead.
 */
const mismatches: string[] = [];
if (edits.fps !== video.fps) mismatches.push(`fps must be ${video.fps}`);
if (edits.width !== video.width) mismatches.push(`width must be ${video.width}`);
if (edits.height !== video.height) mismatches.push(`height must be ${video.height}`);

if (edits.clips.length !== video.sources.length) {
  mismatches.push(`clips must list all ${video.sources.length} uploaded clip(s), in upload order`);
} else {
  edits.clips.forEach((clip, index) => {
    const source = video.sources[index];
    if (clip.sourceUrl !== source.url) {
      mismatches.push(`clips[${index}].sourceUrl must be exactly:\n    ${source.url}`);
    }
    if (Math.abs(clip.durationSec - source.durationSec) > 0.05) {
      mismatches.push(`clips[${index}].durationSec must be ${source.durationSec}`);
    }
  });
}

// A segment pointing outside a clip renders as nothing: invisible in the props,
// obvious as a gap in the video. Refuse it here rather than ship the gap.
edits.segments.forEach((segment, index) => {
  const source = video.sources[segment.clip];
  if (!source) {
    mismatches.push(`segments[${index}].clip is ${segment.clip}, but there is no such clip`);
    return;
  }
  if (segment.fromSec >= source.durationSec) {
    mismatches.push(
      `segments[${index}] starts at ${segment.fromSec}s, at or past the end of clip ${segment.clip} (${source.durationSec}s)`,
    );
  }
});

if (mismatches.length > 0) {
  console.error("These must match the published video:\n");
  for (const m of mismatches) console.error(`  ${m}`);
  process.exit(1);
}

// Answer every round he has submitted; the server-side equivalent of "caught up".
const answeredRounds = project.rounds.reduce((max, r) => Math.max(max, r.round), 0);
const version = (project.version ?? 0) + 1;

await putEdits(project.token, {
  version,
  edits,
  answeredRounds,
  note: flag(process.argv, "--note"),
  postedAt: new Date().toISOString(),
});

console.log(
  `
Posted v${version}  (${finalDurationSec(edits).toFixed(2)}s, answering ${answeredRounds} round(s)).

Tell the client it is ready — his page updates by itself, no reload needed:
  ${reviewLink(project.token)}
`.trim(),
);
