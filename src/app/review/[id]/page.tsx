import Link from "next/link";

import { Bi } from "@/components/Bi";
import { ReviewClient } from "@/components/ReviewClient";
import { Warning } from "@/components/icons";
import { isValidReviewKey } from "@/lib/auth";
import { firstValue, type IdParams, type SearchParams } from "@/lib/route-types";
import { t } from "@/lib/i18n";
import { loadProject } from "@/lib/store";

/**
 * Server shell for the review screen.
 *
 * The link's ?key= is checked here rather than in a proxy so that a bad key
 * produces a readable page instead of a redirect the client cannot interpret,
 * and so static assets are never caught by a matcher.
 */
/** Live project state plus a per-request secret: always rendered on demand. */
export const dynamic = "force-dynamic";

export default async function ReviewPage(props: IdParams & SearchParams) {
  const { id } = await props.params;
  const { key } = await props.searchParams;
  const reviewKey = firstValue(key);

  if (!isValidReviewKey(reviewKey)) {
    return <Blocked label={t.common.unauthorized} />;
  }

  const project = await loadProject(id);
  if (!project) {
    return <Blocked label={t.common.notFound} />;
  }

  return <ReviewClient initialProject={project} reviewKey={reviewKey as string} />;
}

function Blocked({ label }: { label: { ar: string; fr: string } }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
      <span className="text-rose">
        <Warning size={40} />
      </span>
      <Bi label={label} className="text-xl font-bold" />
      <Link
        href="/"
        className="rounded-lg border border-line px-4 py-2 text-sm text-ink-dim transition-colors hover:border-line-strong hover:text-ink"
      >
        <Bi label={t.common.back} />
      </Link>
    </main>
  );
}
