import React from "react";
import { AbsoluteFill, interpolate, Sequence, useCurrentFrame } from "remotion";

import { secToFrames, type Caption, type CaptionStyle, type Theme } from "../../lib/schema";
import { fontStack } from "../fonts";
import { positionStyle, textAlignFor, withOpacity } from "../layout";

/** Frames spent fading a caption in and out. Short enough to feel like a cut. */
const FADE_FRAMES = 4;

const CaptionText: React.FC<{
  caption: Caption;
  style: CaptionStyle;
  theme: Theme;
  durationInFrames: number;
}> = ({ caption, style, theme, durationInFrames }) => {
  const frame = useCurrentFrame();

  const opacity = interpolate(
    frame,
    [0, FADE_FRAMES, Math.max(FADE_FRAMES, durationInFrames - FADE_FRAMES), durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill style={positionStyle(style.position, style.marginPct)}>
      <span
        style={{
          opacity,
          fontFamily: fontStack(theme),
          fontSize: style.fontSizePx,
          fontWeight: 700,
          lineHeight: 1.3,
          color: style.color,
          backgroundColor: withOpacity(style.backgroundColor, style.backgroundOpacity),
          textAlign: textAlignFor(style.position),
          direction: theme.direction,
          // Resolves direction per caption from its first strong character, so
          // an Arabic line runs RTL while a French line or a price like
          // "1 900 DA" stays LTR. Without this, the theme's RTL direction
          // reverses the runs of a Latin caption into "DA 900 1".
          unicodeBidi: "plaintext",
          padding: "0.35em 0.7em",
          borderRadius: "0.25em",
          // Arabic shaping breaks if the glyph run is split, so wrap by word only
          // and let the whole caption block stay within 80% of the frame.
          maxWidth: "80%",
          overflowWrap: "break-word",
          textTransform: style.uppercase ? "uppercase" : "none",
          // A shadow keeps light captions readable over a bright frame even when
          // the background box is nearly transparent.
          textShadow: "0 2px 8px rgba(0,0,0,0.45)",
        }}
      >
        {caption.text}
      </span>
    </AbsoluteFill>
  );
};

/**
 * Burned-in subtitles. Caption times are on the final timeline, so this layer
 * sits above the whole video (intro card included) and needs no offsetting.
 */
export const Captions: React.FC<{
  captions: Caption[];
  style: CaptionStyle;
  theme: Theme;
  fps: number;
}> = ({ captions, style, theme, fps }) => (
  <>
    {captions.map((caption, index) => {
      const from = secToFrames(caption.startSec, fps);
      const durationInFrames = Math.max(1, secToFrames(caption.endSec - caption.startSec, fps));
      return (
        <Sequence
          key={`caption-${index}`}
          from={from}
          durationInFrames={durationInFrames}
          layout="none"
        >
          <CaptionText
            caption={caption}
            style={style}
            theme={theme}
            durationInFrames={durationInFrames}
          />
        </Sequence>
      );
    })}
  </>
);
