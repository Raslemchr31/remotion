"use client";

import { upload } from "@vercel/blob/client";
import { useRef, useState } from "react";

import { Bi } from "@/components/Bi";
import { Button } from "@/components/Button";
import { Check, Plus, Trash, Upload, Warning } from "@/components/icons";

/**
 * Pick one or more clips, they go straight to storage, one short code comes back.
 *
 * Deliberately not a form. The only thing the client does here is choose files —
 * everything about what he wants changed he says to Claude, where he is already
 * talking. A title or brief field would just be a second place to type it.
 */

const MAX_BYTES = 2 * 1024 * 1024 * 1024;

const VIDEO_EXTENSIONS = ["mp4", "mov", "m4v", "mkv", "webm", "avi", "3gp", "mpeg", "mpg"];

/**
 * `file.type` comes from the OS association and is not reliable: a perfectly good
 * .mov arrives as "application/octet-stream" or as an empty string on some devices.
 * Rejecting on that alone turns a valid phone video into "this file is not a video",
 * which is exactly the class of failure this project exists to avoid — so the
 * extension is the fallback authority. (Observed in testing, not hypothetical.)
 */
function looksLikeVideo(file: File): boolean {
  if (file.type.startsWith("video/")) return true;
  const extension = file.name.split(".").pop()?.toLowerCase();
  return Boolean(extension && VIDEO_EXTENSIONS.includes(extension));
}

/** A concrete video content type, since the upload is rejected without one. */
function contentTypeFor(file: File): string {
  if (file.type.startsWith("video/")) return file.type;
  switch (file.name.split(".").pop()?.toLowerCase()) {
    case "mov":
    case "m4v":
      return "video/quicktime";
    case "mkv":
      return "video/x-matroska";
    case "webm":
      return "video/webm";
    case "avi":
      return "video/x-msvideo";
    case "3gp":
      return "video/3gpp";
    case "mpeg":
    case "mpg":
      return "video/mpeg";
    default:
      return "video/mp4";
  }
}

const COPY = {
  pick: { ar: "اختر فيديو أو أكثر من هاتفك", fr: "Choisir une ou plusieurs vidéos" },
  addMore: { ar: "أضف المزيد", fr: "Ajouter" },
  order: {
    ar: "هذا هو ترتيبها في الفيديو النهائي.",
    fr: "Cet ordre sera celui de la vidéo finale.",
  },
  send: { ar: "أرسل", fr: "Envoyer" },
  sending: { ar: "جاري الإرسال…", fr: "Envoi…" },
  sentTitle: { ar: "تم الإرسال", fr: "Envoyé" },
  clips: { ar: "مقاطع", fr: "clips" },
  codeLabel: { ar: "الرمز", fr: "Code" },
  sentBody: {
    ar: "ارجع إلى Claude وقل: «الرمز ______ ، نقّي الفيديو وزيد ترجمة عربية».",
    fr: "Retournez dans Claude et dites : « code ______ , nettoie la vidéo et ajoute les sous-titres ».",
  },
  another: { ar: "أرسل فيديوهات أخرى", fr: "Envoyer d'autres vidéos" },
  wrongType: { ar: "ليس فيديو", fr: "pas une vidéo" },
  tooLarge: { ar: "كبير جداً", fr: "trop lourd" },
} as const;

