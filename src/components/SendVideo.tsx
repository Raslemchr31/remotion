"use client";

import { upload } from "@vercel/blob/client";
import { useRef, useState } from "react";

import { Bi } from "@/components/Bi";
import { Button } from "@/components/Button";
import { Check, Film, Upload, Warning } from "@/components/icons";

/**
 * One tap: pick a video, it goes straight to storage, a short code comes back.
 *
 * Deliberately not a form. The only thing the client does here is choose a file —
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
  pick: { ar: "اختر فيديو من هاتفك", fr: "Choisir une vidéo depuis votre téléphone" },
  change: { ar: "تغيير", fr: "Changer" },
  send: { ar: "أرسل الفيديو", fr: "Envoyer la vidéo" },
  sending: { ar: "جاري الإرسال…", fr: "Envoi…" },
  sentTitle: { ar: "تم إرسال الفيديو", fr: "Vidéo envoyée" },
  codeLabel: { ar: "رمز الفيديو", fr: "Code de la vidéo" },
  sentBody: {
    ar: "ارجع إلى Claude وقل: «الفيديو رمزه ______ ، أضف ترجمة عربية والشعار».",
    fr: "Retournez dans Claude et dites : « la vidéo, code ______ , ajoute les sous-titres arabes et le logo ».",
  },
  another: { ar: "أرسل فيديو آخر", fr: "Envoyer une autre vidéo" },
  wrongType: { ar: "هذا الملف ليس فيديو", fr: "Ce fichier n'est pas une vidéo" },
  tooLarge: { ar: "الفيديو كبير جداً", fr: "Vidéo trop lourde" },
} as const;

export function SendVideo({ intakeKey }: { intakeKey: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [percent, setPercent] = useState(0);
  const [phase, setPhase] = useState<"idle" | "sending" | "sent">("idle");
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!file) return;
    setPhase("sending");
    setPercent(0);
    setError(null);
    try {
      const blob = await upload(`intake/${Date.now()}-${file.name}`, file, {
        access: "public",
        handleUploadUrl: "/api/intake",
        contentType: contentTypeFor(file),
        multipart: true,
        clientPayload: intakeKey,
        onUploadProgress: ({ percentage }) => setPercent(percentage),
      });

      const response = await fetch("/api/intake", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: intakeKey,
          url: blob.url,
          filename: file.name,
          sizeBytes: file.size,
        }),
      });
      const payload = (await response.json().catch(() => ({}))) as { code?: string; error?: string };
      if (!response.ok || !payload.code) {
        throw new Error(payload.error ?? `HTTP ${response.status}`);
      }
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
            setFile(null);
            setCode(null);
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

  return (
    <div className="flex flex-col gap-5">
      <input
        ref={input}
        type="file"
        accept="video/*"
        className="sr-only"
        onChange={(event) => {
          const picked = event.target.files?.[0] ?? null;
          if (!picked) return setFile(null);
          if (!looksLikeVideo(picked)) {
            setError(`${COPY.wrongType.ar} · ${COPY.wrongType.fr}`);
            return setFile(null);
          }
          if (picked.size > MAX_BYTES) {
            setError(`${COPY.tooLarge.ar} · ${COPY.tooLarge.fr}`);
            return setFile(null);
          }
          setError(null);
          setFile(picked);
        }}
      />

      <button
        type="button"
        disabled={phase === "sending"}
        onClick={() => input.current?.click()}
        className="flex w-full flex-col items-center gap-3 rounded-2xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center transition-colors hover:border-amber/60 hover:bg-raised disabled:pointer-events-none disabled:opacity-50"
      >
        <span className={file ? "text-amber" : "text-ink-faint"}>
          {file ? <Film size={34} /> : <Upload size={34} />}
        </span>
        {file ? (
          <>
            <span dir="ltr" className="max-w-full truncate text-sm font-semibold">
              {file.name}
            </span>
            <span className="text-xs tabular-nums text-ink-dim">
              {(file.size / 1_000_000).toFixed(1)} MB
            </span>
            <span className="text-xs text-amber">
              <Bi label={COPY.change} />
            </span>
          </>
        ) : (
          <Bi label={COPY.pick} className="text-sm font-semibold" />
        )}
      </button>

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

      {phase === "sending" ? (
        <div>
          <div className="mb-1.5 flex justify-between text-xs">
            <Bi label={COPY.sending} className="font-semibold" />
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
        variant="primary"
        icon={phase === "sending" ? undefined : <Upload />}
        loading={phase === "sending"}
        disabled={!file}
        onClick={send}
        className="w-full"
      >
        <Bi label={phase === "sending" ? COPY.sending : COPY.send} />
      </Button>
    </div>
  );
}
