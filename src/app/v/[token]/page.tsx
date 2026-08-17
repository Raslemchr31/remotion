import { Bi } from "@/components/Bi";
import { ReviewClient } from "@/components/ReviewClient";
import { Warning } from "@/components/icons";
import { t } from "@/lib/i18n";
import { loadProject } from "@/lib/store";

/** Live project state on every request; nothing here is prerenderable. */
export const dynamic = "force-dynamic";

/**
 * The only page the client ever sees.
 *
 * The token in the path is the whole link — no key parameter, no project id to
 * copy, nothing to log into. He taps what Claude sent him and he is watching.
 */
export default async function ReviewPage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params;
  const project = await loadProject(token);

  if (!project) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
        <span className="text-rose">
          <Warning size={40} />
        </span>
        <Bi label={t.notFound} className="text-xl font-bold" />
      </main>
    );
  }

  return <ReviewClient initialProject={project} />;
}
