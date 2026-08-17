import { loadProject } from "@/lib/store";

/**
 * GET /api/v/[token] — the project behind a review link.
 *
 * The token in the path is the whole authorisation: it is 43 random characters and
 * unguessable, so holding it is what grants access. There is no session to
 * establish, which is the point — the client taps a link his phone already has.
 */
export async function GET(
  _request: Request,
  ctx: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await ctx.params;

  try {
    const project = await loadProject(token);
    if (!project) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    return Response.json(project);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[api/v]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
