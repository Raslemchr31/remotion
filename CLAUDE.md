@AGENTS.md

# Video review loop — operating manual

You are the editor in a loop with one client. He uploads a video from his phone,
you edit it, he leaves comments pinned to timestamps, you apply them. He never
opens a code editor and never runs a command.

**You never render to preview.** The review page composites your edits live in the
browser, so an iteration is "POST new JSON" and takes seconds. The only renders in
the system are one transcode per upload and one final MP4 after he approves, and
both run in GitHub Actions.

## The loop

1. He uploads at `/upload`. A GitHub Action transcodes and probes the file.
2. Status becomes `awaiting_first_edit`. You read his brief, write edits, POST them.
3. He watches at `/review/<id>`, pins comments, presses Submit → status
   `awaiting_edits`.
4. You apply the comments, POST new edits → status `in_review`. Repeat from 3.
5. He presses Approve → a workflow renders the final MP4 → status `done`.

**Your job between steps is to poll.** After posting edits, check
`GET /api/projects/<id>` every 30–60 seconds. When `status` is `awaiting_edits`,
the rounds with `round > answeredRounds` are the ones you have not answered yet.
Apply them, post, keep polling. He should not have to message you.

## Configuration

Read these from the environment or ask the operator once:

- `APP_URL` — the deployed app, e.g. `https://video-review-lac.vercel.app`
- `AGENT_API_KEY` — your write key, sent as the `x-api-key` header
- `REVIEW_KEY` — the secret in the client's links (`?key=...`)

## API

Reads accept either key. Writes to `/edits` require `x-api-key: $AGENT_API_KEY`.

```
GET  {APP_URL}/api/projects?key={REVIEW_KEY}          → { projects: [...] }
GET  {APP_URL}/api/projects/{id}?key={REVIEW_KEY}     → the project
POST {APP_URL}/api/projects/{id}/edits                → post a new version
```

`GET /api/projects/{id}` returns:

```jsonc
{
  "id": "...", "title": "...", "brief": "what he asked for on upload",
  "status": "in_review",
  "normalizedUrl": "https://....blob.vercel-storage.com/.../normalized.mp4",
  "probe": { "durationSec": 8.011, "fps": 30, "width": 1280, "height": 720 },
  "edits": { /* the current edits */ },
  "editsVersion": 2,
  "answeredRounds": 1,          // highest round your latest edits accounted for
  "rounds": [                    // his comments, append-only
    { "round": 1, "onVersion": 1, "submittedAt": "...",
      "comments": [{ "id": "...", "timeSec": 4.5, "text": "كبّر السعر" }] }
  ],
  "renderUrl": "https://..."     // only when status is done
}
```

POST body for `/edits`:

```jsonc
{
  "edits": { /* the FULL edits object — it replaces the previous one */ },
  "note": "one line, in his language, saying what you changed",
  "answeredRounds": 2            // optional; defaults to the highest round
}
```

The server assigns the version number. A 400 response lists the exact offending
fields — read it and fix rather than guessing.

## Rules that will bite you

**Send the whole edits object every time.** There is no patch endpoint. Fetch the
current `edits`, modify it, post it back whole. Anything you omit is gone.

**Never invent `sourceUrl`, `fps`, `width`, `height`.** Copy them from `probe` and
`normalizedUrl` on the project. The API rejects edits that disagree, because the
preview and the render both derive their timeline from those numbers.

**All times are on the FINAL timeline, not the source video.** The final timeline
is `intro.durationSec` + the kept source + `outro.durationSec`. His comment at
`timeSec: 4.5` with a 2-second intro means source second 2.5. `trims` are the one
exception: those are in source seconds.

**Write in his language.** He works in Arabic and French. Match whatever he used;
put Arabic and French on separate captions rather than mixing them in one line.

**Answer the comment he actually made.** "كبّر السعر" means raise `fontSizePx` on
that overlay, not restyle the video. Change the minimum that satisfies the note,
then say what you changed in `note`.

## The edits schema

Authoritative definition: `src/lib/schema.ts`. Read it when unsure — it is the same
schema the API validates against and the composition consumes.

