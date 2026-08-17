import { ZodError } from "zod";

import { isValidReviewKey, isValidWriteKey, reviewKeyFrom, writeKeyFrom } from "./auth";

/** JSON response helper. Route handlers are never cached in Next 16, so no cache headers needed. */
export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export function fail(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

/**
 * Client-facing routes: the secret in the review link. Claude's write key is
 * also accepted so a single credential is enough for it to read project state
 * while polling.
 */
export function requireReadAccess(request: Request): Response | null {
  if (isValidReviewKey(reviewKeyFrom(request))) return null;
  if (isValidWriteKey(writeKeyFrom(request))) return null;
  return fail("Invalid or missing key", 401);
}

/** Client-facing writes (create project, submit comments, approve). */
export function requireReviewKey(request: Request): Response | null {
  if (isValidReviewKey(reviewKeyFrom(request))) return null;
  return fail("Invalid or missing key", 401);
}

/** Machine writes: Claude posting edits, GitHub Actions reporting results. */
export function requireWriteKey(request: Request): Response | null {
  if (isValidWriteKey(writeKeyFrom(request))) return null;
  return fail("Invalid or missing x-api-key", 401);
}

/**
 * Parses and validates a JSON body, turning a schema violation into a 400 whose
 * body names the offending fields. Claude reads these messages to self-correct
 * an invalid edits payload, so the detail matters.
 */
export async function parseBody<T>(
  request: Request,
  parse: (value: unknown) => T,
): Promise<{ data: T } | { response: Response }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { response: fail("Body is not valid JSON", 400) };
  }

  try {
    return { data: parse(raw) };
  } catch (error) {
    if (error instanceof ZodError) {
      return {
        response: Response.json(
          {
            error: "Validation failed",
            issues: error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
          },
          { status: 400 },
        ),
      };
    }
    throw error;
  }
}

/** Surfaces the real reason a route blew up instead of an opaque 500. */
export function serverError(error: unknown): Response {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[api]", message);
  return fail(message, 500);
}
