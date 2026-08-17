import type { Bilingual } from "@/lib/i18n";

/**
 * Renders a label in both languages: Arabic as the primary line, French beneath
 * it at a smaller size and dimmed.
 *
 * A language toggle was the alternative and it is worse for this client — he
 * reads both, and a toggle guarantees that half the screen is eventually in the
 * wrong language after a partial translation. Showing both means no state to get
 * wrong and no missing string.
 */
export function Bi({ label, className }: { label: Bilingual; className?: string }) {
  return (
    <span className={className}>
      <span dir="rtl" className="block">
        {label.ar}
      </span>
      {/*
        The French line dims by lowering opacity against whatever colour it
        inherits, never by hard-coding a grey. On the amber primary button a
        fixed grey landed at amber-on-amber and failed contrast outright; opacity
        keeps it legible on the canvas, on a surface and on the accent alike.
      */}
      <span dir="ltr" className="block text-[0.78em] font-normal leading-tight opacity-75">
        {label.fr}
      </span>
    </span>
  );
}

/** Single-line variant for tight spots: Arabic, a hairline divider, then French. */
export function BiInline({ label, className }: { label: Bilingual; className?: string }) {
  return (
    <span className={className}>
      <span dir="rtl">{label.ar}</span>
      <span className="mx-2 text-ink-faint" aria-hidden="true">
        ·
      </span>
      <span dir="ltr" className="text-ink-dim">
        {label.fr}
      </span>
    </span>
  );
}