export function SendVideo({ intakeKey }: { intakeKey: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [doneCount, setDoneCount] = useState(0);
  const [percent, setPercent] = useState(0);
  const [phase, setPhase] = useState<"idle" | "sending" | "sent">("idle");
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function addFiles(picked: FileList | null) {
    if (!picked || picked.length === 0) return;
    const accepted: File[] = [];
    for (const file of Array.from(picked)) {
      if (!looksLikeVideo(file)) {
        setError(`${file.name} — ${COPY.wrongType.ar} · ${COPY.wrongType.fr}`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        setError(`${file.name} — ${COPY.tooLarge.ar} · ${COPY.tooLarge.fr}`);
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length > 0) {
      setError(null);
      // Appended rather than replaced, so he can gather clips from different albums
      // across several trips through the picker without losing the earlier ones.
      setFiles((prev) => [...prev, ...accepted]);
    }
  }

  async function send() {
    if (files.length === 0) return;
    setPhase("sending");
    setDoneCount(0);
    setPercent(0);
    setError(null);

    try {
      const uploaded: { url: string; filename: string; sizeBytes: number }[] = [];

      // Sequential on purpose: parallel uploads share one phone uplink, so each gets
      // slower and the progress bar stops meaning anything. One at a time means a
      // clip that shows as finished really is finished.
      for (const [index, file] of files.entries()) {
        const blob = await upload(`intake/${Date.now()}-${index}-${file.name}`, file, {
          access: "public",
          handleUploadUrl: "/api/intake",
          contentType: contentTypeFor(file),
          multipart: true,
          clientPayload: intakeKey,
          onUploadProgress: ({ percentage }) => setPercent(percentage),
        });
        uploaded.push({ url: blob.url, filename: file.name, sizeBytes: file.size });
        setDoneCount(index + 1);
      }

      const response = await fetch("/api/intake", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: intakeKey, files: uploaded }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        code?: string;
        error?: string;
      };
      if (!response.ok || !payload.code) throw new Error(payload.error ?? `HTTP ${response.status}`);

      setCode(payload.code);
      setPhase("sent");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setPhase("idle");
    }
  }

  if (phase === "sent" && code) {
    return (
      <div className="flex flex-col gap-5">
        <div className="rounded-xl border border-mint/35 bg-mint-soft p-4 text-center">
          <p className="mb-3 flex items-center justify-center gap-2 text-sm font-bold text-mint">
            <Check size={16} />
            <Bi label={COPY.sentTitle} />
            <span className="tabular-nums">
              {files.length} {COPY.clips.fr}
            </span>
          </p>

          <p className="text-xs font-semibold text-ink-dim">
            <Bi label={COPY.codeLabel} />
          </p>
          {/* The code is the whole point of this screen, so it is the biggest thing on it. */}
          <p
            dir="ltr"
            className="my-2 select-all font-mono text-4xl font-bold tracking-[0.2em] text-mint"
          >
            {code}
          </p>
        </div>

        <p className="text-sm leading-relaxed">
          <span dir="rtl" className="block">
            {COPY.sentBody.ar.replace("______", code)}
          </span>
          <span dir="ltr" className="mt-1.5 block text-[0.85em] text-ink-dim">
            {COPY.sentBody.fr.replace("______", code)}
          </span>
        </p>

        <Button
          variant="secondary"
          onClick={() => {
            setFiles([]);
            setCode(null);
            setDoneCount(0);
            setPercent(0);
            setPhase("idle");
          }}
          className="w-full"
        >
          <Bi label={COPY.another} />
        </Button>
      </div>
    );
  }

  const busy = phase === "sending";

  return (
    <div className="flex flex-col gap-5">
      <input
        ref={input}
        type="file"
        accept="video/*"
        multiple
        className="sr-only"
        onChange={(event) => {
          addFiles(event.target.files);
          // Cleared so picking the same file again still fires a change event.
          event.target.value = "";
        }}
      />

      {files.length === 0 ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
          className="flex w-full flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center transition-colors hover:border-amber/60 hover:bg-raised disabled:pointer-events-none disabled:opacity-50"
        >
          <span className="text-ink-faint">
            <Upload size={34} />
          </span>
          <Bi label={COPY.pick} className="text-sm font-semibold" />
        </button>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-ink-dim">
            <Bi label={COPY.order} />
          </p>
          <ol className="flex flex-col gap-2">
            {files.map((file, index) => (
              <li
                key={`${file.name}-${index}`}
                className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3"
              >
                <span
                  className={
                    busy && index < doneCount
                      ? "flex size-7 shrink-0 items-center justify-center rounded-full bg-mint-soft text-mint"
                      : "flex size-7 shrink-0 items-center justify-center rounded-full bg-raised text-xs font-bold tabular-nums text-ink-dim"
                  }
                >
                  {busy && index < doneCount ? <Check size={14} /> : index + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span dir="ltr" className="block truncate text-sm font-semibold">
                    {file.name}
                  </span>
                  <span className="text-xs tabular-nums text-ink-dim">
                    {(file.size / 1_000_000).toFixed(1)} MB
                  </span>
                </span>
                {!busy ? (
                  <button
                    type="button"
                    aria-label="remove"
                    onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}
                    className="shrink-0 rounded-md p-1 text-ink-faint transition-colors hover:bg-rose-soft hover:text-rose"
                  >
                    <Trash size={16} />
                  </button>
                ) : null}
              </li>
            ))}
          </ol>

          {!busy ? (
            <Button variant="ghost" icon={<Plus />} onClick={() => input.current?.click()}>
              <Bi label={COPY.addMore} />
            </Button>
          ) : null}
        </div>
      )}

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

      {busy ? (
        <div>
          <div className="mb-1.5 flex justify-between text-xs">
            <Bi label={COPY.sending} className="font-semibold" />
            <span className="tabular-nums text-amber">
              {Math.min(doneCount + 1, files.length)}/{files.length} · {percent.toFixed(0)}%
            </span>
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
        variant="primary"
        icon={busy ? undefined : <Upload />}
        loading={busy}
        disabled={files.length === 0}
        onClick={send}
        className="w-full"
      >
        <Bi label={busy ? COPY.sending : COPY.send} />
        {!busy && files.length > 0 ? <span className="tabular-nums">({files.length})</span> : null}
      </Button>
    </div>
  );
}
