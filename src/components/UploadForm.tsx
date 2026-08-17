"use client";

import { upload } from "@vercel/blob/client";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

import { Bi } from "@/components/Bi";
import { Button } from "@/components/Button";
import { Film, Upload, Warning } from "@/components/icons";
import { t } from "@/lib/i18n";

const MAX_BYTES = 1024 * 1024 * 1024; // 1 GB, matching the token route's ceiling.

type Phase = "idle" | "uploading" | "creating";

export function UploadForm({ reviewKey }: { reviewKey: string }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [percent, setPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const busy = phase !== "idle";

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) {
      setError(`${t.upload.needFile.ar} · ${t.upload.needFile.fr}`);
      return;
    }
    setError(null);
    setPhase("uploading");
    setPercent(0);

    try {
      // Straight from the phone to Blob storage. Routing a phone video through a
      // Vercel function would hit the 4.5 MB request body limit immediately.
      const blob = await upload(`incoming/${Date.now()}-${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/upload",
        contentType: file.type || "video/mp4",
        multipart: true,
        // The token route cannot see the page's query string, so the key rides
        // along here and is validated before a token is issued.
        clientPayload: reviewKey,
        onUploadProgress: ({ percentage }) => setPercent(percentage),
      });

      setPhase("creating");
      const response = await fetch(`/api/projects?key=${encodeURIComponent(reviewKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || file.name,
          brief: brief.trim(),
          originalUrl: blob.url,
          originalFilename: file.name,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }
      const { id } = (await response.json()) as { id: string };
      router.push(`/review/${id}?key=${encodeURIComponent(reviewKey)}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setPhase("idle");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      <div>
        <input
          ref={fileInput}
          type="file"
          accept="video/*"
          className="sr-only"
          onChange={(event) => {
            const picked = event.target.files?.[0] ?? null;
            if (!picked) return setFile(null);
            if (!picked.type.startsWith("video/")) {
              setError(`${t.upload.wrongType.ar} · ${t.upload.wrongType.fr}`);
              return setFile(null);
            }
            if (picked.size > MAX_BYTES) {
              setError(`${t.upload.tooLarge.ar} · ${t.upload.tooLarge.fr}`);
              return setFile(null);
            }
            setError(null);
            setFile(picked);
            if (!title) setTitle(picked.name.replace(/\.[^.]+$/, ""));
          }}
        />

        <button
          type="button"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
          className="flex w-full flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-10 text-center transition-colors hover:border-amber/60 hover:bg-raised disabled:pointer-events-none disabled:opacity-50"
        >
          <span className={file ? "text-amber" : "text-ink-faint"}>
            {file ? <Film size={32} /> : <Upload size={32} />}
          </span>
          {file ? (
            <>
              <span dir="ltr" className="max-w-full truncate text-sm font-semibold">
                {file.name}
              </span>
              <span className="text-xs text-ink-dim tabular-nums">
                {(file.size / 1_000_000).toFixed(1)} MB
              </span>
              <span className="text-xs text-amber">
                <Bi label={t.upload.changeFile} />
              </span>
            </>
          ) : (
            <Bi label={t.upload.pickFile} className="text-sm font-semibold" />
          )}
        </button>
      </div>

      <label className="flex flex-col gap-1.5">
        <Bi label={t.upload.projectTitle} className="text-sm font-semibold" />
        <input
          type="text"
          dir="auto"
          value={title}
          disabled={busy}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t.upload.projectTitlePlaceholder.ar}
          className="min-h-11 rounded-xl border border-line bg-surface px-3 placeholder:text-ink-faint focus:border-amber focus:outline-none disabled:opacity-50"
        />
      </label>

      <label className="flex flex-col gap-1.5">
        <Bi label={t.upload.brief} className="text-sm font-semibold" />
        <textarea
          dir="auto"
          rows={4}
          value={brief}
          disabled={busy}
          onChange={(event) => setBrief(event.target.value)}
          placeholder={t.upload.briefPlaceholder.ar}
          className="resize-none rounded-xl border border-line bg-surface p-3 placeholder:text-ink-faint focus:border-amber focus:outline-none disabled:opacity-50"
        />
      </label>

      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-rose/40 bg-rose-soft p-3 text-sm text-rose"
        >
          <span className="mt-0.5 shrink-0">
            <Warning size={16} />
          </span>
          <span dir="auto" className="min-w-0 break-words">
            {error}
          </span>
        </p>
      ) : null}

      {phase === "uploading" ? (
        <div>
          <div className="mb-1.5 flex justify-between text-xs">
            <Bi label={t.upload.uploading} className="font-semibold" />
            <span className="tabular-nums text-amber">{percent.toFixed(0)}%</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-line">
            <div
              className="h-full rounded-full bg-amber transition-[width] duration-300 ease-out"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      ) : null}

      <Button
        type="submit"
        variant="primary"
        loading={busy}
        disabled={!file}
        icon={busy ? undefined : <Upload />}
        className="w-full"
      >
        <Bi label={phase === "creating" ? t.upload.processing : t.upload.submit} />
      </Button>
    </form>
  );
}
