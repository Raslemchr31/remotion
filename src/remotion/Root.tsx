import React from "react";
import { Composition, staticFile } from "remotion";

import { finalDurationInFrames, type Edits } from "../lib/schema";
import { MainVideo } from "./MainVideo";

/**
 * Props for Remotion Studio and the local smoke render. They point at
 * `public/sample.mp4` — a 6-second 720x1280 clip with a burned-in second counter
 * — so both work with no upload, no network and no Blob token.
 *
 * CRITICAL: this must never set an optional key (`intro`, `outro`, `logo`).
 *
 * `remotion render --props` MERGES these defaults with the props file, per key. A
 * real edit that omits `intro` would therefore inherit this demo's intro card and
 * the client would receive a video with placeholder branding welded onto the front
 * — which is exactly what happened before this comment existed. The Player takes
 * inputProps directly with no merge, so the preview looked correct while the render
 * did not, breaking the one invariant this project depends on.
 *
 * Array and scalar keys are safe: editsSchema.parse always emits them, so they are
 * always overridden. Only the optional keys can leak.
 */
export const SAMPLE_EDITS: Edits = {
  sourceUrl: staticFile("sample.mp4"),
  sourceDurationSec: 6,
  fps: 30,
  width: 720,
  height: 1280,
  trims: [],
  captions: [
    { startSec: 2.5, endSec: 5, text: "نموذج ترجمة عربية" },
    { startSec: 5, endSec: 7.5, text: "Exemple de sous-titre" },
  ],
  captionStyle: {
    fontSizePx: 44,
    color: "#ffffff",
    backgroundColor: "#000000",
    backgroundOpacity: 0.6,
    position: "bottom-center",
    marginPct: 0.08,
    uppercase: false,
  },
  overlays: [
    {
      startSec: 3,
      endSec: 5,
      kind: "text",
      text: "1 900 DA",
      position: "top-center",
      fontSizePx: 72,
      color: "#ffffff",
      widthPct: 0.3,
      opacity: 1,
      animation: "pop",
      rotationDeg: 0,
    },
  ],

  theme: {
    primaryColor: "#0f172a",
    secondaryColor: "#38bdf8",
    textColor: "#ffffff",
    fontFamily: "Cairo",
    direction: "rtl",
  },
  muteSource: false,
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="MainVideo"
    component={MainVideo}
    // These four are placeholders: calculateMetadata below recomputes all of
    // them from the props actually passed in, because a phone video's duration
    // and aspect ratio are only known after ffprobe runs in the normalize step.
    durationInFrames={finalDurationInFrames(SAMPLE_EDITS)}
    fps={SAMPLE_EDITS.fps}
    width={SAMPLE_EDITS.width}
    height={SAMPLE_EDITS.height}
    defaultProps={SAMPLE_EDITS}
    calculateMetadata={({ props }) => ({
      durationInFrames: finalDurationInFrames(props),
      fps: props.fps,
      width: props.width,
      height: props.height,
    })}
  />
);
