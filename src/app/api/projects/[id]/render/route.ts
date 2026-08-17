import { json, parseBody, requireWriteKey, serverError } from "@/lib/api";
import type { IdParams } from "@/lib/route-types";
import { renderDocSchema } from "@/lib/schema";
import { putRender } from "@/lib/store";

/**
 * POST /api/projects/[id]/render — the render workflow reporting back.
 *
 * A `renderUrl` moves the project to "done" and puts a download button on the
 * review page; an `error` moves it to "render_failed" so the client can approve
 * again once the cause is fixed.
 */
export async function POST(
  request: Request,
  ctx: IdParams,
): Promise<Response> {
  const denied = requireWriteKey(request);
  if (denied) return denied;

  const { id } = await ctx.params;
  const parsed = await parseBody(request, (v) => renderDocSchema.parse(v));
  if ("response" in parsed) return parsed.response;

  try {
    await putRender(id, parsed.data);
    return json({ ok: true }, 201);
  } catch (error) {
    return serverError(error);
  }
}
