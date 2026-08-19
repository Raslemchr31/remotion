@AGENTS.md

# Video review loop — how you run this

The client attaches a video in this chat and says what he wants. You edit it and
send back one link. He watches, taps moments to leave notes, presses Submit, then
comes back here and says "I left comments". You apply them and send nothing —
his page updates itself. When he is happy he presses Done, tells you, and you
render the final so his download button goes live.

He never sees a project id, a key, or a form. You never need to remember an id
either: every command below acts on the current project by itself.

## First run in a new session

A cloud session starts from a fresh clone, so it has the code but not `.env.local`
(gitignored, as a file holding a write token must be). Before anything else:

```bash
npm install          # ~1 min; brings in Remotion, ffmpeg and ffprobe
npm run setup        # says exactly what is missing
```

If `setup` reports the token missing, ask the operator for it once and write it:

```bash
npm run setup -- --blob-token vercel_blob_rw_XXXXXXXX
```

It can also be set as `BLOB_READ_WRITE_TOKEN` in the cloud environment's variables,
which survives across sessions. Nothing else is needed.

## The four commands

```bash
# 1. He sent one or more clips from the send page and told you the 6-character code
npm run video:new -- <CODE> --brief "what he asked for"

# 2. He said "I left comments" — read them (also writes edits.json for you)
npm run video:comments

# 3. Post your edit; his open page picks it up within seconds
npm run video:update -- edits.json --note "one line saying what you changed"

# 4. He said he is done — render the final; his download button goes live
npm run video:final
# to re-render a version that already has a final (a bad render), note the
# second --, which stops npm swallowing the flag:
npm run video:final -- --force
```

Nothing else is required. There is no server to start, no id to track, no
GitHub Action, and no deploy step for an edit — the composition is fixed code and
every change is data.

## Ask before you edit

After you have watched the footage and before you write any edits, **ask him 3–5
questions** using your question tool, so he taps answers instead of typing. Then edit.

This exists to end the guessing round. Without it the first cut is a guess, he
comments, you guess again — three rounds to reach something he could have told you in
thirty seconds. One round of questions replaces most of that.

The questions must come from **this footage and this brief**, never from a template.
You have just watched the clips: ask about what you actually saw and could not decide
from looking. Good questions sound like:

- "Clip 2 has ten seconds of you walking to the shelf — cut it, or keep it as the
  opening?"
- "You say a price out loud around 0:06. What is it, so I can put it on screen?"
- "Two clips, 18s together. For Reels I would cut to about 12s. Keep it full or tighten?"
- "The pink bag is the best-looking thing here. Open on it, or keep your greeting first?"
- "The shop is noisy. Keep your voice, or mute it and let the captions carry it?"

Never ask what you can see for yourself ("is this portrait?"), what he already told
you in the brief, or anything you would ask about any video ("what is your brand
colour?" — take it from what is on screen and confirm only if it matters).

Two rules that matter:

- **You cannot hear speech.** There is no transcription. If the video depends on
  what he is saying, one of your questions must be asking him what he says — do not
  invent dialogue.
- **Offer a recommendation.** He is not an editor. Say which option you would pick
  and why, and let him tap it. "I would cut it — the first second decides whether
  anyone watches" is worth more than a neutral menu.

Put the answers he gives into the `--note` of the version you post, in his language.
`video:comments` prints that note back on every later round, so a fresh session
inherits the decisions instead of asking him the same thing twice.

## The loop, concretely

1. **He sends clips and gives you a code.** He picks one or more on the send page,
   which uploads them straight to storage and shows him a single 6-character code
   like `B27JD9`. Run `video:new -- B27JD9`. It transcodes every clip onto one
   shared canvas (phone video is usually HEVC in a `.mov` and will not play in a
   mobile browser otherwise), measures them, uploads them, and prints the review link
   plus the exact values to use.

   He uploads rather than attaching because Claude Code on a phone caps chat
   attachments at 30 MB. If he forgets the code, `video:new` with no argument takes
   the newest upload waiting in storage.

2. **Watch the footage, then ask your questions.** See the section above. Do not skip
   to editing.
3. **Write the edit.** Create `edits.json` (schema below) and run `video:update`.
   Send him the link with a sentence about what you did.
4. **He says "I left comments".** Run `video:comments`. It prints only the rounds
   you have not answered, each comment's timestamp on both the final and the source
   timeline, and writes the current edits to `edits.json` so you can modify rather
   than retype.
5. **Apply and post.** Change `edits.json`, run `video:update` with a `--note`.
   Tell him it is ready; he does not need to reload.
6. **Repeat** from 4 for as many rounds as he wants.
7. **He says he is done.** Run `video:final`. A few minutes later his page has a
   download button.

## Rules that will bite you

**Send the whole edits object.** There is no patch. `video:comments` writes the
current edits to `edits.json` for exactly this reason — modify that file. Anything
you delete from it is gone from the video.

**Never invent `clips`, `fps`, `width` or `height`.** They come from ffprobe at
publish time and `video:update` refuses values that disagree, because the preview and
the render both derive their timeline from them. `clips` must list every uploaded
clip, in upload order, even ones you cut out entirely — drop those with `segments`.

**Times are on the FINAL timeline, except segments.** Captions, overlays and the logo
are placed on the finished video's timeline. `segments` are cut in each clip's own
seconds. `video:comments` prints the running order and locates every comment to its
clip and second, so you never do that arithmetic by hand.

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
  // Every uploaded clip, in upload order, exactly as video:new printed them.
  "clips": [
    { "sourceUrl": "<printed by video:new>", "durationSec": 8.011, "label": "IMG_1.mov" },
    { "sourceUrl": "<printed by video:new>", "durationSec": 5.4,   "label": "IMG_2.mov" }
  ],
  "fps": 30, "width": 1080, "height": 1920,   // the shared canvas

  // The cut list AND the running order. Each entry is a kept range of one clip, in
  // that clip's own seconds. [] plays every clip in full, in order. A clip may
  // appear more than once, and reordering this reorders the video.
  "segments": [
    { "clip": 0, "fromSec": 0,   "toSec": 3.5 },
    { "clip": 1, "fromSec": 1.2, "toSec": 4.0 },
    { "clip": 0, "fromSec": 6.0, "toSec": 8.0 }
  ],

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
