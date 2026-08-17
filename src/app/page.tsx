import { Film } from "@/components/icons";

/**
 * There is intentionally nothing here.
 *
 * The client never visits the root: he only ever taps the review link Claude sends
 * him. A project list would be a second thing to explain and a second place for the
 * wrong video to be opened from.
 */
export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 px-6 text-center">
      <span className="text-ink-faint">
        <Film size={36} />
      </span>
      <p className="text-lg font-bold">
        <span dir="rtl" className="block">
          مراجعة الفيديو
        </span>
        <span dir="ltr" className="block text-sm font-normal text-ink-dim">
          Révision vidéo
        </span>
      </p>
      <p className="max-w-xs text-sm leading-relaxed text-ink-faint">
        <span dir="rtl" className="block">
          افتح الرابط الذي أرسله لك Claude.
        </span>
        <span dir="ltr" className="mt-1 block">
          Ouvrez le lien que Claude vous a envoyé.
        </span>
      </p>
    </main>
  );
}
