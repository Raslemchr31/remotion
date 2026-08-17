import { randomInt, timingSafeEqual } from "node:crypto";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

import { INTAKE_CODE_ALPHABET } from "@/lib/schema";
import { loadIntake, putIntake } from "@/lib/store";

/**
 * Lets the phone put a video straight into Blob storage.
 *
 * Needed because Claude Code on a phone caps a chat attachment at 30 MB, which no
 * real phone video respects. The file also cannot be proxied through this function:
 * Vercel caps a serverless request body at 4.5 MB. So the browser uploads directly
 * and this route only issues the token and records the result.
 *
 * `onUploadCompleted` is unused — it needs a publicly reachable URL and so never
 * fires on localhost, which would make this untestable locally. The page calls PUT
 * once its upload resolves instead.
 */

function keyMatches(candidate: string | null | undefined): boolean {
  const expected = process.env.INTAKE_KEY;
  if (!expected) throw new Error("INTAKE_KEY is not set on the server");
  if (!candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch; a key's length is not secret.
  return a.length === b.length && timingSafeEqual(a, b);
}

/** A short code the client can read off his screen and type to Claude. */
async function freeCode(): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    let code = "";
    for (let i = 0; i < 6; i += 1) {
      code += INTAKE_CODE_ALPHABET[randomInt(INTAKE_CODE_ALPHABET.length)];
    }
    if (!(await loadIntake(code))) return code;
  }
  throw new Error("Could not allocate an unused code");
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as HandleUploadBody;

    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        // The key rides in clientPayload: the SDK does not forward the page's query
        // string with its token request.
        if (!keyMatches(clientPayload)) throw new Error("This send link is not valid");
        return {
          allowedContentTypes: [
            "video/mp4",
            "video/quicktime",
            "video/x-matroska",
            "video/webm",
            "video/x-msvideo",
            "video/3gpp",
            "video/mpeg",
          ],
          maximumSizeInBytes: 2 * 1024 * 1024 * 1024,
          addRandomSuffix: false,
          allowOverwrite: true,
          // The default is one hour, which a large upload over mobile data can
          // outlast — and it would die mid-transfer with nothing to resume from.
          validUntil: Date.now() + 6 * 60 * 60 * 1000,
        };
      },
      onUploadCompleted: async () => {
        // Intentionally empty; see the note above.
      },
    });

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 400 });
  }
}

/** Records a finished upload and returns the code. Called by the send page. */
export async function PUT(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as {
      key?: string;
      url?: string;
      filename?: string;
      sizeBytes?: number;
    };

    if (!keyMatches(body.key)) {
      return Response.json({ error: "This send link is not valid" }, { status: 401 });
    }
    if (!body.url || !body.filename || !body.sizeBytes) {
      return Response.json({ error: "url, filename and sizeBytes are required" }, { status: 400 });
    }

    const code = await freeCode();
    await putIntake({
      code,
      uploadedAt: new Date().toISOString(),
      url: body.url,
      filename: body.filename,
      sizeBytes: body.sizeBytes,
    });

    return Response.json({ code }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[api/intake]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
