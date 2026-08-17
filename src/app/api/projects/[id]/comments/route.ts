import { randomUUID } from "node:crypto";
import { z } from "zod";

import { fail, json, parseBody, requireReviewKey, serverError } from "@/lib/api";
import type { IdParams } from "@/lib/route-types";
import { putRound } from "@/lib/store";
import { loadProject } from "@/lib/store";

const submitBodySchema = z.object({
  comments: z
    .array(
      z.object({
        timeSec: z.number().min(0),
        text: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(200),
});

/**
 * POST /api/projects/[id]/comments — one Submit press.
 *
 * Writes projects/{id}/rounds/{n}.json, which is append-only and owned solely by
 * the client. Claude answers a round by posting edits with a higher
 * `answeredRounds`, so neither writer ever touches the other's documents.
 */
export async function POST(
  request: Request,
  ctx: IdParams,
): Promise<Response> {
  const denied = requireReviewKey(request);
  if (denied) return denied;

  const { id } = await ctx.params;
  const parsed = await parseBody(request, (v) => submitBodySchema.parse(v));
  if ("response" in parsed) return parsed.response;

  try {
    const project = await loadProject(id);
    if (!project) return fail("Project not found", 404);
    if (!project.editsVersion) {
      return fail("There is nothing to comment on yet: no edit has been posted", 409);
    }

    const round = project.rounds.reduce((max, r) => Math.max(max, r.round), 0) + 1;

    await putRound(id, {
      round,
      submittedAt: new Date().toISOString(),
      onVersion: project.editsVersion,
      comments: parsed.data.comments.map((c) => ({ ...c, id: randomUUID() })),
    });

    return json({ round, status: "awaiting_edits" }, 201);
  } catch (error) {
    return serverError(error);
  }
}
