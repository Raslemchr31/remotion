import { fail, json, requireReviewKey, serverError } from "@/lib/api";
import type { IdParams } from "@/lib/route-types";
import { dispatchWorkflow } from "@/lib/github";
import { loadProject, putApproval } from "@/lib/store";

/**
 * POST /api/projects/[id]/approve — the client is happy with what he sees.
 *
 * Writes approved.json (which derives status "rendering") and dispatches the
 * render workflow. The workflow re-reads the project itself, so the version it
 * renders is the one recorded here.
 */
export async function POST(
  request: Request,
  ctx: IdParams,
): Promise<Response> {
  const denied = requireReviewKey(request);
  if (denied) return denied;

  const { id } = await ctx.params;

  try {
    const project = await loadProject(id);
    if (!project) return fail("Project not found", 404);
    if (!project.editsVersion) return fail("Nothing to render: no edits posted yet", 409);
    if (project.status === "rendering" || project.status === "done") {
      return fail(`Already ${project.status}`, 409);
    }

    // Dispatch first, record second. approved.json is what derives the
    // "rendering" status, so writing it before a dispatch that then fails would
    // strand the project in a state with no render running and no way back to
    // in_review. This order fails cleanly and lets the client press Approve again.
    await dispatchWorkflow("render.yml", {
      projectId: id,
      version: String(project.editsVersion),
    });

    await putApproval(id, {
      approvedAt: new Date().toISOString(),
      version: project.editsVersion,
    });

    return json({ status: "rendering", version: project.editsVersion }, 201);
  } catch (error) {
    return serverError(error);
  }
}
