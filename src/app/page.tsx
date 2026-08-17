import Link from "next/link";

import { Bi } from "@/components/Bi";
import { ArrowBack, Film, Plus, Warning } from "@/components/icons";
import { isValidReviewKey } from "@/lib/auth";
import { firstValue, type SearchParams } from "@/lib/route-types";
import { formatTime, t } from "@/lib/i18n";
import { finalDurationSec, type Project, type ProjectStatus } from "@/lib/schema";
import { listProjects } from "@/lib/store";

/**
 * Never prerendered. This page reads live Blob state and a secret from the query
 * string, so a build-time snapshot would both fail (no request to take the key
 * from) and be wrong the moment a project changed.
 */
export const dynamic = "force-dynamic";

/** Status colour, so the list scans without reading a word of it. */
const TONE: Record<ProjectStatus, string> = {
  normalizing: "text-amber",
  awaiting_first_edit: "text-amber",
  in_review: "text-ink",
  awaiting_edits: "text-amber",
  rendering: "text-amber",
  done: "text-mint",
  render_failed: "text-rose",
  error: "text-rose",
};

export default async function HomePage(props: SearchParams) {
  const { key } = await props.searchParams;
  const reviewKey = firstValue(key);

  if (!isValidReviewKey(reviewKey)) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
        <span className="text-rose">
          <Warning size={40} />
        </span>
        <Bi label={t.common.unauthorized} className="text-xl font-bold" />
        <p className="text-sm text-ink-faint">
          Open the link that includes your review key.
        </p>
      </main>
    );
  }

  const projects = await listProjects();
  const withKey = (path: string) => `${path}?key=${encodeURIComponent(reviewKey as string)}`;

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <header className="border-b border-line px-4 py-4">
        <h1 className="text-xl font-bold">
          <Bi label={t.home.title} />
        </h1>
        <p className="mt-1 text-sm text-ink-dim">
          <Bi label={t.home.subtitle} />
        </p>
      </header>

      <div className="flex flex-1 flex-col gap-4 p-4">
        <Link
          href={withKey("/upload")}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-amber px-4 font-semibold text-canvas shadow-lift transition-colors hover:bg-amber/90"
        >
          <Plus />
          <Bi label={t.home.newProject} />
        </Link>

        {projects.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line px-6 py-12 text-center">
            <span className="text-ink-faint">
              <Film size={32} />
            </span>
            <Bi label={t.home.empty} className="text-sm text-ink-dim" />
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {projects.map((project) => (
              <li key={project.id}>
                <Link
                  href={withKey(`/review/${project.id}`)}
                  className="flex items-center gap-3 rounded-xl border border-line bg-surface p-3 transition-colors hover:border-line-strong hover:bg-raised"
                >
                  <div className="min-w-0 flex-1">
                    <p dir="auto" className="truncate font-semibold">
                      {project.title}
                    </p>
                    <p className={`mt-0.5 text-xs font-semibold ${TONE[project.status]}`}>
                      {t.status[project.status].ar}
                      <span className="mx-1.5 text-ink-faint">·</span>
                      <span dir="ltr" className="text-ink-dim">
                        {t.status[project.status].fr}
                      </span>
                    </p>
                  </div>
                  <Meta project={project} />
                  <span className="shrink-0 text-ink-faint">
                    <ArrowBack size={18} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function Meta({ project }: { project: Project }) {
  return (
    <div className="shrink-0 text-right text-xs tabular-nums text-ink-faint">
      {project.editsVersion ? <p className="font-semibold text-ink-dim">v{project.editsVersion}</p> : null}
      {project.edits ? <p>{formatTime(finalDurationSec(project.edits))}</p> : null}
    </div>
  );
}
