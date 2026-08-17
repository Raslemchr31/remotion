@AGENTS.md

# Video review loop — how you run this

The client attaches a video in this chat and says what he wants. You edit it and
send back one link. He watches, taps moments to leave notes, presses Submit, then
comes back here and says "I left comments". You apply them and send nothing —
his page updates itself. When he is happy he presses Done, tells you, and you
render the final so his download button goes live.

He never sees a project id, a key, or a form. You never need to remember an id
either: every command below acts on the current project by itself.

## The four commands

```bash
# 1. He attached a video and said what he wants
npm run video:new -- <path/to/video> --brief "what he asked for" --title "name"

# 2. He said "I left comments" — read them (also writes edits.json for you)
npm run video:comments

# 3. Post your edit; his open page picks it up within seconds
npm run video:update -- edits.json --note "one line saying what you changed"

# 4. He said he is done — render the final; his download button goes live
npm run video:final
```

Nothing else is required. There is no server to start, no id to track, no
GitHub Action, and no deploy step for an edit — the composition is fixed code and
every change is data.

## The loop, concretely

1. **He attaches a video.** Run `video:new` with the file path. It transcodes the
   file (phone video is usually HEVC in a `.mov` and will not play in a mobile
   browser otherwise), measures it, uploads it, and prints the review link plus the
   exact `sourceUrl`, `fps`, `width` and `height` to use.
2. **Write the edit.** Create `edits.json` (schema below) and run `video:update`.
   Send him the link with a sentence about what you did.
3. **He says "I left comments".** Run `video:comments`. It prints only the rounds
   you have not answered, each comment's timestamp on both the final and the source
   timeline, and writes the current edits to `edits.json` so you can modify rather
   than retype.
4. **Apply and post.** Change `edits.json`, run `video:update` with a `--note`.
   Tell him it is ready; he does not need to reload.
5. **Repeat** from 3 for as many rounds as he wants.
6. **He says he is done.** Run `video:final`. A few minutes later his page has a
   download button.

## Rules that will bite you

**Send the whole edits object.** There is no patch. `video:comments` writes the
current edits to `edits.json` for exactly this reason — modify that file. Anything
you delete from it is gone from the video.

**Never invent `sourceUrl`, `fps`, `width`, `height` or `sourceDurationSec`.** They
come from ffprobe at publish time and `video:update` refuses values that disagree,
because the preview and the render both derive their timeline from them.

**Times are on the FINAL timeline, not the source.** The final timeline is
`intro.durationSec` + the kept source + `outro.durationSec`. A comment at 4.5s with
a 2-second intro is source second 2.5. `trims` are the one field in source seconds —
`video:comments` prints both figures so you do not have to do the arithmetic.

**Answer the comment he actually made.** "كبّر السعر" means raise `fontSizePx` on
that overlay, not restyle the video. Make the smallest change that satisfies the
note, and say what you changed in `--note`.

**Write in his language.** He works in Arabic and French. Match what he used, and
put Arabic and French on separate captions rather than mixing them in one line.

## The edits schema

Authoritative definition: `src/lib/schema.ts` — read it when unsure, it is what
validates your file and what the composition consumes.

```jsonc
{
  "sourceUrl": "<printed by video:new>",
  "sourceDurationSec": 8.011, "fps": 30, "width": 1280, "height": 720,

  "trims": [{ "fromSec": 0, "toSec": 5 }],   // SOURCE seconds; kept ranges,
                                              // concatenated in array order.
                                              // [] keeps the whole video.

  "captions": [{ "startSec": 2.2, "endSec": 5.0, "text": "صنادل صيف" }],
  "captionStyle": {
    "fontSizePx": 46, "color": "#ffffff",
    "backgroundColor": "#000000", "backgroundOpacity": 0.62,
    "position": "bottom-center", "marginPct": 0.07, "uppercase": false
  },

  "overlays": [
    { "startSec": 3, "endSec": 7, "kind": "text", "text": "1 900 DA",
      "position": "top-center", "fontSizePx": 78, "color": "#ffffff",
      "backgroundColor": "#0f172a", "opacity": 1, "animation": "pop",
      "rotationDeg": 0, "widthPct": 0.3 }
    // kind "image" instead needs "imageUrl"; it uses widthPct, not fontSizePx
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

- `position`: any of the nine, `top-left` … `bottom-right`.
- `animation`: `none | fade | slide-up | slide-down | pop`.
- `fontFamily`: `Cairo | Almarai | Tajawal | NotoSansArabic` — all cover Arabic and
  Latin, so one caption can mix Arabic with a Latin brand name or a price.
- Colours are hex. Every `imageUrl` must be an absolute, publicly readable https URL.
- `intro`, `outro` and `logo` are optional — omit the key entirely to leave them out.

## Requirements

- `.env.local` with `BLOB_READ_WRITE_TOKEN` and `APP_URL`. Refresh the token with
  `vercel env pull .env.local`.
- `npm install` once. ffmpeg and ffprobe come from npm, so no system install is
  needed; the final render downloads Chrome Headless Shell on first use.

## Repo layout

```
scripts/               the four commands above
src/remotion/          the composition — fixed code, driven entirely by props
  MainVideo.tsx        intro card, video body, outro card, captions, overlays, logo
  parts/               one file per layer
src/lib/schema.ts      the contract for everything; read this before editing props
src/lib/store.ts       Blob-backed store: write-once documents, derived status
src/app/v/[token]/     the only page the client sees
src/app/api/v/[token]/ what that page talks to
```

## Changing what is editable

If he asks for something the schema cannot express — a zoom, a colour filter, a
second video track — that is a code change, not an edits change:

1. Extend `editsSchema` in `src/lib/schema.ts`.
2. Add a layer in `src/remotion/parts/` and mount it in `MainVideo.tsx`.
3. Check it with `npm run studio`, then `npm run typecheck` and `npx next build`.
4. Commit, push, and `vercel deploy --prod` so his page can render the new field.

Do not fork the composition per client, and do not hardcode a value that belongs
in props.
