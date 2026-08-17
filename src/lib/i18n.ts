/**
 * Bilingual UI copy. Every label carries both languages; the `<Bi>` component
 * renders Arabic as the primary line and French underneath, so there is no
 * language toggle to get wrong and no half-translated screen.
 */

export type Bilingual = { ar: string; fr: string };

const bi = (ar: string, fr: string): Bilingual => ({ ar, fr });

export const t = {
  addComment: bi("أضف ملاحظة هنا", "Ajouter une note ici"),
  commentPlaceholder: bi("ما التغيير المطلوب في هذه اللحظة؟", "Quel changement à cet instant ?"),
  save: bi("حفظ", "Enregistrer"),
  cancel: bi("إلغاء", "Annuler"),
  pending: bi("ملاحظاتك", "Vos notes"),
  noPending: bi("شاهد الفيديو واضغط على أي لحظة لإضافة ملاحظة.", "Regardez la vidéo et touchez un instant pour ajouter une note."),
  remove: bi("حذف", "Supprimer"),

  submit: bi("إرسال الملاحظات", "Envoyer les notes"),
  submitting: bi("جاري الإرسال…", "Envoi…"),

  /** The one instruction that closes the loop back to the chat. */
  sentTitle: bi("تم إرسال ملاحظاتك", "Vos notes ont été envoyées"),
  sentBody: bi(
    "ارجع إلى محادثة Claude وقل: «تركت ملاحظات». سيقوم بالتعديل وستتحدّث هذه الصفحة تلقائياً.",
    "Retournez dans la conversation Claude et dites : « j'ai laissé des notes ». Il modifiera la vidéo et cette page se mettra à jour toute seule.",
  ),

  done: bi("الفيديو جاهز، أريده", "La vidéo me convient"),
  doneConfirm: bi("هل أنت راضٍ عن هذه النسخة؟", "Cette version vous convient ?"),
  doneTitle: bi("تم", "C'est noté"),
  doneBody: bi(
    "ارجع إلى محادثة Claude وقل: «انتهيت». سيُجهّز الفيديو النهائي ويظهر زر التحميل هنا.",
    "Retournez dans la conversation Claude et dites : « j'ai terminé ». Il préparera la vidéo finale et le bouton de téléchargement apparaîtra ici.",
  ),

  download: bi("تحميل الفيديو", "Télécharger la vidéo"),
  history: bi("ملاحظات سابقة", "Notes précédentes"),
  round: bi("جولة", "Tour"),
  applied: bi("تم التطبيق", "Appliqué"),
  claudeNote: bi("Claude", "Claude"),

  status: {
    preparing: bi("جاري تجهيز الفيديو…", "Préparation de la vidéo…"),
    ready: bi("جاهز للمشاهدة", "Prêt à visionner"),
    claude_working: bi("Claude يعمل على التعديلات…", "Claude applique les modifications…"),
    done: bi("الفيديو النهائي جاهز", "Vidéo finale prête"),
  },

  notFound: bi("هذا الرابط غير صالح", "Ce lien n'est pas valide"),
  loading: bi("جاري التحميل…", "Chargement…"),
} as const;

/** Formats seconds as m:ss for comment pins and the timeline. */
export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
