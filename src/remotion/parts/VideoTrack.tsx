import React from "react";
import { OffthreadVideo, Series } from "remotion";

import { secToFrames, type Trim } from "../../lib/schema";

/**
 * The source video, cut down to the kept ranges and concatenated in array order.
 *
 * <OffthreadVideo> is used rather than <Video> because it serves both consumers
 * from one component: during a render it extracts exact frames with ffmpeg
 * (frame-accurate, no seeking drift), and in the Player it falls back to a plain
 * <video> element. That is what keeps the phone preview and the final MP4 in
 * agreement.
 *
 * `trimBefore` / `trimAfter` are absolute source frame numbers, not durations
 * (the older `startFrom` / `endAt` names are deprecated in Remotion 4.0.5xx).
 */
export const VideoTrack: React.FC<{
  sourceUrl: string;
  sourceDurationSec: number;
  trims: Trim[];
  fps: number;
  muted: boolean;
}> = ({ sourceUrl, sourceDurationSec, trims, fps, muted }) => {
  // No trims means "keep everything" — express that as a single full-length
  // range so the concatenation path below is the only path.
  const ranges: Trim[] =
    trims.length > 0 ? trims : [{ fromSec: 0, toSec: sourceDurationSec }];

  return (
    <Series>
      {ranges.map((range, index) => {
        const fromFrame = secToFrames(range.fromSec, fps);
        const toFrame = secToFrames(Math.min(range.toSec, sourceDurationSec), fps);
        const durationInFrames = Math.max(1, toFrame - fromFrame);

        return (
          <Series.Sequence
            key={`segment-${index}`}
            durationInFrames={durationInFrames}
            layout="none"
          >
            <OffthreadVideo
              src={sourceUrl}
              trimBefore={fromFrame}
              trimAfter={toFrame}
              muted={muted}
              // The normalized file is always the same aspect ratio as the
              // composition, so cover and contain agree; cover avoids a
              // sub-pixel letterbox seam on odd dimensions.
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          </Series.Sequence>
        );
      })}
    </Series>
  );
};
