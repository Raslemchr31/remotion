import { get, list, put } from "@vercel/blob";

import {
  deriveStatus,
  doneDocSchema,
  editsDocSchema,
  finalDocSchema,
  roundSchema,
  videoDocSchema,
  type DoneDoc,
  type EditsDoc,
  type FinalDoc,
  type Project,
  type Round,
  type VideoDoc,
} from "./schema";

/**
 * Blob-backed store. No database: one client, a few writes per video, and a JSON
 * document per fact beats a schema migration.
 *
 * Every document is written exactly once and never overwritten — see the note in
 * schema.ts for why that is a correctness requirement rather than a preference.
 * Discovery goes through `list()` and reads through `get({ useCache: false })`,
 * both of which hit the API rather than the CDN and so always reflect the latest
 * write.
 */

const PREFIX = "projects";

export const paths = {
  video: (token: string) => `${PREFIX}/${token}/video.json`,
  edits: (token: string, version: number) => `${PREFIX}/${token}/edits/${version}.json`,
  round: (token: string, round: number) => `${PREFIX}/${token}/rounds/${round}.json`,
  done: (token: string) => `${PREFIX}/${token}/done.json`,
  final: (token: string) => `${PREFIX}/${token}/final.json`,
  sourceVideo: (token: string) => `${PREFIX}/${token}/source.mp4`,
  finalVideo: (token: string, version: number) => `${PREFIX}/${token}/final-v${version}.mp4`,
};

async function putJson(pathname: string, data: unknown): Promise<void> {
  await put(pathname, JSON.stringify(data, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: false,
  });
}

async function readJson<T>(pathname: string, parse: (v: unknown) => T): Promise<T | undefined> {
  const result = await get(pathname, { access: "public", useCache: false });
  if (!result || result.statusCode !== 200) return undefined;
  return parse(JSON.parse(await new Response(result.stream).text()));
}

async function listPrefix(prefix: string): Promise<string[]> {
  const pathnames: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    pathnames.push(...page.blobs.map((b) => b.pathname));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return pathnames;
}

/* -------------------------------------------------------------------------- */
/*  Writes                                                                    */
/* -------------------------------------------------------------------------- */

export async function createVideo(doc: VideoDoc): Promise<void> {
  await putJson(paths.video(doc.token), videoDocSchema.parse(doc));
}

/** Claude's write. A version collision throws rather than losing a version. */
export async function putEdits(token: string, doc: EditsDoc): Promise<void> {
  const parsed = editsDocSchema.parse(doc);
  await putJson(paths.edits(token, parsed.version), parsed);
}

export async function putRound(token: string, doc: Round): Promise<void> {
  const parsed = roundSchema.parse(doc);
  await putJson(paths.round(token, parsed.round), parsed);
}

export async function putDone(token: string, doc: DoneDoc): Promise<void> {
  await putJson(paths.done(token), doneDocSchema.parse(doc));
}

export async function putFinal(token: string, doc: FinalDoc): Promise<void> {
  await putJson(paths.final(token), finalDocSchema.parse(doc));
}

/** Uploads a video file. Re-running a render should replace its own output. */
export async function putVideoFile(
  pathname: string,
  body: Parameters<typeof put>[1],
): Promise<string> {
  const { url } = await put(pathname, body, {
    access: "public",
    contentType: "video/mp4",
    addRandomSuffix: false,
    allowOverwrite: true,
    multipart: true,
    // These files never change once written, so cache them for a year: the
    // client's phone re-fetches the source on every review round.
    cacheControlMaxAge: 60 * 60 * 24 * 365,
  });
  return url;
}

/* -------------------------------------------------------------------------- */
/*  Reads                                                                     */
/* -------------------------------------------------------------------------- */

const numbersUnder = (pathnames: string[], pattern: RegExp): number[] =>
  pathnames
    .map((p) => pattern.exec(p))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);

export async function loadProject(token: string): Promise<Project | undefined> {
  const pathnames = await listPrefix(`${PREFIX}/${token}/`);
  if (!pathnames.includes(paths.video(token))) return undefined;

  const latestVersion = numbersUnder(pathnames, /\/edits\/(\d+)\.json$/).at(-1);
  const roundNumbers = numbersUnder(pathnames, /\/rounds\/(\d+)\.json$/);

  const [video, editsDoc, done, final, rounds] = await Promise.all([
    readJson(paths.video(token), (v) => videoDocSchema.parse(v)),
    latestVersion
      ? readJson(paths.edits(token, latestVersion), (v) => editsDocSchema.parse(v))
      : undefined,
    pathnames.includes(paths.done(token))
      ? readJson(paths.done(token), (v) => doneDocSchema.parse(v))
      : undefined,
    pathnames.includes(paths.final(token))
      ? readJson(paths.final(token), (v) => finalDocSchema.parse(v))
      : undefined,
    Promise.all(roundNumbers.map((n) => readJson(paths.round(token, n), (v) => roundSchema.parse(v)))),
  ]);

  if (!video) return undefined;
  const presentRounds = rounds.filter((r): r is Round => r !== undefined);

  return {
    token,
    title: video.title,
    brief: video.brief,
    createdAt: video.createdAt,
    status: deriveStatus({ editsDoc, rounds: presentRounds, done, final }),
    video,
    edits: editsDoc?.edits,
    version: editsDoc?.version,
    answeredRounds: editsDoc?.answeredRounds ?? 0,
    note: editsDoc?.note,
    rounds: presentRounds,
    awaitingFinal: Boolean(done) && !final,
    finalUrl: final?.url,
    finalVersion: final?.version,
  };
}

/**
 * The most recently created project.
 *
 * This is what lets Claude work without tracking an id: the client says "I left
 * comments" and Claude asks for the newest project, which is the one they were
 * just discussing.
 */
export async function latestProject(): Promise<Project | undefined> {
  const pathnames = await listPrefix(`${PREFIX}/`);
  const tokens = pathnames
    .map((p) => /^projects\/([^/]+)\/video\.json$/.exec(p))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => m[1]);

  const projects = await Promise.all([...new Set(tokens)].map((t) => loadProject(t)));
  return projects
    .filter((p): p is Project => p !== undefined)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}
