import { z } from "zod";

import { fail, json, parseBody, requireWriteKey, serverError } from "@/lib/api";
import type { IdParams } from "@/lib/route-types";
import { editsSchema, finalDurationSec } from "@/lib/schema";
import { loadProject, putEdits } from "@/lib/store";

/**
 * Claude sends the edits and, optionally, which round it has just answered plus
 * a short note for the client. The version is assigned by the server, not the
 * caller, so two concurrent posts cannot claim the same one.
 */
const editsBodySchema = z.object({
  edits: editsSchema,
  /**
   * Highest comment round these edits take into account. Omitted means "answers
   * every round submitted so far", which is what Claude wants in the normal case.
   */
  answeredRounds: z.number().int().min(0).optional(),
  note: z.string().max(2000).optional(),
});

/**
 * POST /api/projects/[id]/edits — the only write Claude makes.
 *
 * Validates against the same zod schema the composition consumes, so an invalid
 * payload is rejected here with field-level messages rather than surfacing as a
 * broken preview on the client's phone.
 */
export async function POST(
  request: Request,
  ctx: IdParams,
): Promise<Response> {
  const denied = requireWriteKey(request);
  if (denied) return denied;

  const { id } = await ctx.params;
  const parsed = await parseBody(request, (v) => editsBodySchema.parse(v));
  if ("response" in parsed) return parsed.response;

  try {
    const project = await loadProject(id);
    if (!project) return fail("Project not found", 404);
    if (!project.probe || !project.normalizedUrl) {
      return fail("Video is still being normalized; no probe data yet", 409);
    }

    const { edits } = parsed.data;

    // The timeline must match the file that actually exists. Claude works from
    // the probe in the project record, so a mismatch means it guessed.
    if (edits.sourceUrl !== project.normalizedUrl) {
      return fail(
        `edits.sourceUrl must be the normalized video URL for this project (${project.normalizedUrl})`,
        400,
      );
    }
    if (edits.fps !== project.probe.fps) {
      return fail(`edits.fps must be ${project.probe.fps} to match the probed source`, 400);
    }
    if (
      edits.width !== project.probe.width ||
      edits.height !== project.probe.height
    ) {
      return fail(
        `edits dimensions must be ${project.probe.width}x${project.probe.height} to match the probed source`,
        400,
      );
    }

    const overrunning = edits.trims.filter((t) => t.fromSec >= project.probe!.durationSec);
    if (overrunning.length > 0) {
      return fail(
        `a trim starts at or after the end of the source (${project.probe.durationSec}s)`,
        400,
      );
    }

    const latestRound = project.rounds.reduce((max, r) => Math.max(max, r.round), 0);
    const version = (project.editsVersion ?? 0) + 1;

    await putEdits(id, {
      edits,
      version,
      answeredRounds: parsed.data.answeredRounds ?? latestRound,
      note: parsed.data.note,
      postedAt: new Date().toISOString(),
    });

    return json(
      {
        version,
        answeredRounds: parsed.data.answeredRounds ?? latestRound,
        finalDurationSec: Number(finalDurationSec(edits).toFixed(3)),
      },
      201,
    );
  } catch (error) {
    return serverError(error);
  }
}
