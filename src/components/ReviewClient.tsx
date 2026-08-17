"use client";

import type { PlayerRef } from "@remotion/player";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Bi } from "@/components/Bi";
import { Button } from "@/components/Button";
import { PlayerShell } from "@/components/PlayerShell";
import { StatusBanner } from "@/components/StatusBanner";
import { Timeline } from "@/components/Timeline";
import { Check, Download, Pin, Plus, Trash } from "@/components/icons";
import { useCurrentPlayerFrame } from "@/hooks/useCurrentPlayerFrame";
import { formatTime, t } from "@/lib/i18n";
import { finalDurationSec, type Project } from "@/lib/schema";

/** A comment the client has written but not yet submitted. */
type Draft = { id: string; timeSec: number; text: string };

/** How often to re-check whether Claude has posted a new version. */
const POLL_MS = 8000;

export function ReviewClient({
  initialProject,
  reviewKey,
}: {
  initialProject: Project;
  reviewKey: string;
}) {
  const [project, setProject] = useState(initialProject);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [composerAt, setComposerAt] = useState<number | null>(null);
  const [composerText, setComposerText] = useState("");
  const [busy, setBusy] = useState<"submit" | "approve" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const playerRef = useRef<PlayerRef>(null);
  const frame = useCurrentPlayerFrame(playerRef);

  const fps = project.edits?.fps ?? 30;
  const currentSec = frame / fps;
  const durationSec = useMemo(
    () => (project.edits ? finalDurationSec(project.edits) : 0),
    [project.edits],
  );

  /**
   * Polls for a newer version so the client never has to reload. This is the
   * mechanism that makes the loop feel automatic from his side: he submits, and
   * a minute later the page is showing Claude's answer.
   *
   * Stops once the video is finished — there is nothing left to wait for.
   */
  useEffect(() => {
    if (project.status === "done") return;

    let cancelled = false;
    const tick = async () => {
      try {
        const response = await fetch(
          `/api/projects/${project.id}?key=${encodeURIComponent(reviewKey)}`,
          { cache: "no-store" },
        );
        if (!response.ok || cancelled) return;
        const next = (await response.json()) as Project;
        if (cancelled) return;

        setProject((prev) => {
          // A new version means Claude answered; the drafts the client was
          // holding were about the old cut, but discarding them silently would
          // lose his typing. They are kept, and the version badge changes so he
          // can see the picture moved underneath them.
          if (next.editsVersion !== prev.editsVersion || next.status !== prev.status) return next;
          return prev;
        });
      } catch {
        // A failed poll is not worth surfacing; the next one is 8 seconds away.
      }
    };

    const timer = setInterval(tick, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [project.id, project.status, reviewKey]);

  const seek = useCallback(
    (sec: number) => {
      playerRef.current?.seekTo(Math.round(sec * fps));
    },
    [fps],
  );

  const openComposer = useCallback(() => {
    playerRef.current?.pause();
    setComposerAt(playerRef.current?.getCurrentFrame() ? frame / fps : currentSec);
    setComposerText("");
  }, [currentSec, fps, frame]);

  const saveDraft = useCallback(() => {
    const text = composerText.trim();
    if (!text || composerAt === null) return;
    setDrafts((prev) =>
      [...prev, { id: crypto.randomUUID(), timeSec: composerAt, text }].sort(
        (a, b) => a.timeSec - b.timeSec,
      ),
    );
    setComposerAt(null);
    setComposerText("");
  }, [composerAt, composerText]);

  const submit = useCallback(async () => {
    if (drafts.length === 0) return;
    setBusy("submit");
    setError(null);
    try {
      const response = await fetch(
        `/api/projects/${project.id}/comments?key=${encodeURIComponent(reviewKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            comments: drafts.map((d) => ({ timeSec: d.timeSec, text: d.text })),
          }),
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }
      setDrafts([]);
      const fresh = await fetch(
        `/api/projects/${project.id}?key=${encodeURIComponent(reviewKey)}`,
        { cache: "no-store" },
      );
      if (fresh.ok) setProject((await fresh.json()) as Project);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  }, [drafts, project.id, reviewKey]);

  const approve = useCallback(async () => {
    setBusy("approve");
    setError(null);
    try {
      const response = await fetch(
        `/api/projects/${project.id}/approve?key=${encodeURIComponent(reviewKey)}`,
        { method: "POST" },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${response.status}`);
      }
      const fresh = await fetch(
        `/api/projects/${project.id}?key=${encodeURIComponent(reviewKey)}`,
        { cache: "no-store" },
      );
      if (fresh.ok) setProject((await fresh.json()) as Project);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  }, [project.id, reviewKey]);

  const canComment = Boolean(project.edits) && project.status !== "rendering" && project.status !== "done";
  const unanswered = project.rounds.filter((r) => r.round > project.answeredRounds);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-canvas/95 px-4 py-3 backdrop-blur-sm">
        <h1 className="min-w-0 flex-1 truncate text-base font-bold">{project.title}</h1>
        {project.editsVersion ? (
          <span className="shrink-0 rounded-md border border-line bg-raised px-2 py-0.5 text-xs font-semibold tabular-nums text-ink-dim">
            v{project.editsVersion}
          </span>
        ) : null}
      </header>

      <StatusBanner project={project} />

      {project.edits ? (
        <>
          <div
            className="relative w-full overflow-hidden bg-black"
            style={{ aspectRatio: `${project.edits.width} / ${project.edits.height}`, maxHeight: "62dvh" }}
          >
            <PlayerShell edits={project.edits} playerRef={playerRef} />
          </div>

          <div className="border-b border-line px-3 pb-2 pt-1">
            <Timeline
              currentSec={currentSec}
              durationSec={durationSec}
              pins={drafts}
              onSeek={seek}
            />
          </div>
        </>
      ) : null}

      <div className="flex flex-1 flex-col gap-4 p-4">
        {canComment && composerAt === null ? (
          <Button variant="secondary" icon={<Plus />} onClick={openComposer} className="w-full">
            <span className="flex items-baseline gap-2">
              <Bi label={t.review.addComment} />
              <span className="tabular-nums text-amber">{formatTime(currentSec)}</span>
            </span>
          </Button>
        ) : null}

        {composerAt !== null ? (
          <div className="animate-pin-settle rounded-xl border border-amber/40 bg-surface p-3 shadow-lift">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber">
              <Pin size={14} />
              <span className="tabular-nums">{formatTime(composerAt)}</span>
            </div>
            <textarea
              autoFocus
              dir="auto"
              rows={3}
              value={composerText}
              onChange={(event) => setComposerText(event.target.value)}
              placeholder={`${t.review.commentPlaceholder.ar} · ${t.review.commentPlaceholder.fr}`}
              className="w-full resize-none rounded-lg border border-line bg-canvas p-3 text-ink placeholder:text-ink-faint focus:border-amber focus:outline-none"
            />
            <div className="mt-2 flex gap-2">
              <Button variant="primary" onClick={saveDraft} disabled={!composerText.trim()} className="flex-1">
                <Bi label={t.review.save} />
              </Button>
              <Button variant="ghost" onClick={() => setComposerAt(null)}>
                <Bi label={t.review.cancel} />
              </Button>
            </div>
          </div>
        ) : null}

        {drafts.length > 0 ? (
          <section>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-bold">
              <Bi label={t.review.pending} />
              <span className="rounded-full bg-amber-soft px-2 text-xs font-bold tabular-nums text-amber">
                {drafts.length}
              </span>
            </h2>
            <ul className="flex flex-col gap-2">
              {drafts.map((draft) => (
                <li
                  key={draft.id}
                  className="animate-pin-settle flex items-start gap-3 rounded-xl border border-line bg-surface p-3"
                >
                  <button
                    type="button"
                    onClick={() => seek(draft.timeSec)}
                    className="flex shrink-0 items-center gap-1.5 rounded-md bg-amber-soft px-2 py-1 text-xs font-bold tabular-nums text-amber transition-colors hover:bg-amber/20"
                    aria-label={`${t.review.jumpTo.fr} ${formatTime(draft.timeSec)}`}
                  >
                    <Pin size={12} />
                    {formatTime(draft.timeSec)}
                  </button>
                  <p dir="auto" className="min-w-0 flex-1 break-words text-sm">
                    {draft.text}
                  </p>
                  <button
                    type="button"
                    onClick={() => setDrafts((prev) => prev.filter((d) => d.id !== draft.id))}
                    aria-label={t.review.remove.fr}
                    className="shrink-0 rounded-md p-1 text-ink-faint transition-colors hover:bg-rose-soft hover:text-rose"
                  >
                    <Trash size={16} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : canComment && composerAt === null && project.rounds.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-ink-dim">
            <Bi label={t.review.noPending} />
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="rounded-xl border border-rose/40 bg-rose-soft p-3 text-sm text-rose">
            {error}
          </p>
        ) : null}

        {drafts.length > 0 ? (
          <Button variant="primary" loading={busy === "submit"} onClick={submit} className="w-full">
            <Bi label={t.review.submit} />
            <span className="tabular-nums">({drafts.length})</span>
          </Button>
        ) : null}

        {project.status === "in_review" && drafts.length === 0 ? (
          <Button variant="primary" icon={<Check />} loading={busy === "approve"} onClick={approve} className="w-full">
            <Bi label={t.review.approve} />
          </Button>
        ) : null}

        {project.status === "done" && project.renderUrl ? (
          <a
            href={project.renderUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-mint px-4 font-semibold text-canvas shadow-lift transition-colors hover:bg-mint/90"
          >
            <Download />
            <Bi label={t.review.download} />
          </a>
        ) : null}

        <History project={project} unansweredCount={unanswered.length} onSeek={seek} />
      </div>
    </main>
  );
}

/** Past rounds, so the client can see what he already asked for and what Claude said. */
function History({
  project,
  unansweredCount,
  onSeek,
}: {
  project: Project;
  unansweredCount: number;
  onSeek: (sec: number) => void;
}) {
  if (project.rounds.length === 0) return null;

  return (
    <section className="mt-2 border-t border-line pt-4">
      <h2 className="mb-3 text-sm font-bold text-ink-dim">
        <Bi label={t.review.history} />
      </h2>

      {project.claudeNote ? (
        <p className="mb-3 rounded-xl border border-mint/25 bg-mint-soft p-3 text-sm">
          <span className="mb-1 block text-xs font-bold text-mint">
            <Bi label={t.review.claudeNote} />
          </span>
          <span dir="auto">{project.claudeNote}</span>
        </p>
      ) : null}

      <ol className="flex flex-col gap-3">
        {[...project.rounds].reverse().map((round) => {
          const answered = round.round <= project.answeredRounds;
          return (
            <li key={round.round} className="rounded-xl border border-line bg-surface p-3">
              <div className="mb-2 flex items-center gap-2 text-xs">
                <span className="font-bold text-ink-dim">
                  {t.review.round.ar} {round.round}
                </span>
                <span
                  className={
                    answered
                      ? "rounded-full bg-mint-soft px-2 py-0.5 font-semibold text-mint"
                      : "rounded-full bg-amber-soft px-2 py-0.5 font-semibold text-amber"
                  }
                >
                  {answered ? t.review.applied.ar : t.review.waitingClaude.ar}
                </span>
              </div>
              <ul className="flex flex-col gap-1.5">
                {round.comments.map((comment) => (
                  <li key={comment.id} className="flex items-start gap-2 text-sm">
                    <button
                      type="button"
                      onClick={() => onSeek(comment.timeSec)}
                      className="shrink-0 tabular-nums text-xs font-bold text-ink-faint transition-colors hover:text-amber"
                    >
                      {formatTime(comment.timeSec)}
                    </button>
                    <span dir="auto" className="min-w-0 break-words text-ink-dim">
                      {comment.text}
                    </span>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>

      {unansweredCount > 0 ? (
        <p className="mt-3 text-center text-xs text-ink-faint">
          <Bi label={t.status.awaiting_edits} />
        </p>
      ) : null}
    </section>
  );
}
