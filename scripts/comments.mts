import { writeFileSync } from "node:fs";

import { finalDurationSec, locateFinalSecond, resolveSegments, unansweredRounds } from "../src/lib/schema";
import { clock, requireEnv, resolveProject, reviewLink } from "./lib.mjs";

/**
 * "I left comments" — this is what Claude runs in response.
 *
 * Prints the comments it has not answered yet, each located back to the clip and
 * second it actually refers to, and writes the current edits to edits.json so the
 * next version is produced by modifying that file rather than retyping it.
 *
 *   npm run video:comments
 *   npm run video:comments -- --token <token>
 */

requireEnv("BLOB_READ_WRITE_TOKEN");

const project = await resolveProject(process.argv);
const pending = unansweredRounds(project);

console.log(
  `
${project.title}   (v${project.version ?? 0}, status ${project.status})
  link      ${reviewLink(project.token)}
  brief     ${project.brief || "(none given)"}
  clips     ${project.video.sources.length}
  final     ${project.edits ? finalDurationSec(project.edits).toFixed(2) : "?"}s
${project.note ? `  last note ${project.note}` : ""}
`.trimEnd(),
);

if (project.edits) {
  const { edits } = project;
  console.log("\nRunning order:");
  let cursor = edits.intro?.durationSec ?? 0;
  if (edits.intro) console.log(`  0.00–${cursor.toFixed(2)}s   intro card`);
  for (const segment of resolveSegments(edits)) {
    const clip = edits.clips[segment.clip];
    if (!clip) continue;
    const length = Math.min(segment.toSec, clip.durationSec) - segment.fromSec;
    console.log(
      `  ${cursor.toFixed(2)}–${(cursor + length).toFixed(2)}s   clip ${segment.clip}` +
        `${clip.label ? ` (${clip.label})` : ""} ${segment.fromSec.toFixed(2)}–${segment.toSec.toFixed(2)}s`,
    );
    cursor += length;
  }
  if (edits.outro) {
    console.log(`  ${cursor.toFixed(2)}–${(cursor + edits.outro.durationSec).toFixed(2)}s   outro card`);
  }
}

if (project.status === "done") {
  console.log(`\nThe client already approved this. Final video: ${project.finalUrl}`);
  process.exit(0);
}

if (pending.length === 0) {
  console.log(
    `
No unanswered comments.
${
  project.rounds.length === 0
    ? "The client has not submitted anything yet — nothing to do but wait."
    : "Every round he submitted is already answered by the current version."
}
${project.awaitingFinal ? "\nHe pressed Done. Render the final: npm run video:final" : ""}
`.trimEnd(),
  );
} else {
  console.log(`\n${pending.length} round(s) to answer:\n`);
  for (const round of pending) {
    console.log(`  Round ${round.round}  (he was watching v${round.onVersion})`);
    for (const comment of round.comments) {
      /**
       * Both the final time and the clip it lands in are printed, because they are
       * used for different things: captions and overlays are placed on the final
       * timeline, while a segment is cut in clip seconds. Working that out by hand
       * across several clips is exactly where mistakes happen.
       */
      const at = project.edits ? locateFinalSecond(project.edits, comment.timeSec) : undefined;
      const where = at
        ? `clip ${at.clip}${at.label ? ` (${at.label})` : ""} @ ${at.clipSec.toFixed(2)}s`
        : "on a card, not the footage";
      console.log(
        `    ${clock(comment.timeSec)}  final ${comment.timeSec.toFixed(2)}s  →  ${where}\n` +
          `      ${comment.text}`,
      );
    }
    console.log("");
  }
}

if (project.edits) {
  writeFileSync("edits.json", JSON.stringify(project.edits, null, 2) + "\n", "utf8");
  console.log(
    `Current edits written to edits.json — modify it, then:
  npm run video:update -- edits.json --note "what you changed"`,
  );
}
