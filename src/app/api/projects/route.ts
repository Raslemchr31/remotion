import { randomUUID } from "node:crypto";
import { z } from "zod";

import { json, parseBody, requireReadAccess, requireReviewKey, serverError } from "@/lib/api";
import { dispatchWorkflow } from "@/lib/github";
import { createRecord, listProjects } from "@/lib/store";

/** GET /api/projects — every project with derived status. */
export async function GET(request: Request): Promise<Response> {
  const denied = requireReadAccess(request);
  if (denied) return denied;

  try {
    return json({ projects: await listProjects() });
  } catch (error) {
    return serverError(error);
  }
}

const createBodySchema = z.object({
  title: z.string().min(1).max(120),
  brief: z.string().max(4000).default(""),
  /** Blob URL returned by the browser's upload() call. */
  originalUrl: z.string().url(),
  originalFilename: z.string().min(1).max(260),
});

/**
 * POST /api/projects — called by the browser once the upload finishes.
 *
 * Creates record.json and kicks off the normalize workflow, which transcodes the
 * phone video to browser-safe H.264 and probes its real duration, fps and
 * dimensions. Everything downstream depends on that probe, so nothing can be
 * previewed until it lands.
 */
export async function POST(request: Request): Promise<Response> {
  const denied = requireReviewKey(request);
  if (denied) return denied;

  const parsed = await parseBody(request, (v) => createBodySchema.parse(v));
  if ("response" in parsed) return parsed.response;

  const id = randomUUID();
  try {
    await createRecord({
      id,
      title: parsed.data.title,
      brief: parsed.data.brief,
      createdAt: new Date().toISOString(),
      originalUrl: parsed.data.originalUrl,
      originalFilename: parsed.data.originalFilename,
    });
  } catch (error) {
    return serverError(error);
  }

  // The record exists, so the project is real and reviewable even if the
  // dispatch fails. Report the failure without discarding the upload.
  try {
    await dispatchWorkflow("normalize.yml", { projectId: id });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ id, warning: `Project created but normalization did not start: ${message}` }, 201);
  }

  return json({ id }, 201);
}
