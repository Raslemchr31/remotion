import { execFile } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { promisify } from "node:util";

import ffmpegPath from "ffmpeg-static";
import ffprobeStatic from "ffprobe-static";

import type { Project } from "../src/lib/schema";

export const run = promisify(execFile);

/**
 * Shared plumbing for the four commands Claude runs. Deliberately dependency-light
 * so a fresh Claude Code session is usable after nothing more than `npm install`.
 */

/**
 * ffmpeg and ffprobe come from npm, not the system.
 *
 * Claude may be running in a cloud sandbox with no ffmpeg installed, and a
 * transcode failing there is exactly the "worked on my machine" class of problem
 * this project exists to avoid. These binaries ship with the repo's dependencies.
 */
export const FFMPEG = ffmpegPath as unknown as string;
export const FFPROBE = ffprobeStatic.path;

/** Loads .env.local into process.env without adding a dotenv dependency. */
export function loadEnv(): void {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match) continue;
    const [, key, raw] = match;
    if (!process.env[key]) process.env[key] = raw.replace(/^"|"$/g, "");
  }
}

export function requireEnv(name: string): string {
  loadEnv();
  const value = process.env[name];
  if (!value) {
    console.error(
      `Missing ${name}.\nRun "vercel env pull .env.local" in this repo, or set it in the environment.`,
    );
    process.exit(1);
  }
  return value;
}

export function appUrl(): string {
  loadEnv();
  const url = process.env.APP_URL;
  if (!url) {
    console.error(
      'Missing APP_URL. Add it to .env.local, e.g. APP_URL="https://video-review-lac.vercel.app"',
    );
    process.exit(1);
  }
  return url.replace(/\/$/, "");
}

/**
 * The project Claude is currently working on.
 *
 * Written on publish and read by the other commands, so Claude never has to
 * remember or be told a token. If the file is gone — fresh session, different
 * machine — callers fall back to the newest project in storage, which for a
 * one-client tool is the same project.
 */
const CURRENT_FILE = ".current-project";

export function rememberProject(token: string): void {
  writeFileSync(CURRENT_FILE, token + "\n", "utf8");
}

export function recallProject(): string | undefined {
  if (!existsSync(CURRENT_FILE)) return undefined;
  return readFileSync(CURRENT_FILE, "utf8").trim() || undefined;
}

/**
 * Reads a named flag, e.g. flag(process.argv, "--brief").
 *
 * Joins every argument up to the next flag rather than taking just the one after
 * it: `npm run` re-splits quoted values, so `--brief "add captions"` arrives as two
 * separate arguments and taking only the first would silently truncate the client's
 * instructions to one word.
 */
export function flag(argv: string[], name: string): string | undefined {
  const start = argv.indexOf(name);
  if (start === -1) return undefined;
  const words: string[] = [];
  for (let i = start + 1; i < argv.length && !argv[i].startsWith("--"); i += 1) {
    words.push(argv[i]);
  }
  return words.length > 0 ? words.join(" ") : undefined;
}

export function reviewLink(token: string): string {
  return `${appUrl()}/v/${token}`;
}

/** Formats seconds as m:ss, matching how the client sees timestamps. */
export function clock(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * Resolves which project to act on: an explicit --token, then .current-project,
 * then the newest project in storage.
 */
export async function resolveProject(argv: string[]): Promise<Project> {
  const { latestProject, loadProject } = await import("../src/lib/store");

  const explicit = flag(argv, "--token") ?? recallProject();
  if (explicit) {
    const project = await loadProject(explicit);
    if (project) return project;
    console.error(`No project found for token ${explicit}; falling back to the newest one.`);
  }

  const latest = await latestProject();
  if (!latest) {
    console.error("No projects exist yet. Publish one: npm run video:new -- <video>");
    process.exit(1);
  }
  rememberProject(latest.token);
  return latest;
}
