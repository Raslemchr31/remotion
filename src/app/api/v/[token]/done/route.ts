import { loadProject, putDone } from "@/lib/store";

/**
 * POST /api/v/[token]/done — the client is happy with what he is watching.
 *
 * Records which version he approved and nothing more. Claude renders that version
 * when it next checks in, and the download appears on his page. Approving does not
 * kick off a render directly because the render runs wherever Claude is, not here:
 * a Vercel function cannot hold a multi-minute Remotion render open.
 */
export async function POST(
  _request: Request,
  ctx: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await ctx.params;

  try {
    const project = await loadProject(token);
    if (!project) return Response.json({ error: "Not found" }, { status: 404 });
    if (!project.version) {
      return Response.json({ error: "There is no version to approve yet" }, { status: 409 });
    }
    if (project.status === "done") {
      return Response.json({ error: "Already finished" }, { status: 409 });
    }

    await putDone(token, { doneAt: new Date().toISOString(), version: project.version });
    return Response.json({ version: project.version }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // A second press is a duplicate write, not a failure the client should see.
    if (/already exists|conflict/i.test(message)) {
      return Response.json({ ok: true }, { status: 200 });
    }
    console.error("[api/v/done]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
