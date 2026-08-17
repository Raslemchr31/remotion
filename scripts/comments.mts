import { writeFileSync } from "node:fs";

import { finalDurationSec, unansweredRounds } from "../src/lib/schema";
import { clock, requireEnv, resolveProject, reviewLink } from "./lib.mjs";

/**
 * "I left comments" — this is what Claude runs in response.
 *
 * Prints the comments it has not answered yet, the numbers it must copy into the
 * next edits, and writes the current edits to edits.json so the next version can
 * be produced by modifying that file rather than retyping it.
 *
 *   npm run video:comments
 *   npm run video:comments -- --token <token>
 */

requireEnv("BLOB_READ_WRITE_TOKEN");

const project = await resolveProject(process.argv);

const pending = unansweredRounds(project);
const introSec = project.edits?.intro?.durationSec ?? 0;

console.log(
  `
${project.title}   (v${project.version ?? 0}, status ${project.status})
  link      ${reviewLink(project.token)}
  brief     ${project.brief || "(none given)"}
  final     ${project.edits ? finalDurationSec(project.edits).toFixed(2) : "?"}s
`.trimEnd(),
);

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
${project.status === "claude_working" ? "\nHe pressed Done. Render the final: npm run video:final" : ""}
`.trimEnd(),
  );
} else {
  console.log(`\n${pending.length} round(s) to answer:\n`);
  for (const round of pending) {
    console.log(`  Round ${round.round}  (he was watching v${round.onVersion})`);
    for (const comment of round.comments) {
      /**
       * Both timelines are printed on purpose. The client taps on the final
       * timeline, but `trims` are in source seconds, so the source figure is what
       * Claude needs when a comment means "cut this part".
       */
      const sourceSec = Math.max(0, comment.timeSec - introSec);
      console.log(
        `    ${clock(comment.timeSec)} (final ${comment.timeSec.toFixed(2)}s / source ${sourceSec.toFixed(2)}s)  ${comment.text}`,
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
