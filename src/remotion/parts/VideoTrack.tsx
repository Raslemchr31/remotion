import React from "react";
import { OffthreadVideo, Series } from "remotion";

import { resolveSegments, secToFrames, type Edits } from "../../lib/schema";

/**
 * The footage: every kept segment, back to back, in cut-list order.
 *
 * A segment names a clip and a range inside it, so several uploads play as one
 * video and the same clip can appear more than once. Reordering the array reorders
 * the finished video — there is no separate notion of running order.
 *
 * <OffthreadVideo> serves both consumers from one component: during a render it
 * extracts exact frames with ffmpeg, and in the Player it falls back to a plain
 * <video> element. That is what keeps the phone preview and the final MP4 in
 * agreement.
 *
 * `trimBefore` / `trimAfter` are absolute source frame numbers, not durations (the
 * older `startFrom` / `endAt` names are deprecated in Remotion 4.0.5xx).
 */
export const VideoTrack: React.FC<{ edits: Edits; fps: number }> = ({ edits, fps }) => (
  <Series>
    {resolveSegments(edits).map((segment, index) => {
      const clip = edits.clips[segment.clip];
      // A segment pointing at a clip that no longer exists would crash the render;
      // skipping it keeps the rest of the video watchable and the problem visible.
      if (!clip) return null;

      const fromFrame = secToFrames(segment.fromSec, fps);
      const toFrame = secToFrames(Math.min(segment.toSec, clip.durationSec), fps);
      const durationInFrames = Math.max(1, toFrame - fromFrame);

      return (
        <Series.Sequence
          key={`segment-${index}`}
          durationInFrames={durationInFrames}
          layout="none"
        >
          <OffthreadVideo
            src={clip.sourceUrl}
            trimBefore={fromFrame}
            trimAfter={toFrame}
            muted={edits.muteSource}
            // Every clip was padded onto the same canvas at publish time, so the
            // aspect ratio always matches and cover never crops anything away.
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </Series.Sequence>
      );
    })}
  </Series>
);
