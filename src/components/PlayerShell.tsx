"use client";

import { Player, type PlayerRef } from "@remotion/player";
import { useMemo, type RefObject } from "react";

import { finalDurationInFrames, type Edits } from "@/lib/schema";
import { MainVideo } from "@/remotion/MainVideo";

/**
 * The preview. Renders the identical composition the CI render uses, so what the
 * client approves is what he receives.
 *
 * This is why an iteration costs seconds instead of a render: new edits JSON goes
 * straight into inputProps and the browser recomposites. No server render sits in
 * the review loop at all — only one transcode per upload and one render per
 * approval.
 *
 * No next/dynamic wrapper is needed. @remotion/player throws if it is evaluated
 * in a server component, which the "use client" directive here prevents; during
 * SSR it simply renders nothing.
 */
export function PlayerShell({
  edits,
  playerRef,
}: {
  edits: Edits;
  playerRef: RefObject<PlayerRef | null>;
}) {
  // An unstable inputProps object would re-mount the whole composition tree on
  // every parent render, which on a phone reads as the video restarting.
  const inputProps = useMemo(() => edits, [edits]);
  const durationInFrames = useMemo(() => finalDurationInFrames(edits), [edits]);

  return (
    <Player
      ref={playerRef}
      component={MainVideo}
      inputProps={inputProps}
      durationInFrames={durationInFrames}
      fps={edits.fps}
      compositionWidth={edits.width}
      compositionHeight={edits.height}
      style={{ width: "100%", height: "100%" }}
      controls
      clickToPlay
      spaceKeyToPlayOrPause
      doubleClickToFullscreen={false}
      // Suppresses a console warning only; not a licence grant. This project is
      // single-person, which Remotion's free licence covers.
      acknowledgeRemotionLicense
      // iOS refuses to autoplay with sound, and a muted first play is friendlier
      // than a play button that silently does nothing.
      initiallyMuted
      showVolumeControls
      errorFallback={({ error }) => (
        <div className="flex h-full items-center justify-center p-6 text-center text-sm text-rose">
          {error.message}
        </div>
      )}
    />
  );
}
