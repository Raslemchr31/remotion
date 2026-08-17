import { loadFont as loadAlmarai } from "@remotion/google-fonts/Almarai";
import { loadFont as loadCairo } from "@remotion/google-fonts/Cairo";
import { loadFont as loadNotoSansArabic } from "@remotion/google-fonts/NotoSansArabic";
import { loadFont as loadTajawal } from "@remotion/google-fonts/Tajawal";

import type { Theme } from "../lib/schema";

/**
 * All four families cover Arabic and Latin, so one caption can mix Arabic text
 * with a Latin brand name or a Western price without falling back to a system
 * font mid-word.
 *
 * Two non-obvious constraints drive the shape of this file:
 *
 * 1. `weights` and `subsets` must be narrowed explicitly. A bare loadFont()
 *    fetches every weight x every subset — 24 separate FontFace requests for
 *    Cairo alone, each holding its own delayRender handle, which is the usual
 *    cause of "delayRender was called but not cleared" render timeouts.
 *
 * 2. "latin" is not optional. Each subset becomes a FontFace with a
 *    unicode-range, and the arabic range excludes ASCII — so "1900 DA" in an
 *    otherwise-Arabic caption would silently fall back without it.
 *
 * Loading happens at module scope: @remotion/google-fonts guards `typeof
 * FontFace`, so this no-ops during SSR and is safe to import from both the
 * Remotion bundle and the Next.js app.
 */

const WEIGHTS = ["400", "700"] as const;
const SUBSETS = ["arabic", "latin"] as const;

const cairo = loadCairo("normal", { weights: [...WEIGHTS], subsets: [...SUBSETS] });
const almarai = loadAlmarai("normal", { weights: [...WEIGHTS], subsets: [...SUBSETS] });
const tajawal = loadTajawal("normal", { weights: [...WEIGHTS], subsets: [...SUBSETS] });
const noto = loadNotoSansArabic("normal", { weights: [...WEIGHTS], subsets: [...SUBSETS] });

const FAMILIES: Record<Theme["fontFamily"], string> = {
  Cairo: cairo.fontFamily,
  Almarai: almarai.fontFamily,
  Tajawal: tajawal.fontFamily,
  NotoSansArabic: noto.fontFamily,
};

/** CSS font-family stack for a theme, with a system fallback. */
export function fontStack(theme: Theme): string {
  return `${FAMILIES[theme.fontFamily]}, "Segoe UI", system-ui, sans-serif`;
}

/**
 * Resolves once every family is available.
 *
 * Needed because delayRender() is a no-op in the Player: the render waits for
 * fonts automatically, but the preview would paint a fallback font and then
 * visibly reflow every caption when the woff2 lands. <WaitForFonts> gates on
 * this so the client's phone and the final MP4 show the same thing.
 */
export const waitForFonts = async (): Promise<void> => {
  await Promise.all([
    cairo.waitUntilDone(),
    almarai.waitUntilDone(),
    tajawal.waitUntilDone(),
    noto.waitUntilDone(),
  ]);
};
