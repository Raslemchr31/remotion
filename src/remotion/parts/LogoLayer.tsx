import React from "react";
import { AbsoluteFill, Img, Sequence } from "remotion";

import { secToFrames, type Logo } from "../../lib/schema";
import { positionStyle } from "../layout";

const LogoMark: React.FC<{ logo: Logo }> = ({ logo }) => (
  <AbsoluteFill style={positionStyle(logo.position, logo.marginPct)}>
    <Img
      src={logo.imageUrl}
      style={{ width: `${logo.widthPct * 100}%`, height: "auto", opacity: logo.opacity }}
    />
  </AbsoluteFill>
);

/**
 * Persistent watermark. With neither fromSec nor toSec the logo covers the whole
 * video, which is the common case; supplying a window lets Claude hide it behind
 * an intro card or drop it before the outro.
 */
export const LogoLayer: React.FC<{
  logo: Logo | undefined;
  fps: number;
  totalDurationInFrames: number;
}> = ({ logo, fps, totalDurationInFrames }) => {
  if (!logo) return null;

  const from = secToFrames(logo.fromSec ?? 0, fps);
  const until =
    logo.toSec === undefined ? totalDurationInFrames : secToFrames(logo.toSec, fps);
  const durationInFrames = Math.max(1, until - from);

  return (
    <Sequence from={from} durationInFrames={durationInFrames} layout="none">
      <LogoMark logo={logo} />
    </Sequence>
  );
};
