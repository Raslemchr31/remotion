# Video Review Loop — Design

**Date:** 2026-08-17
**Repo:** https://github.com/Raslemchr31/remotion (private)
**Status:** Approved by Raslem 2026-08-17

## Purpose

Let the client edit videos from his phone using Claude + Remotion, with zero PC dependency:

1. Client uploads a video from his phone.
2. Claude edits it (captions, text overlays, logo, intro/outro, brand colors) via Remotion.
3. Client reviews the edited result on a mobile web page, leaves comments pinned to timestamps, and hits **Submit**.
4. Claude automatically picks up the comments, applies the edits, and the page updates.
5. Loop repeats until the client hits **Approve**, which produces a final rendered MP4 download.

The previous attempt failed because the workflow only worked on a PC. This design is phone-first and fully cloud.

## Success criteria

- Client completes the entire loop (upload → review → comment → submit → see v2 → approve → download MP4) using only his phone.
- Iteration latency after Submit: under ~2 minutes (no video re-render between iterations).
- Zero infrastructure cost beyond existing Claude + Vercel + GitHub subscriptions.
- No manual "go tell Claude" step required after Submit while a Claude session is watching.

## Architecture

```
┌─────────────┐   upload    ┌──────────────────────────┐
│ Client phone │ ──────────▶ │ Next.js app (Vercel)     │
│              │             │  /upload                 │
│  review page │ ◀────────── │  /review/[id]            │
│  + comments  │   player    │  /api/projects/*         │
└──────┬───────┘             └───────┬──────────┬───────┘
       │ Submit                      │          │
       ▼                             ▼          ▼
  comments stored             Vercel Blob   GitHub Actions
  (Blob JSON)                 - videos      - transcode on upload
       ▲                      - edits.json  - final MP4 render
       │ poll + POST edits    - renders
┌──────┴───────────────┐
│ Claude session       │
│ (claude.ai/code,     │
│  any device,         │
│  same account)       │
└──────────────────────┘
```

### Components

**1. Next.js app (deployed on Vercel)**

- UI bilingual Arabic + French (labels shown in both; RTL-safe layout).
- Routes:
  - `/upload` — client-side upload direct to Vercel Blob (`@vercel/blob` client upload — supports large phone videos without hitting function body limits). Optional "brief" textarea (what edits he wants). Creates a project record.
  - `/review/[id]` — the review page:
    - `@remotion/player` renders the shared Remotion composition with the project's current `edits` JSON + the normalized video URL. Edits appear instantly in the browser — no server render per iteration.
    - Comment UI: a "add comment at current time" button pins a comment to the player's current timestamp; list of pending comments below the player; each comment = `{ time, text }`.
    - **Submit** button — POSTs the batch of comments as a new revision round; page shows "Claude is editing…" state.
    - **Approve** button — marks project approved and triggers the final render workflow.
    - Version indicator (v1, v2, …) and, once rendered, a download button for the final MP4.
  - API routes (all JSON):
    - `GET /api/projects/[id]` — full project state (video URL, edits, comment rounds, status). Claude reads this.
    - `POST /api/projects/[id]/comments` — client submits a comment round. Sets status `awaiting_edits`.
    - `POST /api/projects/[id]/edits` — Claude posts a new `edits` JSON (auth: shared secret header). Bumps version, sets status `in_review`.
    - `POST /api/projects/[id]/approve` — triggers the GitHub `render` workflow via `workflow_dispatch` (GitHub token in Vercel env). Sets status `rendering`.
    - `POST /api/projects/[id]/render-complete` — called by the render workflow with the final MP4 Blob URL (auth: shared secret). Sets status `done`.

**2. Storage (Vercel Blob — no database)**

- `videos/{id}/original.*` — raw upload.
- `videos/{id}/normalized.mp4` — H.264/AAC browser-safe version (see normalization).
- `projects/{id}.json` — project record: status, video URLs, brief, `edits` JSON, array of comment rounds, version history, final render URL.
- `renders/{id}/final-v{n}.mp4` — final renders.
- Rationale: one client, low write volume — a JSON blob per project beats provisioning a database. Revisit if concurrent-write conflicts ever appear.

**3. Remotion composition (in this repo, code is fixed)**

- Single data-driven composition `MainVideo` consuming an `edits` schema (zod-validated):

