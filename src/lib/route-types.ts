/**
 * Route prop shapes, written out explicitly.
 *
 * Next 16 supplies `PageProps<"/route">` and `RouteContext<"/route">` as globals,
 * but this project runs Next 15 deliberately: Next 16's static-generation pass
 * crashes while prerendering its own /_global-error and /_not-found routes
 * (vercel/next.js#95741), and the only known workaround disables minification —
 * which the client, reviewing on mobile data, would pay for on every load.
 *
 * `params` and `searchParams` are Promises in both versions, so nothing about the
 * handler bodies changes.
 */

export type IdParams = { params: Promise<{ id: string }> };

export type SearchParams = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Reads a single-valued query parameter, ignoring repeated keys. */
export function firstValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}
