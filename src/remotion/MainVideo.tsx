import React from "react";
import { AbsoluteFill, Sequence, useVideoConfig } from "remotion";

import { bodyDurationSec, finalDurationInFrames, secToFrames, type Edits } from "../lib/schema";
import { Captions } from "./parts/Captions";
import { Card } from "./parts/Card";
import { LogoLayer } from "./parts/LogoLayer";
import { Overlays } from "./parts/Overlays";
import { VideoTrack } from "./parts/VideoTrack";
import { WaitForFonts } from "./WaitForFonts";

/**
 * The one composition in this project. Everything the client can change lives in
 * the `Edits` props object, never in this file — that is what lets an iteration
 * be "post new JSON" instead of "edit code and redeploy".
 *
 * Layer order, bottom to top:
 *   1. intro card      (occupies the first intro.durationSec)
 *   2. video body      (trimmed source, offset by the intro)
 *   3. outro card      (after the body)
 *   4. captions        (final-timeline times)
 *   5. overlays        (final-timeline times)
 *   6. logo            (final-timeline times)
 *
 * Captions, overlays and the logo sit above the cards on purpose: Claude can put
 * a caption over the intro card without needing a separate mechanism.
 */
export const MainVideo: React.FC<Edits> = (edits) => {
  const { fps } = useVideoConfig();

  const introFrames = edits.intro ? secToFrames(edits.intro.durationSec, fps) : 0;
  const bodyFrames = Math.max(1, secToFrames(bodyDurationSec(edits), fps));
  const outroFrames = edits.outro ? secToFrames(edits.outro.durationSec, fps) : 0;
  const totalFrames = finalDurationInFrames(edits);

  return (
    <AbsoluteFill style={{ backgroundColor: edits.theme.primaryColor }}>
      <Sequence from={introFrames} durationInFrames={bodyFrames} layout="none" name="Body">
        <VideoTrack edits={edits} fps={fps} />
      </Sequence>

      {/*
        Every text-bearing layer sits inside one font gate, and after the video
        in DOM order so an opaque card still covers the frame during its window.
        The video itself is deliberately outside the gate: it should start
        showing on the client's phone immediately rather than waiting on a woff2.
      */}
      <WaitForFonts>
        {edits.intro ? (
          <Sequence from={0} durationInFrames={introFrames} layout="none" name="Intro">
            <Card card={edits.intro} theme={edits.theme} durationInFrames={introFrames} />
          </Sequence>
        ) : null}

        {edits.outro ? (
          <Sequence
            from={introFrames + bodyFrames}
            durationInFrames={outroFrames}
            layout="none"
            name="Outro"
          >
            <Card card={edits.outro} theme={edits.theme} durationInFrames={outroFrames} />
          </Sequence>
        ) : null}

        <Captions
          captions={edits.captions}
          style={edits.captionStyle}
          theme={edits.theme}
          fps={fps}
        />
        <Overlays overlays={edits.overlays} theme={edits.theme} fps={fps} />
      </WaitForFonts>

      <LogoLayer logo={edits.logo} fps={fps} totalDurationInFrames={totalFrames} />
    </AbsoluteFill>
  );
};
