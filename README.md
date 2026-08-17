# Video review loop

The client attaches a video in a Claude chat and says what he wants. Claude edits it
with Remotion and sends back one link. He watches on his phone, taps moments to
leave notes, presses Submit, then tells Claude "I left comments". Claude applies
them and his page updates by itself. When he is happy he presses Done, tells Claude,
and downloads the finished MP4 from the same page.

Live: https://video-review-lac.vercel.app

## What the client deals with

Two things, and nothing else:

1. **The chat** — attach a video, say what he wants, later say "I left comments" and
   "I'm done".
2. **One link** — watch, tap to comment, Submit, Done, Download.

No upload form, no login, no project id, no key to paste. The link contains a
43-character random token and that token is the whole authorisation, so treat the
link as the password it is.

## What Claude deals with

Four commands, none of which need a project id — they act on the current project:

```bash
npm run video:new -- <video> --brief "what he asked for"   # he attached a video
npm run video:comments                                     # he left comments
npm run video:update -- edits.json --note "what changed"   # post the new cut
npm run video:final                                        # he is done; render it
```

`CLAUDE.md` is the full operating manual, including the edits schema.

## Requirements

The chat has to be a surface where Claude can run commands and see the attached
file — **Claude Code** (`claude.ai/code`, which works in a phone browser, or the
desktop app). A plain Claude conversation can accept a file attachment but has no
way to push its bytes anywhere, so the video would never reach storage.

Beyond that: `npm install`, and a `.env.local` containing `BLOB_READ_WRITE_TOKEN`
and `APP_URL`. ffmpeg and ffprobe come from npm, so nothing has to be installed on
the machine.

## Why it is built this way

**The preview never renders.** The review page runs the same Remotion composition
through `@remotion/player`, so a new version shows up in seconds rather than
minutes. The single full render happens once, after the client says he is happy.

**Uploads are transcoded before anyone sees them.** This is the fix for the original
failure, where the workflow worked on a PC but not on the client's phone: phone
recordings are HEVC in a `.mov` and do not decode in mobile browsers, and they carry
rotation as metadata rather than rotated pixels. Every video is converted to
H.264/AAC at a constant 30fps and measured with ffprobe first — a fractional frame
rate would make captions drift from where the client pinned them.

**No database and no mutable records.** A project is a handful of write-once JSON
documents in Vercel Blob, each written by exactly one author, and its status is
derived from which documents exist rather than stored. Claude posting an edit while
the client submits comments therefore cannot lose either write. Nothing is ever
overwritten because Blob cannot cache for less than 60 seconds, so a mutable
document at a stable path could serve a stale cut to a client who just refreshed.

**No CI.** An earlier version ran the transcode and the render in GitHub Actions.
Claude already has ffmpeg and Remotion where it works, so the workflows, their
secrets, the dispatch token and the callback endpoints were all deleted.

## Architecture

```
 Claude Code chat                          Vercel
 ────────────────                          ──────
 video attached
   │
   ├─ video:new ──▶ ffmpeg transcode ──▶ Blob: source.mp4 + video.json
   │                + ffprobe measure
   │
   ├─ video:update ─────────────────────▶ Blob: edits/{n}.json
   │                                            │
   │                              ┌─────────────▼─────────────┐
   │                              │  /v/<token>               │
   │                              │  @remotion/player preview │
   │                              │  tap → comment → Submit   │
   │                              └─────────────┬─────────────┘
   ├─ video:comments ◀── Blob: rounds/{n}.json ─┘
   │
   └─ video:final ──▶ remotion render ──▶ Blob: final-v{n}.mp4 ──▶ download button
```

## Development

```bash
npm install
vercel env pull .env.local
npm run dev          # the app on localhost:3000
npm run studio       # Remotion Studio with public/sample.mp4
npm run typecheck
npm run lint
npx next build
```

Deploy with `vercel deploy --prod`. The Vercel project needs exactly one
environment variable, `BLOB_READ_WRITE_TOKEN`, which `vercel blob create-store`
sets when the store is linked.

## Costs

- **Remotion licence** — free for individuals and for-profit companies with up to
  three people, which covers this. At four or more, automated rendering falls under
  "Remotion for Automators": $0.01 per render, $100/month minimum.
- **Vercel Blob** — free on Hobby within limits, but exceeding them locks the store
  for 30 days rather than billing overage. Files over 512 MB are never CDN-cached,
  so a long final video costs origin transfer on every view.
- **Rendering** costs nothing: it runs wherever Claude is.

## Known constraints

- `next/font/google` is not used. Its bundled manifest points at Cairo woff2 URLs
  Google has rotated away, which 404 and fail the build — and that failure surfaces
  as a misleading `_global-error` prerender crash. Cairo is self-hosted in
  `public/fonts/` and declared in `src/app/globals.css`.
- Comment timestamps are on the final timeline (intro + trimmed body + outro).
  `trims` are the one field in source seconds; `video:comments` prints both.
- The link secret is the only access control. That is deliberate for a single-client
  tool and is not suitable for several clients as-is.
