import { fail, json, requireReadAccess, serverError } from "@/lib/api";
import type { IdParams } from "@/lib/route-types";
import { loadProject } from "@/lib/store";

/**
 * GET /api/projects/[id] — the assembled project with derived status.
 *
 * This is the endpoint Claude polls: `status` tells it whose turn it is, and
 * `rounds` versus `answeredRounds` tells it exactly which comments it has yet to
 * apply.
 */
export async function GET(
  request: Request,
  ctx: IdParams,
): Promise<Response> {
  const denied = requireReadAccess(request);
  if (denied) return denied;

  const { id } = await ctx.params;

  try {
    const project = await loadProject(id);
    if (!project) return fail("Project not found", 404);
    return json(project);
  } catch (error) {
    return serverError(error);
  }
}
