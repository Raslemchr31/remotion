import React, { useEffect, useState } from "react";
import { cancelRender, useDelayRender } from "remotion";

import { waitForFonts } from "./fonts";

/**
 * Holds the first frame until every Arabic font is loaded.
 *
 * The render already blocks on the delayRender handles that @remotion/google-fonts
 * creates, so this exists for the Player: delayRender does nothing there, and
 * without a gate the client watches his captions render in a fallback font and
 * then jump when the real font arrives. Gating on React state fixes the preview;
 * keeping a delayRender handle keeps the render correct too.
 */
export const WaitForFonts: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const { delayRender, continueRender } = useDelayRender();
  const [handle] = useState(() => delayRender("Loading Arabic fonts"));

  useEffect(() => {
    if (fontsLoaded) return;
    waitForFonts()
      .then(() => setFontsLoaded(true))
      .catch((error) => cancelRender(error));
  }, [fontsLoaded]);

  useEffect(() => {
    if (fontsLoaded) continueRender(handle);
  }, [fontsLoaded, handle, continueRender]);

  if (!fontsLoaded) return null;
  return <>{children}</>;
};
