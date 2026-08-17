import { z } from "zod";

/**
 * The edits schema is the single contract between three consumers:
 *   1. Claude, which writes edits JSON via POST /api/projects/[id]/edits
 *   2. @remotion/player on the review page (instant preview)
 *   3. `npx remotion render` in CI (final MP4)
 *
 * Anything not expressible here cannot be edited. Widening this schema is the
 * intended way to add editing capability.
 */

export const POSITIONS = [
  "top-left",
  "top-center",
  "top-right",
  "center-left",
  "center",
  "center-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const;

export const positionSchema = z.enum(POSITIONS);
export type Position = z.infer<typeof positionSchema>;

/** Hex colour, 3 or 6 digits, leading #. */
export const colorSchema = z
  .string()
  .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "must be a hex colour like #1a1a1a");

export const animationSchema = z.enum(["none", "fade", "slide-up", "slide-down", "pop"]);
export type Animation = z.infer<typeof animationSchema>;

/**
 * Absolute https URL (Vercel Blob, in production) or a root-relative path
 * (`staticFile("sample.mp4")`, used by Remotion Studio and the CI render smoke
 * test so neither needs a real upload or network access).
 */
export const mediaSourceSchema = z
  .string()
  .refine((v) => /^https?:\/\//.test(v) || v.startsWith("/"), {
    message: "must be an absolute http(s) URL or a root-relative /path",
  });

/**
 * A keep-range of the source video, in source-video seconds. Trims are applied
 * in array order and concatenated, so reordering the array reorders the video.
 */
export const trimSchema = z
  .object({
    fromSec: z.number().min(0),
    toSec: z.number().min(0),
  })
  .refine((t) => t.toSec > t.fromSec, {
    message: "toSec must be greater than fromSec",
  });
export type Trim = z.infer<typeof trimSchema>;

/**
 * Burned-in subtitle. Times are on the FINAL timeline (after trims, after the
 * intro card), which is what the client sees and comments on.
 */
export const captionSchema = z
  .object({
    startSec: z.number().min(0),
    endSec: z.number().min(0),
    text: z.string().min(1),
  })
  .refine((c) => c.endSec > c.startSec, {
    message: "endSec must be greater than startSec",
  });
export type Caption = z.infer<typeof captionSchema>;

export const captionStyleSchema = z.object({
  fontSizePx: z.number().min(8).max(200).default(48),
  color: colorSchema.default("#ffffff"),
  backgroundColor: colorSchema.default("#000000"),
  backgroundOpacity: z.number().min(0).max(1).default(0.6),
  position: positionSchema.default("bottom-center"),
  /** Distance from the frame edge, as a fraction of frame height. */
  marginPct: z.number().min(0).max(0.4).default(0.08),
  uppercase: z.boolean().default(false),
});
export type CaptionStyle = z.infer<typeof captionStyleSchema>;

/** A timed text or image layer on the FINAL timeline. */
export const overlaySchema = z
  .object({
    startSec: z.number().min(0),
    endSec: z.number().min(0),
    kind: z.enum(["text", "image"]),
    /** Required when kind === "text". */
    text: z.string().optional(),
    /** Required when kind === "image". Absolute https URL. */
    imageUrl: mediaSourceSchema.optional(),
    position: positionSchema.default("center"),
    /** Text only. */
    fontSizePx: z.number().min(8).max(400).default(64),
    color: colorSchema.default("#ffffff"),
    backgroundColor: colorSchema.optional(),
    /** Image only: width as a fraction of frame width. */
    widthPct: z.number().min(0.01).max(1).default(0.3),
    opacity: z.number().min(0).max(1).default(1),
    animation: animationSchema.default("fade"),
    rotationDeg: z.number().min(-180).max(180).default(0),
  })
  .refine((o) => o.endSec > o.startSec, {
    message: "endSec must be greater than startSec",
  })
  .refine((o) => (o.kind === "text" ? Boolean(o.text) : true), {
    message: 'text is required when kind is "text"',
  })
  .refine((o) => (o.kind === "image" ? Boolean(o.imageUrl) : true), {
    message: 'imageUrl is required when kind is "image"',
  });
export type Overlay = z.infer<typeof overlaySchema>;

/** Persistent watermark. Absent means no logo. */
export const logoSchema = z.object({
  imageUrl: mediaSourceSchema,
  position: positionSchema.default("top-right"),
  widthPct: z.number().min(0.01).max(0.5).default(0.12),
  opacity: z.number().min(0).max(1).default(0.9),
  marginPct: z.number().min(0).max(0.3).default(0.04),
  /** Omit both to show for the whole video. Times are on the FINAL timeline. */
  fromSec: z.number().min(0).optional(),
  toSec: z.number().min(0).optional(),
});
export type Logo = z.infer<typeof logoSchema>;

/** Branded full-frame card used for intro and outro. */
export const cardSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  durationSec: z.number().min(0.3).max(15).default(2),
  /** Omit to use theme.primaryColor. */
  backgroundColor: colorSchema.optional(),
  textColor: colorSchema.optional(),
  logoUrl: mediaSourceSchema.optional(),
});
export type Card = z.infer<typeof cardSchema>;

