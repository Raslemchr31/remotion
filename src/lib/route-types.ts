/**
 * Route prop shapes, written out explicitly.
 *
 * Next 16 also generates `PageProps<"/route">` and `RouteContext<"/route">`
 * globals, which are equivalent. These are spelled out instead so the route
 * handlers do not depend on a generated `.next/types` file being present — a
 * fresh clone typechecks before it has ever been built or run.
 *
 * `params` and `searchParams` are Promises and must be awaited.
 */

export type IdParams = { params: Promise<{ id: string }> };

export type SearchParams = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Reads a single-valued query parameter, ignoring repeated keys. */
export function firstValue(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}
