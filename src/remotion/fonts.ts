import { continueRender, delayRender, staticFile } from "remotion";

import type { Theme } from "../lib/schema";

/**
 * Arabic + Latin fonts, self-hosted from public/fonts.
 *
 * These were previously pulled from Google via @remotion/google-fonts, and that
 * fails in a Claude Code cloud sandbox: the sandbox routes traffic through an
 * inspecting proxy, and Remotion's bundled headless Chrome has its own NSS trust
 * store which does not trust that proxy's certificate. The fetch fails TLS, the
 * font never arrives, and every caption renders as empty boxes — while the same
 * render works fine on a laptop. Exactly the "works on my machine" failure this
 * project exists to avoid.
 *
 * Loading from disk removes the network from the render path entirely, so it
 * behaves the same on a laptop, in a sandbox behind a proxy, and offline. It is
 * also faster, and it cannot time out.
 *
 * Each family is registered per weight and per unicode-range, so an Arabic caption
 * pulls only the Arabic file and a French one only the Latin file. The ranges match
 * what Google serves, which is what keeps "1 900 DA" in an Arabic caption from
 * falling back to a system font.
 */

const ARABIC_RANGE =
  "U+0600-06FF, U+0750-077F, U+0870-088E, U+0890-0891, U+0897-08E1, U+08E3-08FF, " +
  "U+200C-200E, U+2010-2011, U+204F, U+2E41, U+FB50-FDFF, U+FE70-FE74, U+FE76-FEFC";

const LATIN_RANGE =
  "U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, " +
  "U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, " +
  "U+FEFF, U+FFFD";

type FaceSpec = { file: string; weight: string; range: string };

const FACES: Record<Theme["fontFamily"], FaceSpec[]> = {
  // Cairo and Noto Sans Arabic are variable fonts: one file covers 400 to 700.
  Cairo: [
    { file: "cairo-arabic.woff2", weight: "400 700", range: ARABIC_RANGE },
    { file: "cairo-latin.woff2", weight: "400 700", range: LATIN_RANGE },
  ],
  NotoSansArabic: [
    { file: "noto-arabic.woff2", weight: "400 700", range: ARABIC_RANGE },
    { file: "noto-latin.woff2", weight: "400 700", range: LATIN_RANGE },
  ],
  // Almarai and Tajawal ship static weights, so each needs its own file.
  Almarai: [
    { file: "almarai-400-arabic.woff2", weight: "400", range: ARABIC_RANGE },
    { file: "almarai-400-latin.woff2", weight: "400", range: LATIN_RANGE },
    { file: "almarai-700-arabic.woff2", weight: "700", range: ARABIC_RANGE },
    { file: "almarai-700-latin.woff2", weight: "700", range: LATIN_RANGE },
  ],
  Tajawal: [
    { file: "tajawal-400-arabic.woff2", weight: "400", range: ARABIC_RANGE },
    { file: "tajawal-400-latin.woff2", weight: "400", range: LATIN_RANGE },
    { file: "tajawal-700-arabic.woff2", weight: "700", range: ARABIC_RANGE },
    { file: "tajawal-700-latin.woff2", weight: "700", range: LATIN_RANGE },
  ],
};

const FAMILY_NAMES: Record<Theme["fontFamily"], string> = {
  Cairo: "Cairo",
  Almarai: "Almarai",
  Tajawal: "Tajawal",
  NotoSansArabic: "Noto Sans Arabic",
};

/**
 * Registers every face once, at module scope.
 *
 * The `typeof FontFace` guard matters: this module is imported by the review page,
 * which Next renders on the server where FontFace does not exist. Without it, the
 * page would throw during SSR.
 */
const loadAll = (): Promise<void> => {
  if (typeof FontFace === "undefined") return Promise.resolve();

  const loads = (Object.keys(FACES) as Theme["fontFamily"][]).flatMap((family) =>
    FACES[family].map(async (face) => {
      const fontFace = new FontFace(
        FAMILY_NAMES[family],
        `url(${staticFile(`fonts/${face.file}`)}) format('woff2')`,
        { weight: face.weight, unicodeRange: face.range, display: "block" },
      );
      await fontFace.load();
      document.fonts.add(fontFace);
    }),
  );

  return Promise.all(loads).then(() => undefined);
};

const fontsReady = loadAll();

// Holds the render open until the faces are registered. In the Player this is a
// no-op, which is why <WaitForFonts> gates on React state as well.
if (typeof FontFace !== "undefined") {
  const handle = delayRender("Loading Arabic fonts");
  fontsReady
    .then(() => continueRender(handle))
    .catch(() => continueRender(handle));
}

/** Resolves once every family is usable. */
export const waitForFonts = (): Promise<void> => fontsReady;

/** CSS font-family stack for a theme, with a system fallback. */
export function fontStack(theme: Theme): string {
  return `"${FAMILY_NAMES[theme.fontFamily]}", "Segoe UI", system-ui, sans-serif`;
}
