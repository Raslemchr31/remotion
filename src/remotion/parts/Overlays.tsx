import React from "react";
import { AbsoluteFill, Img, interpolate, Sequence, spring, useCurrentFrame } from "remotion";

import { secToFrames, type Animation, type Overlay, type Theme } from "../../lib/schema";
import { fontStack } from "../fonts";
import { positionStyle, textAlignFor } from "../layout";

const ENTER_FRAMES = 8;

/**
 * Entrance animation for an overlay, as an opacity + transform pair. All motion
 * is derived from the frame number, never from wall-clock time, so the preview
 * and the render agree frame for frame.
 */
function useEnterAnimation(
  animation: Animation,
  durationInFrames: number,
  fps: number,
): { opacity: number; transform: string } {
  const frame = useCurrentFrame();

  const fade = interpolate(
    frame,
    [0, ENTER_FRAMES, Math.max(ENTER_FRAMES, durationInFrames - ENTER_FRAMES), durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const popScale = spring({
    frame,
    fps,
    config: { damping: 12, mass: 0.6, stiffness: 140 },
  });

  switch (animation) {
    case "none":
      return { opacity: 1, transform: "none" };
    case "fade":
      return { opacity: fade, transform: "none" };
    case "slide-up": {
      const y = interpolate(frame, [0, ENTER_FRAMES], [40, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      return { opacity: fade, transform: `translateY(${y}px)` };
    }
    case "slide-down": {
      const y = interpolate(frame, [0, ENTER_FRAMES], [-40, 0], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
      return { opacity: fade, transform: `translateY(${y}px)` };
    }
    case "pop":
      // interpolate maps the spring's 0..1 through a slight overshoot so the
      // element settles instead of snapping.
      return {
        opacity: fade,
        transform: `scale(${interpolate(popScale, [0, 1], [0.6, 1])})`,
      };
  }
}

const OverlayLayer: React.FC<{
  overlay: Overlay;
  theme: Theme;
  fps: number;
  durationInFrames: number;
}> = ({ overlay, theme, fps, durationInFrames }) => {
  const { opacity, transform } = useEnterAnimation(overlay.animation, durationInFrames, fps);
  const combinedTransform =
    overlay.rotationDeg === 0 ? transform : `${transform} rotate(${overlay.rotationDeg}deg)`;

  return (
    <AbsoluteFill style={positionStyle(overlay.position, 0.05)}>
      {overlay.kind === "text" ? (
        <span
          style={{
            opacity: opacity * overlay.opacity,
            transform: combinedTransform,
            fontFamily: fontStack(theme),
            fontSize: overlay.fontSizePx,
            fontWeight: 700,
            lineHeight: 1.25,
            color: overlay.color,
            backgroundColor: overlay.backgroundColor,
            padding: overlay.backgroundColor ? "0.3em 0.6em" : undefined,
            borderRadius: overlay.backgroundColor ? "0.2em" : undefined,
            direction: theme.direction,
            // See Captions: keeps a Latin overlay such as "1 900 DA" in logical
            // order instead of letting the RTL theme reverse it.
            unicodeBidi: "plaintext",
            textAlign: textAlignFor(overlay.position),
            maxWidth: "85%",
            overflowWrap: "break-word",
            textShadow: overlay.backgroundColor ? undefined : "0 2px 10px rgba(0,0,0,0.5)",
          }}
        >
          {overlay.text}
        </span>
      ) : (
        <Img
          src={overlay.imageUrl as string}
          style={{
            opacity: opacity * overlay.opacity,
            transform: combinedTransform,
            width: `${overlay.widthPct * 100}%`,
            height: "auto",
          }}
        />
      )}
    </AbsoluteFill>
  );
};

/** Timed text and image layers. Times are on the final timeline. */
export const Overlays: React.FC<{
  overlays: Overlay[];
  theme: Theme;
  fps: number;
}> = ({ overlays, theme, fps }) => (
  <>
    {overlays.map((overlay, index) => {
      const from = secToFrames(overlay.startSec, fps);
      const durationInFrames = Math.max(1, secToFrames(overlay.endSec - overlay.startSec, fps));
      return (
        <Sequence
          key={`overlay-${index}`}
          from={from}
          durationInFrames={durationInFrames}
          layout="none"
        >
          <OverlayLayer
            overlay={overlay}
            theme={theme}
            fps={fps}
            durationInFrames={durationInFrames}
          />
        </Sequence>
      );
    })}
  </>
);
