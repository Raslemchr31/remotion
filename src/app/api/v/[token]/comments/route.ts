import { randomUUID } from "node:crypto";
import { z } from "zod";

import { loadProject, putRound } from "@/lib/store";

const bodySchema = z.object({
  comments: z
    .array(z.object({ timeSec: z.number().min(0), text: z.string().min(1).max(2000) }))
    .min(1)
    .max(200),
});

/**
 * POST /api/v/[token]/comments — one Submit press.
 *
 * Writes rounds/{n}.json, which only the client ever writes. Claude answers a round
 * by posting edits with a higher `answeredRounds`, so the two never touch the same
 * document and a submission cannot be lost to a concurrent edit.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await ctx.params;

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return Response.json({ error: "Body is not valid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return Response.json(
      {
        error: "Validation failed",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
      { status: 400 },
    );
  }

  try {
    const project = await loadProject(token);
    if (!project) return Response.json({ error: "Not found" }, { status: 404 });
    if (!project.version) {
      return Response.json({ error: "There is no version to comment on yet" }, { status: 409 });
    }

    const round = project.rounds.reduce((max, r) => Math.max(max, r.round), 0) + 1;
    await putRound(token, {
      round,
      submittedAt: new Date().toISOString(),
      onVersion: project.version,
      comments: parsed.data.comments.map((c) => ({ ...c, id: randomUUID() })),
    });

    return Response.json({ round }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[api/v/comments]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
