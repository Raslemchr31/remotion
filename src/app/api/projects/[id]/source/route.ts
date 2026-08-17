import { json, parseBody, requireWriteKey, serverError } from "@/lib/api";
import type { IdParams } from "@/lib/route-types";
import { sourceDocSchema } from "@/lib/schema";
import { putSource } from "@/lib/store";

/**
 * POST /api/projects/[id]/source — the normalize workflow reporting back.
 *
 * Either the transcode succeeded, in which case this carries the browser-safe
 * URL plus the ffprobe measurements every later timeline calculation depends on,
 * or it failed, in which case `error` moves the project to status "error" and
 * the review page tells the client to re-upload.
 */
export async function POST(
  request: Request,
  ctx: IdParams,
): Promise<Response> {
  const denied = requireWriteKey(request);
  if (denied) return denied;

  const { id } = await ctx.params;
  const parsed = await parseBody(request, (v) => sourceDocSchema.parse(v));
  if ("response" in parsed) return parsed.response;

  try {
    await putSource(id, parsed.data);
    return json({ ok: true }, 201);
  } catch (error) {
    return serverError(error);
  }
}
