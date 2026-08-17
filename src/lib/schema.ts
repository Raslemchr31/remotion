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
  /** Bumped by the server on every accepted edits POST. */
  version: z.number().int().min(1).default(1),
  /** Normalized H.264 video. */
  sourceUrl: mediaSourceSchema,
  sourceDurationSec: z.number().min(0.1),
  fps: z.number().min(1).max(120),
  width: z.number().int().min(16),
  height: z.number().int().min(16),

  trims: z.array(trimSchema).default([]),
  captions: z.array(captionSchema).default([]),
  captionStyle: captionStyleSchema.default({}),
  overlays: z.array(overlaySchema).default([]),
  logo: logoSchema.optional(),
  intro: cardSchema.optional(),
  outro: cardSchema.optional(),
  theme: themeSchema.default({}),
  /** Mute the source audio (e.g. when a card covers a noisy opening). */
  muteSource: z.boolean().default(false),
});
export type Edits = z.infer<typeof editsSchema>;

/* -------------------------------------------------------------------------- */
/*  Project record                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Status machine:
 *
 *   normalizing -> awaiting_first_edit -> in_review <-> awaiting_edits
 *        |                                    |
 *        v                                    v
 *      error                              approved -> rendering -> done
 *                                                         |
 *                                                         v
 *                                                    render_failed
 *
 * in_review and awaiting_edits alternate for as many rounds as the client wants:
 * Submit moves in_review -> awaiting_edits, and Claude posting edits moves it
 * back. Approve is the only exit.
 */
export const projectStatusSchema = z.enum([
  "normalizing",
  "awaiting_first_edit",
  "in_review",
  "awaiting_edits",
  "approved",
  "rendering",
  "done",
  "render_failed",
  "error",
]);
export type ProjectStatus = z.infer<typeof projectStatusSchema>;

export const commentSchema = z.object({
  id: z.string(),
  /** Position on the FINAL timeline, in seconds. */
  timeSec: z.number().min(0),
  text: z.string().min(1),
});
export type Comment = z.infer<typeof commentSchema>;

/** One Submit press by the client. Immutable once submitted. */
export const commentRoundSchema = z.object({
  round: z.number().int().min(1),
  submittedAt: z.string(),
  comments: z.array(commentSchema),
  /** Set when Claude posts the edits that answer this round. */
  appliedAt: z.string().optional(),
  /** The edits version that answered this round. */
  appliedInVersion: z.number().int().optional(),
  /** Claude's short note back to the client about what it changed. */
  responseNote: z.string().optional(),
});
export type CommentRound = z.infer<typeof commentRoundSchema>;

export const projectSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  status: projectStatusSchema,
  /** What the client typed on the upload screen. Claude's first instruction. */
  brief: z.string().default(""),
  /** Raw phone upload, before transcoding. */
  originalUrl: z.string().url().optional(),
  originalFilename: z.string().optional(),
  /** Browser-safe H.264 transcode. Absent until normalization finishes. */
  normalizedUrl: z.string().url().optional(),
  /** Probed from the normalized file by ffprobe in CI. */
  probe: z
    .object({
      durationSec: z.number(),
      fps: z.number(),
      width: z.number().int(),
      height: z.number().int(),
    })
    .optional(),
  /** Absent until Claude posts the first edits. */
  edits: editsSchema.optional(),
  rounds: z.array(commentRoundSchema).default([]),
  /** Final rendered MP4. */
  renderUrl: z.string().url().optional(),
  renderedVersion: z.number().int().optional(),
  /** Populated on status "error" or "render_failed". */
  errorMessage: z.string().optional(),
});
export type Project = z.infer<typeof projectSchema>;

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