export const themeSchema = z.object({
  primaryColor: colorSchema.default("#0f172a"),
  secondaryColor: colorSchema.default("#38bdf8"),
  textColor: colorSchema.default("#ffffff"),
  /** Must be one of FONT_FAMILIES; all listed families cover Arabic + Latin. */
  fontFamily: z.enum(["Cairo", "Almarai", "Tajawal", "NotoSansArabic"]).default("Cairo"),
  direction: z.enum(["rtl", "ltr"]).default("rtl"),
});
export type Theme = z.infer<typeof themeSchema>;

/**
 * The full prop payload for the MainVideo composition.
 *
 * `sourceDurationSec`, `fps`, `width` and `height` are measured once by the
 * normalization workflow (ffprobe) and must not be invented by hand: the render
 * and the preview both derive their timeline from them.
 */
export const editsSchema = z.object({
  /** Normalized H.264 video. */
  sourceUrl: mediaSourceSchema,
  sourceDurationSec: z.number().min(0.1),
  fps: z.number().min(1).max(120),
  width: z.number().int().min(16),
  height: z.number().int().min(16),

  trims: z.array(trimSchema).default([]),
  captions: z.array(captionSchema).default([]),
  // zod 4 wants a fully-formed output object here, not a partial, so let each
  // nested schema fill in its own field defaults once at module load.
  captionStyle: captionStyleSchema.default(captionStyleSchema.parse({})),
  overlays: z.array(overlaySchema).default([]),
  logo: logoSchema.optional(),
  intro: cardSchema.optional(),
  outro: cardSchema.optional(),
  theme: themeSchema.default(themeSchema.parse({})),
  /** Mute the source audio (e.g. when a card covers a noisy opening). */
  muteSource: z.boolean().default(false),
});
export type Edits = z.infer<typeof editsSchema>;


/* -------------------------------------------------------------------------- */
/*  Project                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A project lives at projects/{token}/ as a handful of write-once JSON documents:
 *
 *   video.json         the transcoded source plus its measurements
 *   edits/{n}.json     one per version, written by Claude
 *   rounds/{n}.json    one per Submit press, written by the client
 *   done.json          written when the client says he is happy
 *   final.json         the rendered MP4, written by Claude
 *
 * Nothing is ever overwritten. That is not tidiness: Vercel Blob cannot cache for
 * less than 60 seconds, so a mutable document at a stable path can serve a minute
 * of stale reads — long enough for the client to refresh and still see the old
 * cut. Immutable documents plus list() for discovery makes every read correct.
 *
 * `token` is the whole security model. It is 43 random characters, it is the only
 * thing in the client's link, and holding it is what authorises watching,
 * commenting and downloading. There is no login, which is the point: the client
 * taps a link his phone already has.
 */

/** projects/{token}/video.json — written once, when the project is published. */
export const videoDocSchema = z.object({
  token: z.string().min(20),
  title: z.string(),
  /** What the client asked for in chat. Kept so Claude can re-read it later. */
  brief: z.string().default(""),
  createdAt: z.string(),
  /** Browser-playable H.264/AAC transcode of whatever the phone produced. */
  sourceUrl: z.string().url(),
  originalFilename: z.string(),
  /** Measured by ffprobe. Every timeline calculation derives from these. */
  durationSec: z.number().min(0.1),
  fps: z.number().min(1).max(120),
  width: z.number().int().min(16),
  height: z.number().int().min(16),
});
export type VideoDoc = z.infer<typeof videoDocSchema>;

/** projects/{token}/edits/{n}.json — Claude's write. */
export const editsDocSchema = z.object({
  version: z.number().int().min(1),
  edits: editsSchema,
  /**
   * Highest round these edits take into account. This is how the client's page
   * knows whether Claude has caught up, without either side writing to the
   * other's documents.
   */
  answeredRounds: z.number().int().min(0).default(0),
  /** One line for the client, in his language, saying what changed. */
  note: z.string().optional(),
  postedAt: z.string(),
});
export type EditsDoc = z.infer<typeof editsDocSchema>;

export const commentSchema = z.object({
  id: z.string(),
  /** Where the client tapped, in seconds on the FINAL timeline. */
  timeSec: z.number().min(0),
  text: z.string().min(1),
});
export type Comment = z.infer<typeof commentSchema>;

/** projects/{token}/rounds/{n}.json — one Submit press. Immutable. */
export const roundSchema = z.object({
  round: z.number().int().min(1),
  submittedAt: z.string(),
  /** The version the client was watching when he wrote these. */
  onVersion: z.number().int().min(1),
  comments: z.array(commentSchema).min(1),
});
export type Round = z.infer<typeof roundSchema>;

/** projects/{token}/done.json — the client is happy; render the final. */
export const doneDocSchema = z.object({
  doneAt: z.string(),
  version: z.number().int().min(1),
});
export type DoneDoc = z.infer<typeof doneDocSchema>;

