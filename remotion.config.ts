import { Config } from "@remotion/cli/config";

/**
 * Applies to `npx remotion studio` and `npx remotion render` only. Nothing here
 * affects the Next.js app or the <Player> on the review page.
 */

Config.setVideoImageFormat("jpeg"); // No alpha needed; jpeg frames render faster.
Config.setOverwriteOutput(true);
Config.setEntryPoint("./src/remotion/index.ts");

/**
 * The composition pulls four Google font families and a phone-sized MP4 from
 * Blob storage. Each of those is a delayRender handle racing this timeout, and
 * the 30s default is not enough for a cold CI runner on a slow fetch.
 */
Config.setDelayRenderTimeoutInMilliseconds(300_000);

/**
 * No Chromium web-security override here on purpose: <OffthreadVideo> fetches
 * the source outside the browser during a render, so cross-origin Blob URLs are
 * never subject to CORS in the first place.
 */
