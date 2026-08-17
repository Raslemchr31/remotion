/**
 * ffprobe-static ships no types. Only `path` is used, and the binary is bundled
 * with the package so this is the whole surface.
 */
declare module "ffprobe-static" {
  const ffprobe: { path: string };
  export default ffprobe;
}