/** projects/{token}/final.json — the rendered MP4 the client downloads. */
export const finalDocSchema = z.object({
  url: z.string().url(),
  version: z.number().int().min(1),
  renderedAt: z.string(),
});
export type FinalDoc = z.infer<typeof finalDocSchema>;

/**
 * Four states, derived from which documents exist rather than stored, so Claude
 * and the client can never disagree about whose turn it is.
 *
 *   preparing      no edits yet — Claude has not posted a cut
 *   ready          a cut is up; the client's turn to watch and comment
 *   claude_working the client submitted comments Claude has not answered,
 *                  or he pressed Done and the final is not rendered yet
 *   done           the final MP4 exists; the download works
 */
export const projectStatusSchema = z.enum(["preparing", "ready", "claude_working", "done"]);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

export function deriveStatus(parts: {
  editsDoc?: EditsDoc;
  rounds: Round[];
  done?: DoneDoc;
  final?: FinalDoc;
}): ProjectStatus {
  if (parts.final) return "done";
  if (!parts.editsDoc) return "preparing";
  if (parts.done) return "claude_working";
  const latestRound = parts.rounds.reduce((max, r) => Math.max(max, r.round), 0);
  return latestRound > parts.editsDoc.answeredRounds ? "claude_working" : "ready";
}

/** Everything the review page and Claude's scripts need, assembled. */
export type Project = {
  token: string;
  title: string;
  brief: string;
  createdAt: string;
  status: ProjectStatus;
  video: VideoDoc;
  edits?: Edits;
  version?: number;
  answeredRounds: number;
  note?: string;
  rounds: Round[];
  /**
   * He pressed Done and the final is not rendered yet.
   *
   * Distinct from `status`, which collapses "waiting for an edit" and "waiting for
   * the final render" into one claude_working value. The page has to tell those
   * apart: offering "add a comment" to someone who just said he is happy is
   * contradictory, and it would put a second Done button next to the message
   * telling him he is already done.
   */
  awaitingFinal: boolean;
  finalUrl?: string;
  finalVersion?: number;
};

/** Rounds Claude has not answered yet — the only ones it needs to act on. */
export function unansweredRounds(project: Project): Round[] {
  return project.rounds.filter((r) => r.round > project.answeredRounds);
}

/* -------------------------------------------------------------------------- */
/*  Timeline maths — shared by the composition, the player and the render      */
/* -------------------------------------------------------------------------- */

export const secToFrames = (sec: number, fps: number) => Math.round(sec * fps);

/** Seconds of source kept after trims. No trims means the whole video. */
export function trimmedDurationSec(edits: Pick<Edits, "trims" | "sourceDurationSec">): number {
  if (edits.trims.length === 0) return edits.sourceDurationSec;
  return edits.trims.reduce(
    (total, t) => total + (Math.min(t.toSec, edits.sourceDurationSec) - t.fromSec),
    0,
  );
}

/** Length of the finished video: intro card + trimmed body + outro card. */
export function finalDurationSec(edits: Edits): number {
  return (
    (edits.intro?.durationSec ?? 0) + trimmedDurationSec(edits) + (edits.outro?.durationSec ?? 0)
  );
}

export function finalDurationInFrames(edits: Edits): number {
  // Never emit zero or a negative duration: Remotion rejects those outright.
  return Math.max(1, secToFrames(finalDurationSec(edits), edits.fps));
}

/**
 * Second on the final timeline where the video body starts. Comment timestamps are
 * on the final timeline, so this is the offset needed to translate one back to a
 * source-video time — which is what `trims` are expressed in.
 */
export const bodyStartSec = (edits: Edits): number => edits.intro?.durationSec ?? 0;

/* -------------------------------------------------------------------------- */
/*  Intake — how a video gets in                                              */
/* -------------------------------------------------------------------------- */

/**
 * A video the client has sent but Claude has not turned into a project yet.
 *
 * This exists because Claude Code on a phone caps chat attachments at 30 MB, which
 * no real phone video respects. So the phone uploads straight to Blob from a
 * bookmarked page and Claude collects it from storage afterwards — the file never
 * travels through the chat or through a serverless function.
 *
 *   intake/{code}.json           written by the send page
 *   intake/{code}.consumed.json  written by Claude once it has published a project
 *
 * Pending means the first exists and the second does not. Nothing is mutated, so an
 * ingest that dies halfway simply leaves the upload pending and retryable.
 */

/**
 * Six characters the client can read off his screen and say out loud. No vowels (so
 * it cannot spell anything), and no 0/O/1/I/L to misread.
 */
export const INTAKE_CODE_ALPHABET = "23456789BCDFGHJKMNPQRSTVWXYZ";

export const intakeSchema = z.object({
  code: z.string().min(4).max(12),
  uploadedAt: z.string(),
  url: z.string().url(),
  filename: z.string(),
  sizeBytes: z.number().int().min(1),
});
export type Intake = z.infer<typeof intakeSchema>;

export const intakeConsumedSchema = z.object({
  consumedAt: z.string(),
  /** The project token this upload became. */
  projectToken: z.string(),
});
export type IntakeConsumed = z.infer<typeof intakeConsumedSchema>;
