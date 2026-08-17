import { Bi } from "@/components/Bi";
import { Spinner, Warning } from "@/components/icons";
import { t } from "@/lib/i18n";
import type { Project } from "@/lib/schema";

/**
 * Says whose turn it is.
 *
 * Only shown when the client is waiting on something or something broke. Once the
 * video is ready to review the banner disappears entirely, because at that point
 * the video itself is the message.
 */
export function StatusBanner({ project }: { project: Project }) {
  if (project.status === "in_review") return null;

  const working =
    project.status === "normalizing" ||
    project.status === "awaiting_first_edit" ||
    project.status === "awaiting_edits" ||
    project.status === "rendering";

  const broken = project.status === "error" || project.status === "render_failed";

  return (
    <div
      role="status"
      className={[
        "relative overflow-hidden border-b px-4 py-3",
        broken ? "border-rose/30 bg-rose-soft" : "border-line bg-surface",
      ].join(" ")}
    >
      <div className="flex items-start gap-3">
        <span className={broken ? "mt-0.5 shrink-0 text-rose" : "mt-0.5 shrink-0 text-amber"}>
          {broken ? <Warning size={18} /> : <Spinner size={18} className="animate-spin" />}
        </span>
        <div className="min-w-0 flex-1">
          <Bi label={t.status[project.status]} className="text-sm font-semibold" />
          {project.errorMessage ? (
            <p dir="ltr" className="mt-1 break-words text-xs text-rose/85">
              {project.errorMessage}
            </p>
          ) : null}
        </div>
      </div>

      {working ? (
        <div className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-line">
          <div className="animate-sweep h-full w-1/3 bg-amber" />
        </div>
      ) : null}
    </div>
  );
}
