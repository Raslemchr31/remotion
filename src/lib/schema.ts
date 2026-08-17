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
/*  Project record                                                            */
/* -------------------------------------------------------------------------- */

/**
 * A project is not one mutable record. It is a set of small documents in Blob
 * storage, each written by exactly one author:
 *
 *   projects/{id}/record.json      created once by the upload route
 *   projects/{id}/source.json      written once by the normalize workflow
 *   projects/{id}/edits.json       written only by Claude
 *   projects/{id}/rounds/{n}.json  written only by the client, append-only
 *   projects/{id}/approved.json    written once by the approve route
 *   projects/{id}/render.json      written once by the render workflow
 *
 * Nothing is ever read-modify-written by two authors, so Claude posting edits
 * while the client is submitting comments cannot lose either write. Status is
 * *derived* from which documents exist (see deriveStatus) rather than stored,
 * which is what removes the last shared mutable field.
 */

export const projectStatusSchema = z.enum([
  "normalizing",
  "awaiting_first_edit",
  "in_review",
  "awaiting_edits",
  "rendering",
  "done",
  "render_failed",
  "error",
]);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

/** projects/{id}/record.json — immutable after the upload completes. */
export const recordDocSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.string(),
  /** What the client typed on the upload screen. Claude's first instruction. */
  brief: z.string().default(""),
  /** Raw phone upload, before transcoding. */
  originalUrl: z.string().url(),
  originalFilename: z.string(),
});
export type RecordDoc = z.infer<typeof recordDocSchema>;

export const probeSchema = z.object({
  durationSec: z.number().min(0.1),
  fps: z.number().min(1).max(120),
  width: z.number().int().min(16),
  height: z.number().int().min(16),
});
export type Probe = z.infer<typeof probeSchema>;

/** projects/{id}/source.json — the normalize workflow's one and only write. */
export const sourceDocSchema = z.object({
  normalizedUrl: z.string().url().optional(),
  probe: probeSchema.optional(),
  normalizedAt: z.string().optional(),
  /** Set instead of the above when ffmpeg could not read the upload. */
  error: z.string().optional(),
});
export type SourceDoc = z.infer<typeof sourceDocSchema>;

/**
 * projects/{id}/edits.json — Claude's write.
 *
 * `answeredRounds` is how the client's page knows whether Claude has caught up:
 * it is the highest round number these edits take into account. Keeping it here
 * rather than stamping the round documents is what keeps the two writers on
 * disjoint paths.
 */
export const editsDocSchema = z.object({
  edits: editsSchema,
  version: z.number().int().min(1),
  answeredRounds: z.number().int().min(0).default(0),
  /** Short message shown to the client, e.g. "raised the price overlay". */
  note: z.string().optional(),
  postedAt: z.string(),
});
export type EditsDoc = z.infer<typeof editsDocSchema>;

export const commentSchema = z.object({
  id: z.string(),
  /** Position on the FINAL timeline, in seconds. */
  timeSec: z.number().min(0),
  text: z.string().min(1),
});
export type Comment = z.infer<typeof commentSchema>;

/** projects/{id}/rounds/{n}.json — one Submit press. Immutable once written. */
export const commentRoundSchema = z.object({
  round: z.number().int().min(1),
  submittedAt: z.string(),
  /** The edits version the client was looking at when he commented. */
  onVersion: z.number().int().min(1),
  comments: z.array(commentSchema).min(1),
});
export type CommentRound = z.infer<typeof commentRoundSchema>;

/** projects/{id}/approved.json — written by the approve route. */
export const approvalDocSchema = z.object({
  approvedAt: z.string(),
  version: z.number().int().min(1),
});
export type ApprovalDoc = z.infer<typeof approvalDocSchema>;

/** projects/{id}/render.json — the render workflow's one and only write. */
export const renderDocSchema = z.object({
  renderUrl: z.string().url().optional(),
  version: z.number().int().optional(),
  renderedAt: z.string().optional(),
  error: z.string().optional(),
});
export type RenderDoc = z.infer<typeof renderDocSchema>;

/** Everything about a project, assembled from its documents for one response. */
export type Project = {
  id: string;
  title: string;
  brief: string;
  createdAt: string;
  originalUrl: string;
  originalFilename: string;
  status: ProjectStatus;
  normalizedUrl?: string;
  probe?: Probe;
  edits?: Edits;
  editsVersion?: number;
  answeredRounds: number;
  claudeNote?: string;
  rounds: CommentRound[];
  renderUrl?: string;
  renderedVersion?: number;
  /** Normalization or render failure text, whichever applies to the status. */
  errorMessage?: string;
};

/**
 * The single definition of "where is this project up to", computed from which
 * documents exist. Both the review page and Claude's polling loop read this, so
 * they can never disagree about whose turn it is.
 */
export function deriveStatus(parts: {
  source?: SourceDoc;
  editsDoc?: EditsDoc;
  rounds: CommentRound[];
  approval?: ApprovalDoc;
  render?: RenderDoc;
}): ProjectStatus {
  if (parts.render?.renderUrl) return "done";
  if (parts.render?.error) return "render_failed";
  if (parts.approval) return "rendering";

  if (!parts.source) return "normalizing";
  if (parts.source.error || !parts.source.normalizedUrl) return "error";

  if (!parts.editsDoc) return "awaiting_first_edit";

  const latestRound = parts.rounds.reduce((max, r) => Math.max(max, r.round), 0);
  return latestRound > parts.editsDoc.answeredRounds ? "awaiting_edits" : "in_review";
}

/* -------------------------------------------------------------------------- */
/*  Timeline maths â€” shared by the composition, the player and the CI render   */
/* -------------------------------------------------------------------------- */

export const secToFrames = (sec: number, fps: number) => Math.round(sec * fps);

/** Total seconds of source kept after trims. No trims means the whole video. */
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
  // Never emit 0 or a negative duration: Remotion rejects those outright.
  return Math.max(1, secToFrames(finalDurationSec(edits), edits.fps));
}

/**
 * Second on the final timeline where the video body starts. Client comment
 * timestamps are on the final timeline, so this is the offset Claude needs to
 * translate a comment time back to a source-video time.
 */
export const bodyStartSec = (edits: Edits): number => edits.intro?.durationSec ?? 0;