```ts
{
  sourceUrl: string,            // normalized video in Blob
  durationInFrames: number,     // measured at normalization time
  fps: number,
  width: number, height: number,
  trims: [{ fromSec, toSec }],                    // keep-ranges, concatenated
  captions: [{ startSec, endSec, text, style? }], // burned-in subtitles
  overlays: [{ startSec, endSec, kind: 'text'|'image',
               content, position, animation? }],
  logo?: { url, position, opacity, fromSec?, toSec? },
  intro?: { text, subtext?, durationSec },        // branded intro card
  outro?: { text, subtext?, durationSec },
  theme: { primaryColor, secondaryColor, fontFamily, direction: 'rtl'|'ltr' }
}
```

- The **same composition** is used by `@remotion/player` on the review page and by `npx remotion render` in CI — preview and final render always match.
- Video is embedded via `<OffthreadVideo>` (render) / `<Video>` (player) with `startFrom`/`endAt` implementing trims.

**4. Claude's role (claude.ai/code session — phone or PC, same account)**

- `CLAUDE.md` in this repo is the operating manual: the edits schema, API endpoints + secret, style rules (brand colors, caption styling, Arabic/French conventions), and the watch protocol.
- Flow: client says "new video uploaded" (or Claude lists projects via API) → Claude reads the project (brief + video), writes an `edits` JSON, POSTs it, replies with the review link → then **polls** `GET /api/projects/[id]` (e.g. every 30–60 s via a background loop) → when status becomes `awaiting_edits`, applies the comment round, POSTs new edits, and resumes polling.
- Fallback: if no session is watching (session ended), the client opens Claude on his phone and says "check comments" — same result, one message.

**5. GitHub Actions (compute — free tier, no AWS)**

- `normalize.yml` (`workflow_dispatch`, triggered by the app after upload): downloads the original from Blob, `ffmpeg` transcodes to H.264/AAC MP4 (+ probes duration/fps/dimensions), uploads `normalized.mp4`, PATCHes the project record. This fixes the root cause of "didn't work on his phone" — phone videos (esp. iPhone HEVC `.mov`) often don't play in browsers.
- `render.yml` (`workflow_dispatch`, triggered by Approve): checks out the repo, fetches the project's `edits` JSON, `npx remotion render` → uploads final MP4 to Blob → calls `render-complete`.
- Budget note: private repo = 2000 free Action minutes/month. Normalization ~2–5 min + final render ~5–15 min per video → comfortably dozens of videos/month. If exceeded, make the repo public or pay per minute.

**6. Auth (pragmatic, single-client tool)**

- Review/upload pages guarded by a secret key in the URL (`?key=…`) checked server-side. No accounts.
- Write APIs (`edits`, `render-complete`) require an `x-api-key` shared secret, stored in Vercel env and GitHub Actions secrets. Claude gets it from `CLAUDE.md` (accepted trade-off: the repo is private and single-purpose; the secret only guards a video-review tool).

## Iteration loop timing

- Submit → Claude notices (≤60 s poll) → new edits JSON POSTed (seconds) → client refreshes review page → Player shows v2 **instantly**. No render in the loop; the only renders are one normalization per upload and one final render per approval.

## Error handling

- Upload failure: client-side retry UI; Blob client upload is resumable per attempt.
- Normalization failure (corrupt/exotic file): project status `error` + message on review page ("re-upload, or send the video via WhatsApp").
- Player can't load video: status stays `normalizing` until `normalized.mp4` exists — review page shows a waiting state, polls status.
- Claude posts invalid edits JSON: API validates against the zod schema and rejects with the validation error so Claude can self-correct.
- Render workflow failure: status `render_failed` + Approve button re-enabled; Claude can read the failure via the project record.

## Out of scope (v1) — phase 2 candidates

- Auto-transcription for captions (whisper in a GitHub Action). v1: caption text comes from the client's brief and comments.
- Zero-touch editing via Claude GitHub Action (`@claude` issue on Submit) — removes the need for any watching session.
- Multi-client / multi-tenant, accounts, notifications (WhatsApp ping when v2 ready).
- Music/audio replacement.

## Testing

- Composition: sample `edits.json` fixtures rendered in Player (dev) + a short CI render smoke test on a 5 s clip.
- API: round-trip test — create project → post comments → post edits → verify state transitions.
- End-to-end (manual, on a phone): upload a real phone video → full loop through Approve → download MP4.
