"use client";

import type { PlayerRef } from "@remotion/player";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Bi } from "@/components/Bi";
import { Button } from "@/components/Button";
import { PlayerShell } from "@/components/PlayerShell";
import { Timeline } from "@/components/Timeline";
import { Check, Download, Pin, Plus, Spinner, Trash } from "@/components/icons";
import { useCurrentPlayerFrame } from "@/hooks/useCurrentPlayerFrame";
import { formatTime, t } from "@/lib/i18n";
import { finalDurationSec, unansweredRounds, type Project } from "@/lib/schema";

/** A comment written but not yet sent. */
type Draft = { id: string; timeSec: number; text: string };

/** How often to check whether Claude has posted a new version. */
const POLL_MS = 6000;

export function ReviewClient({ initialProject }: { initialProject: Project }) {
  const [project, setProject] = useState(initialProject);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [composerAt, setComposerAt] = useState<number | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<"submit" | "done" | null>(null);
  const [justSent, setJustSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const playerRef = useRef<PlayerRef>(null);
  const frame = useCurrentPlayerFrame(playerRef);

  const fps = project.video.fps;
  const currentSec = frame / fps;
  const durationSec = useMemo(
    () => (project.edits ? finalDurationSec(project.edits) : 0),
    [project.edits],
  );

  const refresh = useCallback(async () => {
    const response = await fetch(`/api/v/${project.token}`, { cache: "no-store" });
    if (!response.ok) return;
    const next = (await response.json()) as Project;
    setProject((prev) => (next.version !== prev.version || next.status !== prev.status ? next : prev));
    return next;
  }, [project.token]);

  /**
   * Polls so the client never reloads. This is what makes the loop feel automatic
   * from his side: he tells Claude in chat, and a moment later this page is showing
   * the new cut. Stops once the final video exists, since nothing more will change.
   */
  useEffect(() => {
    if (project.status === "done") return;
    const timer = setInterval(() => {
      void refresh().then((next) => {
        // A new version means Claude answered; drop the "sent" acknowledgement so
        // he sees the video rather than an instruction he has already followed.
        if (next && next.version !== project.version) setJustSent(false);
      });
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [project.status, project.version, refresh]);

  const seek = useCallback((sec: number) => playerRef.current?.seekTo(Math.round(sec * fps)), [fps]);

  const openComposer = useCallback(() => {
    playerRef.current?.pause();
    setComposerAt(currentSec);
    setText("");
  }, [currentSec]);

  const saveDraft = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || composerAt === null) return;
    setDrafts((prev) =>
      [...prev, { id: crypto.randomUUID(), timeSec: composerAt, text: trimmed }].sort(
        (a, b) => a.timeSec - b.timeSec,
      ),
    );
    setComposerAt(null);
    setText("");
  }, [composerAt, text]);

  const submit = useCallback(async () => {
    if (drafts.length === 0) return;
    setBusy("submit");
    setError(null);
    try {
      const response = await fetch(`/api/v/${project.token}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          comments: drafts.map((d) => ({ timeSec: d.timeSec, text: d.text })),
        }),
      });
      if (!response.ok) {
        throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${response.status}`);
      }
      setDrafts([]);
      setJustSent(true);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  }, [drafts, project.token, refresh]);

  const markDone = useCallback(async () => {
    setBusy("done");
    setError(null);
    try {
      const response = await fetch(`/api/v/${project.token}/done`, { method: "POST" });
      if (!response.ok && response.status !== 200) {
        throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${response.status}`);
      }
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(null);
    }
  }, [project.token, refresh]);

  const pendingRounds = unansweredRounds(project);
  // Commenting is offered only when it is genuinely his turn: a cut exists, Claude
  // is not mid-edit, and he has not already said he is happy with it.
  const canComment =
    Boolean(project.edits) &&
    project.status !== "done" &&
    pendingRounds.length === 0 &&
    !project.awaitingFinal;
  const answeredRounds = project.rounds.filter((r) => r.round <= project.answeredRounds);

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <h1 className="min-w-0 flex-1 truncate text-base font-bold">{project.title}</h1>
        {project.status === "claude_working" ? (
          <span className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-amber">
            <Spinner size={14} className="animate-spin" />
            {t.status.claude_working.ar}
          </span>
        ) : null}
      </header>

      {project.edits ? (
        <>
          {/*
            dir="ltr" is required, not cosmetic. The Player's control bar is laid
            out with flex, so under the page's RTL direction it renders mirrored
            — "0:00 / 0:12" reads as "0:12 / 0:00" — and its scaler mis-positions
            the frame. Video controls run left-to-right everywhere the client
            already watches video, so this matches habit too.
          */}
          <div dir="ltr" className="flex w-full justify-center overflow-hidden bg-black">
            <div
              style={{
                width: "100%",
                maxWidth: `calc(58dvh * ${project.video.width} / ${project.video.height})`,
              }}
            >
              <PlayerShell edits={project.edits} playerRef={playerRef} />
            </div>
          </div>

          <div className="border-b border-line px-3 pb-2 pt-1">
            <Timeline currentSec={currentSec} durationSec={durationSec} pins={drafts} onSeek={seek} />
          </div>
        </>
      ) : (
        <div className="flex flex-1 items-center justify-center gap-3 p-10 text-ink-dim">
          <Spinner className="animate-spin" />
          <Bi label={t.status.preparing} className="text-sm font-semibold" />
        </div>
      )}

      <div className="flex flex-1 flex-col gap-4 p-4">
        {project.status === "done" && project.finalUrl ? (
          <a
            href={project.finalUrl}
            download
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-mint px-4 font-semibold text-canvas shadow-lift transition-colors hover:bg-mint/90"
          >
            <Download />
            <Bi label={t.download} />
          </a>
        ) : null}

        {/* The one instruction that hands the loop back to the chat. */}
        {justSent || (project.status === "claude_working" && pendingRounds.length > 0) ? (
          <Handoff title={t.sentTitle} body={t.sentBody} />
        ) : null}

        {project.awaitingFinal ? <Handoff title={t.doneTitle} body={t.doneBody} /> : null}

        {canComment && composerAt === null ? (
          <Button variant="secondary" icon={<Plus />} onClick={openComposer} className="w-full">
            <span className="flex items-baseline gap-2">
              <Bi label={t.addComment} />
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
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={`${t.commentPlaceholder.ar} · ${t.commentPlaceholder.fr}`}
              className="w-full resize-none rounded-lg border border-line bg-canvas p-3 placeholder:text-ink-faint focus:border-amber focus:outline-none"
            />
            <div className="mt-2 flex gap-2">
              <Button variant="primary" onClick={saveDraft} disabled={!text.trim()} className="flex-1">
                <Bi label={t.save} />
              </Button>
              <Button variant="ghost" onClick={() => setComposerAt(null)}>
                <Bi label={t.cancel} />
              </Button>
            </div>
          </div>
        ) : null}

        {drafts.length > 0 ? (
          <section>
            <h2 className="mb-2 flex items-center gap-2 text-sm font-bold">
              <Bi label={t.pending} />
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
                    aria-label={`${formatTime(draft.timeSec)}`}
                    className="flex shrink-0 items-center gap-1.5 rounded-md bg-amber-soft px-2 py-1 text-xs font-bold tabular-nums text-amber transition-colors hover:bg-amber/20"
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
                    aria-label={t.remove.fr}
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
            <Bi label={t.noPending} />
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="rounded-xl border border-rose/40 bg-rose-soft p-3 text-sm text-rose">
            {error}
          </p>
        ) : null}

        {drafts.length > 0 ? (
          <Button variant="primary" loading={busy === "submit"} onClick={submit} className="w-full">
            <Bi label={t.submit} />
            <span className="tabular-nums">({drafts.length})</span>
          </Button>
        ) : null}

        {canComment && drafts.length === 0 && composerAt === null ? (
          <Button
            variant="secondary"
            icon={<Check />}
            loading={busy === "done"}
            onClick={markDone}
            className="w-full"
          >
            <Bi label={t.done} />
          </Button>
        ) : null}

        {project.note ? (
          <p className="rounded-xl border border-mint/25 bg-mint-soft p-3 text-sm">
            <span className="mb-1 block text-xs font-bold text-mint">{t.claudeNote.ar}</span>
            <span dir="auto">{project.note}</span>
          </p>
        ) : null}

        {answeredRounds.length > 0 ? (
          <details className="mt-2 border-t border-line pt-4">
            <summary className="cursor-pointer text-sm font-bold text-ink-dim">
              <Bi label={t.history} />
            </summary>
            <ol className="mt-3 flex flex-col gap-3">
              {[...answeredRounds].reverse().map((round) => (
                <li key={round.round} className="rounded-xl border border-line bg-surface p-3">
                  <div className="mb-2 flex items-center gap-2 text-xs">
                    <span className="font-bold text-ink-dim">
                      {t.round.ar} {round.round}
                    </span>
                    <span className="rounded-full bg-mint-soft px-2 py-0.5 font-semibold text-mint">
                      {t.applied.ar}
                    </span>
                  </div>
                  <ul className="flex flex-col gap-1.5">
                    {round.comments.map((comment) => (
                      <li key={comment.id} className="flex items-start gap-2 text-sm">
                        <button
                          type="button"
                          onClick={() => seek(comment.timeSec)}
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
              ))}
            </ol>
          </details>
        ) : null}
      </div>
    </main>
  );
}

/**
 * Tells the client to go back to the chat. This is the seam in the loop that
 * cannot be automated away — the page has no way to speak to the Claude
 * conversation, so it says plainly what to type.
 */
function Handoff({ title, body }: { title: { ar: string; fr: string }; body: { ar: string; fr: string } }) {
  return (
    <div className="rounded-xl border border-amber/35 bg-amber-soft p-4">
      <p className="mb-1.5 text-sm font-bold text-amber">
        <Bi label={title} />
      </p>
      <p className="text-sm leading-relaxed text-ink">
        <span dir="rtl" className="block">
          {body.ar}
        </span>
        <span dir="ltr" className="mt-1.5 block text-[0.85em] text-ink-dim">
          {body.fr}
        </span>
      </p>
    </div>
  );
}
