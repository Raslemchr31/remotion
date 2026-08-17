"use client";

import type { CallbackListener, PlayerRef } from "@remotion/player";
import { useCallback, useSyncExternalStore } from "react";

/**
 * Current playhead frame, read through useSyncExternalStore.
 *
 * The naive version — useState updated from a frameupdate listener in the
 * Player's parent — re-renders the Player itself thirty times a second and makes
 * playback stutter on a phone. Subscribing through an external store keeps the
 * re-render confined to whichever component actually displays the time.
 */
export function useCurrentPlayerFrame(ref: React.RefObject<PlayerRef | null>): number {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const { current } = ref;
      if (!current) return () => undefined;

      const onFrameUpdate: CallbackListener<"frameupdate"> = () => onStoreChange();
      current.addEventListener("frameupdate", onFrameUpdate);
      return () => current.removeEventListener("frameupdate", onFrameUpdate);
    },
    [ref],
  );

  return useSyncExternalStore(
    subscribe,
    () => ref.current?.getCurrentFrame() ?? 0,
    () => 0,
  );
}
