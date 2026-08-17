import { get, list, put } from "@vercel/blob";

import {
  approvalDocSchema,
  commentRoundSchema,
  deriveStatus,
  editsDocSchema,
  recordDocSchema,
  renderDocSchema,
  sourceDocSchema,
  type ApprovalDoc,
  type CommentRound,
  type EditsDoc,
  type Project,
  type RecordDoc,
  type RenderDoc,
  type SourceDoc,
} from "./schema";

/**
 * Blob-backed project store. No database: one client, a handful of writes per
 * video, and a JSON document per fact is easier to reason about than a schema
 * migration.
 *
 * EVERY DOCUMENT IS WRITTEN EXACTLY ONCE AND NEVER OVERWRITTEN.
 *
 * That rule is not stylistic. Vercel Blob's `cacheControlMaxAge` cannot be set
 * below 60 seconds (it defaults to a month), so a mutable record at a stable
 * pathname can serve up to a minute of stale content from the CDN after an
 * overwrite. In a loop where Claude posts edits and the client's phone must see
 * them immediately, a stale read is a correctness bug. Immutable documents make
 * every cached response correct by construction: discovery goes through
 * `list()`, which is an API call rather than a CDN read, and the content URLs
 * it returns never change meaning.
 *
 * Versioned edits therefore live at edits/1.json, edits/2.json, ... rather than
 * one edits.json that gets rewritten.
 */

const PREFIX = "projects";

const paths = {
  record: (id: string) => `${PREFIX}/${id}/record.json`,
  source: (id: string) => `${PREFIX}/${id}/source.json`,
  edits: (id: string, version: number) => `${PREFIX}/${id}/edits/${version}.json`,
  round: (id: string, round: number) => `${PREFIX}/${id}/rounds/${round}.json`,
  approval: (id: string) => `${PREFIX}/${id}/approved.json`,
  render: (id: string) => `${PREFIX}/${id}/render.json`,
  original: (id: string, filename: string) => `${PREFIX}/${id}/original/${filename}`,
  normalized: (id: string) => `${PREFIX}/${id}/normalized.mp4`,
  final: (id: string, version: number) => `${PREFIX}/${id}/final-v${version}.mp4`,
};

export const blobPaths = paths;

type BlobEntry = { url: string; pathname: string };

/** Writes a JSON document. Throws if the pathname already exists. */
async function putJson(pathname: string, data: unknown): Promise<string> {
  const { url } = await put(pathname, JSON.stringify(data, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    // Left at the default: these documents are immutable, so a long CDN cache
    // is exactly what we want. Freshness comes from listing, not from re-reading
    // a URL and hoping it changed.
    allowOverwrite: false,
  });
  return url;
}

/**
 * Reads and validates a JSON document by pathname.
 *
 * `useCache: false` reads from origin storage instead of the CDN, which is the
 * only way Vercel Blob guarantees the latest content. Fetching the public URL
 * instead would be wrong here: an overwritten blob can serve stale bytes for up
 * to 60 seconds from the CDN, and for the full cacheControlMaxAge from a
 * browser cache. Documents in this store are immutable, so this is belt and
 * braces — but it also makes the read path correct if that ever changes.
 */
async function readJson<T>(
  pathname: string,
  parse: (value: unknown) => T,
): Promise<T | undefined> {
  const result = await get(pathname, { access: "public", useCache: false });
  if (!result || result.statusCode !== 200) return undefined;
  const text = await new Response(result.stream).text();
  return parse(JSON.parse(text));
}

/**
 * Every blob under a prefix, paginated to completion.
 *
 * Listing is a metadata API call rather than a CDN read, so it always reflects
 * writes immediately. That is what makes "which versions exist?" a safe question
 * to ask, and it is the reason discovery goes through here rather than through
 * a mutable index document.
 */
