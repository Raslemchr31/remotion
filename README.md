# Video review loop

A client uploads a video from his phone, Claude edits it with Remotion, the client
leaves comments pinned to timestamps and presses Submit, Claude applies them, and
when the client approves he gets a rendered MP4. Everything he touches is a web
page on his phone.

Live: https://video-review-lac.vercel.app

## Why it is built this way

**The preview never renders.** The review page runs the same Remotion composition
through `@remotion/player`, so a new version appears in seconds instead of minutes.
The only renders are one transcode per upload and one final MP4 per approval, both
in GitHub Actions.

**Uploads are transcoded before anyone sees them.** This is the fix for the
original failure, where the workflow worked on a PC but not on the client's phone:
iPhone recordings are HEVC in a `.mov` container and do not decode in mobile
browsers. Every upload is converted to H.264/AAC at a constant 30fps first, and
probed with ffprobe for the duration, fps and dimensions everything downstream
depends on.

**Storage has no database and no mutable records.** A project is a set of
write-once JSON documents in Vercel Blob, each written by exactly one author
(the upload route, the normalize workflow, Claude, the client, the render
workflow). Status is derived from which documents exist rather than stored, so
Claude posting edits while the client submits comments cannot lose either write.
Documents are never overwritten because Blob's `cacheControlMaxAge` floor is 60
seconds — a mutable record at a stable path could serve a minute of stale reads.

## Architecture

```
 phone ──upload──▶ Vercel Blob            (client token; the file never
   │                                       passes through a function)
   │                    │
   │              normalize.yml  ──▶ H.264/AAC + ffprobe ──▶ source.json
   │                    │
   ├──review page◀── Next.js app ◀──reads/writes── Blob documents
   │   @remotion/player                                  ▲
   │   comments + Submit                                 │
   │                                                POST edits
   └──Approve──▶ render.yml ──▶ remotion render ──▶ final MP4
                                                         │
                                                    Claude (any device,
                                                    polls the API)
```

## Setup

Everything below is already done for this deployment except the two steps marked
**TODO**.

### 1. Vercel

```bash
vercel link --yes --project video-review
vercel blob create-store video-review --access public --region iad1 --yes
vercel env pull .env.local     # brings down BLOB_READ_WRITE_TOKEN
```

Generate the three secrets and set them on the project:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"  # REVIEW_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"  # AGENT_API_KEY
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"  # CI_API_KEY

vercel env add REVIEW_KEY production --value "..." --force --yes
# ...and the same for AGENT_API_KEY, CI_API_KEY, GITHUB_REPO, GITHUB_REF_NAME, GITHUB_TOKEN
```

| Variable | Used for |
|---|---|
| `BLOB_READ_WRITE_TOKEN` | all Blob reads and writes |
| `REVIEW_KEY` | the secret in the client's links (`?key=...`) |
| `AGENT_API_KEY` | Claude's `x-api-key` when posting edits |
| `CI_API_KEY` | the workflows' `x-api-key` when reporting results |
| `GITHUB_REPO` | `Raslemchr31/remotion` |
| `GITHUB_REF_NAME` | `main` |
| `GITHUB_TOKEN` | dispatching the workflows |

### 2. TODO — allow pushing the workflow files

The GitHub CLI token lacks the `workflow` scope, so `.github/workflows/*.yml`
cannot be pushed. Run once:

```bash
gh auth refresh -h github.com -s workflow
git push -u origin main
```

### 3. TODO — GitHub repository secrets

The workflows need three secrets. After the push above:

```bash
gh secret set APP_URL               --body "https://video-review-lac.vercel.app"
gh secret set CI_API_KEY            --body "$(grep '^CI_API_KEY=' .env.local | cut -d= -f2)"
gh secret set BLOB_READ_WRITE_TOKEN --body "$(grep '^BLOB_READ_WRITE_TOKEN=' .env.local | cut -d= -f2 | tr -d '\"')"
```

### 4. Replace the GitHub token

`GITHUB_TOKEN` currently holds the GitHub CLI's OAuth token, which grants access to
every repository on the account. Replace it with a fine-grained personal access
token scoped to this repository alone, with **Actions: read and write** and
**Metadata: read**:

```bash
vercel env add GITHUB_TOKEN production --value "github_pat_..." --force --yes
```

## Using it

Send the client one link — the home screen with the review key:

```
https://video-review-lac.vercel.app/?key=<REVIEW_KEY>
```

From there he uploads, and every project link carries the key. Anyone with the
link can view and comment, so treat it as the password it is.

Claude drives its side through the API documented in `CLAUDE.md`.

## Development

```bash
npm install
vercel env pull .env.local
npm run dev            # the app at localhost:3000
npm run studio         # Remotion Studio with public/sample.mp4
npm run typecheck
npm run render         # render the sample composition to out/
```

`scripts/seed-test-project.mjs` uploads a local file and creates a project without
a browser, and `scripts/normalize.mjs` / `scripts/render.mjs` are the same scripts
CI runs, so both can be run by hand against the deployed app:

```bash
APP_URL=https://video-review-lac.vercel.app node scripts/normalize.mjs <projectId>
```

## Costs and limits

- **Remotion licence.** Free for individuals and for-profit companies with up to
  three employees, which covers this deployment. At four or more people, automated
  rendering falls under "Remotion for Automators" — $0.01 per render, $100/month
  minimum.
- **GitHub Actions.** A private repository includes 2000 free minutes per month.
  Normalization takes roughly 2–5 minutes and a final render 5–15, so a few dozen
  videos a month fit comfortably.
- **Vercel Blob.** Hobby usage is free within limits, but exceeding them locks the
  store for 30 days rather than billing overage. Blobs over 512 MB are never
  CDN-cached, so a long final video costs origin transfer on every view.

## Known constraints

- `next/font/google` is not used: its bundled manifest points at Cairo woff2 URLs
  Google has rotated away, which 404 and fail the build. Cairo is self-hosted in
  `public/fonts/` and declared in `src/app/globals.css`.
- Comment timestamps are on the final timeline (intro + trimmed body + outro), not
  on the source video. `trims` are the one field in source seconds.
- There is no authentication beyond the link secrets. That is deliberate for a
  single-client tool; it is not suitable for multiple clients as-is.
