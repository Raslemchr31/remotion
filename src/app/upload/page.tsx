import Link from "next/link";

import { Bi } from "@/components/Bi";
import { UploadForm } from "@/components/UploadForm";
import { ArrowBack, Warning } from "@/components/icons";
import { isValidReviewKey } from "@/lib/auth";
import { firstValue, type SearchParams } from "@/lib/route-types";
import { t } from "@/lib/i18n";

/** Reads the review key from the request; nothing here is prerenderable. */
export const dynamic = "force-dynamic";

export default async function UploadPage(props: SearchParams) {
  const { key } = await props.searchParams;
  const reviewKey = firstValue(key);

  if (!isValidReviewKey(reviewKey)) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
        <span className="text-rose">
          <Warning size={40} />
        </span>
        <Bi label={t.common.unauthorized} className="text-xl font-bold" />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <header className="flex items-center gap-2 border-b border-line px-4 py-3">
        <Link
          href={`/?key=${encodeURIComponent(reviewKey as string)}`}
          aria-label={t.common.back.fr}
          className="rounded-lg p-2 text-ink-dim transition-colors hover:bg-raised hover:text-ink"
        >
          <ArrowBack />
        </Link>
        <h1 className="text-base font-bold">
          <Bi label={t.upload.title} />
        </h1>
      </header>

      <div className="p-4">
        <UploadForm reviewKey={reviewKey as string} />
      </div>
    </main>
  );
}