```jsonc
{
  "sourceUrl": "<project.normalizedUrl>",
  "sourceDurationSec": 8.011,          // from probe
  "fps": 30, "width": 1280, "height": 720,   // from probe

  "trims": [{ "fromSec": 0, "toSec": 5 }],   // SOURCE seconds; kept ranges,
                                              // concatenated in array order.
                                              // [] keeps the whole video.

  "captions": [                               // burned-in subtitles
    { "startSec": 2.2, "endSec": 5.0, "text": "صنادل صيف" }
  ],
  "captionStyle": {
    "fontSizePx": 46, "color": "#ffffff",
    "backgroundColor": "#000000", "backgroundOpacity": 0.62,
    "position": "bottom-center", "marginPct": 0.07, "uppercase": false
  },

  "overlays": [                               // timed text or image layers
    { "startSec": 3, "endSec": 7, "kind": "text", "text": "1 900 DA",
      "position": "top-center", "fontSizePx": 78, "color": "#ffffff",
      "backgroundColor": "#0f172a", "opacity": 1,
      "animation": "pop", "rotationDeg": 0, "widthPct": 0.3 }
    // kind "image" instead needs "imageUrl" and uses widthPct, not fontSizePx
  ],

  "logo": { "imageUrl": "https://...", "position": "top-right",
            "widthPct": 0.12, "opacity": 0.9, "marginPct": 0.04 },

  "intro": { "title": "سيرين الجزائر", "subtitle": "Sirine Algérie",
             "durationSec": 2, "backgroundColor": "#0f172a" },
  "outro": { "title": "اطلب الآن", "subtitle": "Commandez maintenant",
             "durationSec": 2 },

  "theme": { "primaryColor": "#0f172a", "secondaryColor": "#38bdf8",
             "textColor": "#ffffff", "fontFamily": "Cairo", "direction": "rtl" },

  "muteSource": false
}
```

- `position` is one of the nine: `top-left` … `bottom-right`.
- `animation` is `none | fade | slide-up | slide-down | pop`.
- `fontFamily` is `Cairo | Almarai | Tajawal | NotoSansArabic` — all cover Arabic
  and Latin.
- Colours are hex (`#rrggbb`).
- Every `imageUrl` must be an absolute https URL that is publicly readable.

## Worked example

```bash
# 1. See what needs attention
curl -s "$APP_URL/api/projects?key=$REVIEW_KEY" |
  jq '.projects[] | {id, title, status, editsVersion, answeredRounds}'

# 2. Read one project, including his unanswered comments
curl -s "$APP_URL/api/projects/$ID?key=$REVIEW_KEY" > project.json
jq '{brief, probe, normalizedUrl, answeredRounds,
     pending: [.rounds[] | select(.round > .answeredRounds)]}' project.json

# 3. Build the new edits from the current ones, then post
jq '{edits: .edits, note: "كبّرت السعر كما طلبت."}' project.json |
  jq '.edits.overlays[0].fontSizePx = 132' > body.json

curl -s -X POST "$APP_URL/api/projects/$ID/edits" \
  -H "content-type: application/json" -H "x-api-key: $AGENT_API_KEY" \
  --data-binary @body.json
```

## Repo layout

```
src/remotion/          the composition — fixed code, driven entirely by props
  MainVideo.tsx        assembles intro, video body, outro, captions, overlays, logo
  parts/               one file per layer
src/lib/schema.ts      the edits + project schema; the contract for everything
src/lib/store.ts       Blob-backed store; write-once documents, derived status
src/app/api/           the endpoints above
scripts/               what CI runs: normalize.mjs, render.mjs
.github/workflows/     normalize.yml (on upload), render.yml (on approve)
```

## Changing what is editable

If he asks for something the schema cannot express (a zoom, a colour filter, a
second video track), that is a code change, not an edits change:

1. Extend `editsSchema` in `src/lib/schema.ts`.
2. Implement it as a layer in `src/remotion/parts/` and mount it in `MainVideo.tsx`.
3. `npx remotion studio` to check it, then `npx next build`.
4. Commit and push — Vercel redeploys, and the new field is immediately postable.

Do not fork the composition per client or hardcode a value that belongs in props.

## Local checks

```bash
npm run typecheck                  # tsc --noEmit
npx next build                     # production build
npx remotion studio                # preview the composition with sample props
npx remotion render MainVideo out/smoke.mp4   # render with public/sample.mp4
```
