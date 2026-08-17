"use client";

import { useCallback, type PointerEvent } from "react";

import { formatTime } from "@/lib/i18n";

export type Pin = { id: string; timeSec: number };

/**
 * Scrub bar with a diamond pin for every unsent comment.
 *
 * Forced to `dir="ltr"` deliberately. The rest of the interface is RTL, but a
 * video timeline runs left-to-right in every player the client already uses;
 * mirroring it would put 0:00 on the right and make every pin position a puzzle.
 */
export function Timeline({
  currentSec,
  durationSec,
  pins,
  onSeek,
}: {
  currentSec: number;
  durationSec: number;
  pins: Pin[];
  onSeek: (sec: number) => void;
}) {
  const progress = durationSec > 0 ? Math.min(1, currentSec / durationSec) : 0;

  const seekFromPointer = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      const ratio = (event.clientX - rect.left) / rect.width;
      onSeek(Math.max(0, Math.min(1, ratio)) * durationSec);
    },
    [durationSec, onSeek],
  );

  return (
    <div dir="ltr" className="select-none px-1">
      <div
        role="slider"
        tabIndex={0}
        aria-label="Video timeline"
        aria-valuemin={0}
        aria-valuemax={Math.round(durationSec)}
        aria-valuenow={Math.round(currentSec)}
        aria-valuetext={formatTime(currentSec)}
        onPointerDown={seekFromPointer}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") onSeek(Math.max(0, currentSec - 1));
          if (event.key === "ArrowRight") onSeek(Math.min(durationSec, currentSec + 1));
        }}
        // Tall hit area for a thumb, thin visible track.
        className="relative flex h-11 cursor-pointer items-center"
      >
        <div className="h-1 w-full rounded-full bg-line">
          <div
            className="h-1 rounded-full bg-ink-dim"
            style={{ width: `${progress * 100}%` }}
          />
        </div>

        <span
          className="pointer-events-none absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink shadow-lift"
          style={{ left: `${progress * 100}%` }}
        />

        {pins.map((pin) => {
          const at = durationSec > 0 ? Math.min(1, pin.timeSec / durationSec) : 0;
          return (
            <button
              key={pin.id}
              type="button"
              aria-label={`Go to ${formatTime(pin.timeSec)}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onSeek(pin.timeSec)}
              className="absolute top-1 -translate-x-1/2 text-amber transition-transform hover:scale-125"
              style={{ left: `${at * 100}%` }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 2 22 12 12 22 2 12 12 2Z" fill="currentColor" />
              </svg>
            </button>
          );
        })}
      </div>

      <div className="flex justify-between px-0.5 text-xs tabular-nums text-ink-faint">
        <span className="text-ink-dim">{formatTime(currentSec)}</span>
        <span>{formatTime(durationSec)}</span>
      </div>
    </div>
  );
}
