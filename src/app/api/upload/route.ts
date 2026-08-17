import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";

import { fail, serverError } from "@/lib/api";
import { isValidReviewKey } from "@/lib/auth";

/**
 * Issues a short-lived client token so the phone uploads straight to Blob
 * storage. The file never passes through this function: Vercel caps a serverless
 * request body around 4.5 MB, which no phone video respects.
 *
 * `onUploadCompleted` is deliberately unused. It requires a publicly reachable
 * URL and so never fires against localhost, which would make the upload flow
 * untestable locally. Instead the browser calls POST /api/projects with the
 * resulting blob URL once `upload()` resolves — one extra request, and it
 * behaves identically in dev and production.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as HandleUploadBody;

    const result = await handleUpload({
      request,
      body,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        // The review key travels in clientPayload because the SDK does not send
        // the page's query string with the token request.
        if (!isValidReviewKey(clientPayload)) {
          throw new Error("Invalid or missing review key");
        }
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
          maximumSizeInBytes: 1024 * 1024 * 1024, // 1 GB
          addRandomSuffix: false,
          allowOverwrite: true,
          // The token defaults to expiring in one hour, which a 1 GB upload over
          // Algerian mobile data can plausibly outlast — and it would die
          // mid-transfer with nothing to retry from.
          validUntil: Date.now() + 6 * 60 * 60 * 1000,
        };
      },
      onUploadCompleted: async () => {
        // Intentionally empty; see the note above.
      },
    });

    return Response.json(result);
  } catch (error) {
    // A rejected token request is a client problem (bad key, wrong type, too
    // large), not a server fault, so answer 400 and let the UI show the reason.
    if (error instanceof Error) return fail(error.message, 400);
    return serverError(error);
  }
}
