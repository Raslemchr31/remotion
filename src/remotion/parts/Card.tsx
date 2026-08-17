import React from "react";
import { AbsoluteFill, Img, interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";

import type { Card as CardData, Theme } from "../../lib/schema";
import { fontStack } from "../fonts";

/**
 * Full-frame branded card used for the intro and the outro. Title springs in,
 * subtitle follows a few frames later, and the whole card fades out over its
 * last few frames so the cut into the video body is not abrupt.
 */
export const Card: React.FC<{ card: CardData; theme: Theme; durationInFrames: number }> = ({
  card,
  theme,
  durationInFrames,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleSpring = spring({ frame, fps, config: { damping: 14, mass: 0.7, stiffness: 120 } });
  const subtitleSpring = spring({
    frame: frame - 6,
    fps,
    config: { damping: 14, mass: 0.7, stiffness: 120 },
  });

  const fadeOut = interpolate(
    frame,
    [Math.max(0, durationInFrames - 6), durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const background = card.backgroundColor ?? theme.primaryColor;
  const textColor = card.textColor ?? theme.textColor;

  return (
    <AbsoluteFill
      style={{
        backgroundColor: background,
        opacity: fadeOut,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "3%",
        padding: "8%",
        fontFamily: fontStack(theme),
        direction: theme.direction,
        // A card routinely pairs an Arabic title with a French subtitle; each
        // line resolves its own direction from its first strong character.
        unicodeBidi: "plaintext",
        textAlign: "center",
      }}
    >
      {card.logoUrl ? (
        <Img
          src={card.logoUrl}
          style={{
            width: "22%",
            height: "auto",
            opacity: titleSpring,
            transform: `scale(${interpolate(titleSpring, [0, 1], [0.8, 1])})`,
          }}
        />
      ) : null}

      <h1
        style={{
          margin: 0,
          color: textColor,
          fontSize: "8vh",
          fontWeight: 700,
          lineHeight: 1.2,
          opacity: titleSpring,
          transform: `translateY(${interpolate(titleSpring, [0, 1], [24, 0])}px)`,
        }}
      >
        {card.title}
      </h1>

      {card.subtitle ? (
        <p
          style={{
            margin: 0,
            color: theme.secondaryColor,
            fontSize: "4.2vh",
            fontWeight: 400,
            lineHeight: 1.35,
            opacity: subtitleSpring,
            transform: `translateY(${interpolate(subtitleSpring, [0, 1], [18, 0])}px)`,
          }}
        >
          {card.subtitle}
        </p>
      ) : null}
    </AbsoluteFill>
  );
};
