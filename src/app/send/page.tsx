import { timingSafeEqual } from "node:crypto";

import { Bi } from "@/components/Bi";
import { SendVideo } from "@/components/SendVideo";
import { Warning } from "@/components/icons";

/** Reads a request-time secret; nothing here is prerenderable. */
export const dynamic = "force-dynamic";

/**
 * The page the client bookmarks on his phone home screen.
 *
 * The key lives in the bookmarked URL so he never types it — but it has to be there,
 * because without it this is an open upload endpoint pointed at paid storage.
 */
function keyMatches(candidate: string | undefined): boolean {
  const expected = process.env.INTAKE_KEY;
  if (!expected || !candidate) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export default async function SendPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { k } = await props.searchParams;
  const key = typeof k === "string" ? k : undefined;

  if (!keyMatches(key)) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 text-center">
        <span className="text-rose">
          <Warning size={40} />
        </span>
        <Bi
          label={{ ar: "هذا الرابط غير صالح", fr: "Ce lien n'est pas valide" }}
          className="text-xl font-bold"
        />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col">
      <header className="border-b border-line px-4 py-4">
        <h1 className="text-xl font-bold">
          <Bi label={{ ar: "أرسل فيديو", fr: "Envoyer une vidéo" }} />
        </h1>
      </header>
      <div className="p-4">
        <SendVideo intakeKey={key as string} />
      </div>
    </main>
  );
}
