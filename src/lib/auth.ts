import { timingSafeEqual } from "node:crypto";

/**
 * Three secrets, three audiences:
 *
 *   REVIEW_KEY   — in the link the client opens on his phone (?key=...).
 *                  Guards reading and commenting.
 *   AGENT_API_KEY — Claude's write key, sent as x-api-key. Guards posting edits.
 *   CI_API_KEY    — GitHub Actions callback key, sent as x-api-key. Guards
 *                   posting normalization and render results.
 *
 * Deliberately no user accounts: this is a single-client tool behind unguessable
 * secrets, and account plumbing would be the main thing standing between the
 * client and a working phone workflow.
 */

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  // timingSafeEqual throws on length mismatch, so compare lengths first. The
  // length of a secret is not the secret.
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Set it in Vercel project settings and in .env.local.`,
    );
  }
  return value;
}

/** True when the ?key= on a review/upload link matches REVIEW_KEY. */
export function isValidReviewKey(key: string | null | undefined): boolean {
  if (!key) return false;
  return safeEqual(key, requiredEnv("REVIEW_KEY"));
}

/** True when x-api-key matches AGENT_API_KEY (Claude) or CI_API_KEY (Actions). */
export function isValidWriteKey(headerValue: string | null | undefined): boolean {
  if (!headerValue) return false;
  const agent = process.env.AGENT_API_KEY;
  const ci = process.env.CI_API_KEY;
  if (!agent && !ci) {
    throw new Error("Neither AGENT_API_KEY nor CI_API_KEY is set; write routes are unusable.");
  }
  return (
    (Boolean(agent) && safeEqual(headerValue, agent as string)) ||
    (Boolean(ci) && safeEqual(headerValue, ci as string))
  );
}

/** Reads the write key out of a request's headers. */
export function writeKeyFrom(request: Request): string | null {
  return request.headers.get("x-api-key");
}

/** Reads the review key from either the query string or the x-review-key header. */
export function reviewKeyFrom(request: Request): string | null {
  const url = new URL(request.url);
  return url.searchParams.get("key") ?? request.headers.get("x-review-key");
}
