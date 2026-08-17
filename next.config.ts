import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * There is an unrelated package-lock.json in the user's home directory, and
   * without this Next infers C:\Users\DELL as the workspace root — which pulls the
   * wrong module graph into the build and produces confusing failures far from
   * their cause. Pin the root to this project.
   */
  outputFileTracingRoot: path.join(import.meta.dirname, "."),
};

export default nextConfig;