async function listPrefix(prefix: string): Promise<BlobEntry[]> {
  const entries: BlobEntry[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    entries.push(...page.blobs.map((b) => ({ url: b.url, pathname: b.pathname })));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return entries;
}

/* -------------------------------------------------------------------------- */
/*  Writes — one function per author                                          */
/* -------------------------------------------------------------------------- */

export async function createRecord(doc: RecordDoc): Promise<void> {
  await putJson(paths.record(doc.id), recordDocSchema.parse(doc));
}

export async function putSource(id: string, doc: SourceDoc): Promise<void> {
  await putJson(paths.source(id), sourceDocSchema.parse(doc));
}

/**
 * Claude's write. The version must be the next unused one; a collision means
 * two edits were posted concurrently, and the put throws rather than silently
 * discarding one.
 */
export async function putEdits(id: string, doc: EditsDoc): Promise<void> {
  const parsed = editsDocSchema.parse(doc);
  await putJson(paths.edits(id, parsed.version), parsed);
}

export async function putRound(id: string, doc: CommentRound): Promise<void> {
  const parsed = commentRoundSchema.parse(doc);
  await putJson(paths.round(id, parsed.round), parsed);
}

export async function putApproval(id: string, doc: ApprovalDoc): Promise<void> {
  await putJson(paths.approval(id), approvalDocSchema.parse(doc));
}

export async function putRender(id: string, doc: RenderDoc): Promise<void> {
  await putJson(paths.render(id), renderDocSchema.parse(doc));
}

/** Uploads a rendered or transcoded MP4 from a CI runner. */
export async function putVideo(
  pathname: string,
  body: Buffer | ReadableStream | Blob,
): Promise<string> {
  const { url } = await put(pathname, body, {
    access: "public",
    contentType: "video/mp4",
    addRandomSuffix: false,
    allowOverwrite: true, // A re-run of the same workflow should replace its own output.
    multipart: true,
  });
  return url;
}

/* -------------------------------------------------------------------------- */
/*  Reads                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Assembles a project from its documents and derives its status.
 *
 * Returns undefined when the project has no record.json, which is the only
 * document guaranteed to exist for a real project.
 */
export async function loadProject(id: string): Promise<Project | undefined> {
  const entries = await listPrefix(`${PREFIX}/${id}/`);
  const present = new Set(entries.map((e) => e.pathname));

  if (!present.has(paths.record(id))) return undefined;

  const numbersUnder = (pattern: RegExp): number[] =>
    entries
      .map((e) => pattern.exec(e.pathname))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => Number(m[1]))
      .sort((a, b) => a - b);

  const latestVersion = numbersUnder(/\/edits\/(\d+)\.json$/).at(-1);
  const roundNumbers = numbersUnder(/\/rounds\/(\d+)\.json$/);

  const [record, source, editsDoc, approval, render, rounds] = await Promise.all([
    readJson(paths.record(id), (v) => recordDocSchema.parse(v)),
    present.has(paths.source(id))
      ? readJson(paths.source(id), (v) => sourceDocSchema.parse(v))
      : undefined,
    latestVersion
      ? readJson(paths.edits(id, latestVersion), (v) => editsDocSchema.parse(v))
      : undefined,
    present.has(paths.approval(id))
      ? readJson(paths.approval(id), (v) => approvalDocSchema.parse(v))
      : undefined,
    present.has(paths.render(id))
      ? readJson(paths.render(id), (v) => renderDocSchema.parse(v))
      : undefined,
    Promise.all(
      roundNumbers.map((n) => readJson(paths.round(id, n), (v) => commentRoundSchema.parse(v))),
    ),
  ]);

  if (!record) return undefined;
  const presentRounds = rounds.filter((r): r is CommentRound => r !== undefined);

  const status = deriveStatus({
    source,
    editsDoc,
    rounds: presentRounds,
    approval,
    render,
  });

  return {
    ...record,
    status,
    normalizedUrl: source?.normalizedUrl,
    probe: source?.probe,
    edits: editsDoc?.edits,
    editsVersion: editsDoc?.version,
    answeredRounds: editsDoc?.answeredRounds ?? 0,
    claudeNote: editsDoc?.note,
    rounds: presentRounds,
    renderUrl: render?.renderUrl,
    renderedVersion: render?.version,
    errorMessage: status === "error" ? source?.error : render?.error,
  };
}

/** Project ids, newest first. Used by the home screen and by Claude's polling. */
export async function listProjectIds(): Promise<string[]> {
  const entries = await listPrefix(`${PREFIX}/`);
  const ids = entries
    .map((e) => /^projects\/([^/]+)\/record\.json$/.exec(e.pathname))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => m[1]);
  return [...new Set(ids)];
}

/** Summaries for every project, newest first. */
export async function listProjects(): Promise<Project[]> {
  const ids = await listProjectIds();
  const projects = await Promise.all(ids.map((id) => loadProject(id)));
  return projects
    .filter((p): p is Project => p !== undefined)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
