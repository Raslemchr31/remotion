/**
 * Bilingual UI copy. Every label carries both languages; the `<Bi>` component
 * renders Arabic as the primary line and French underneath, so there is no
 * language toggle to get wrong and no half-translated screen.
 */

export type Bilingual = { ar: string; fr: string };

const bi = (ar: string, fr: string): Bilingual => ({ ar, fr });

export const t = {
  appName: bi("مراجعة الفيديو", "Révision vidéo"),

  home: {
    title: bi("مشاريع الفيديو", "Projets vidéo"),
    subtitle: bi("ارفع فيديو جديد أو تابع مشروع", "Téléversez une vidéo ou suivez un projet"),
    newProject: bi("فيديو جديد", "Nouvelle vidéo"),
    empty: bi("لا يوجد مشروع بعد", "Aucun projet pour le moment"),
    open: bi("افتح", "Ouvrir"),
  },

  upload: {
    title: bi("ارفع الفيديو", "Téléverser la vidéo"),
    pickFile: bi("اختر فيديو من هاتفك", "Choisir une vidéo depuis votre téléphone"),
    changeFile: bi("تغيير الفيديو", "Changer la vidéo"),
    projectTitle: bi("اسم المشروع", "Nom du projet"),
    projectTitlePlaceholder: bi("مثال: إعلان صنادل صيف", "Ex : Pub sandales été"),
    brief: bi("ما التعديلات المطلوبة؟", "Quelles modifications souhaitez-vous ?"),
    briefPlaceholder: bi(
      "مثال: أضف الترجمة، الشعار في الأعلى، مقدمة بعنوان الماركة",
      "Ex : ajouter les sous-titres, le logo en haut, une intro avec la marque",
    ),
    submit: bi("ارفع وابدأ", "Téléverser et démarrer"),
    uploading: bi("جاري الرفع…", "Téléversement…"),
    processing: bi("جاري تحويل الفيديو…", "Conversion de la vidéo…"),
    done: bi("تم الرفع", "Téléversement terminé"),
    failed: bi("فشل الرفع، حاول مرة أخرى", "Échec du téléversement, réessayez"),
    needFile: bi("اختر فيديو أولاً", "Choisissez d'abord une vidéo"),
    tooLarge: bi("الفيديو كبير جداً (الحد 1 غيغابايت)", "Vidéo trop lourde (max 1 Go)"),
    wrongType: bi("الملف ليس فيديو", "Le fichier n'est pas une vidéo"),
  },

  review: {
    title: bi("مراجعة", "Révision"),
    version: bi("النسخة", "Version"),
    addComment: bi("أضف ملاحظة هنا", "Ajouter une note ici"),
    commentPlaceholder: bi("ما التغيير المطلوب في هذه اللحظة؟", "Quel changement à cet instant ?"),
    save: bi("حفظ الملاحظة", "Enregistrer la note"),
    cancel: bi("إلغاء", "Annuler"),
    pending: bi("ملاحظات غير مرسلة", "Notes non envoyées"),
    noPending: bi("لا ملاحظات بعد. شاهد الفيديو وأضف ملاحظاتك.", "Aucune note. Regardez la vidéo et ajoutez vos notes."),
    remove: bi("حذف", "Supprimer"),
    submit: bi("إرسال الملاحظات", "Envoyer les notes"),
    submitting: bi("جاري الإرسال…", "Envoi…"),
    submitted: bi("تم الإرسال. Claude يعمل على التعديلات.", "Envoyé. Claude applique les modifications."),
    approve: bi("موافق، أنتج الفيديو النهائي", "Approuver et produire la vidéo finale"),
    approveConfirm: bi(
      "سيتم إنتاج الفيديو النهائي. متأكد؟",
      "La vidéo finale va être produite. Confirmer ?",
    ),
    download: bi("تحميل الفيديو النهائي", "Télécharger la vidéo finale"),
    history: bi("سجل الملاحظات", "Historique des notes"),
    round: bi("جولة", "Tour"),
    applied: bi("تم التطبيق", "Appliqué"),
    waitingClaude: bi("في انتظار التعديلات", "En attente des modifications"),
    claudeNote: bi("ملاحظة Claude", "Note de Claude"),
    jumpTo: bi("اذهب إلى", "Aller à"),
  },

  status: {
    normalizing: bi("جاري تحويل الفيديو…", "Conversion de la vidéo…"),
    awaiting_first_edit: bi("في انتظار التعديل الأول من Claude", "En attente de la première édition de Claude"),
    in_review: bi("جاهز للمراجعة", "Prêt pour révision"),
    awaiting_edits: bi("Claude يطبق ملاحظاتك", "Claude applique vos notes"),
    approved: bi("تمت الموافقة", "Approuvé"),
    rendering: bi("جاري إنتاج الفيديو النهائي…", "Production de la vidéo finale…"),
    done: bi("الفيديو النهائي جاهز", "Vidéo finale prête"),
    render_failed: bi("فشل الإنتاج", "Échec de la production"),
    error: bi("خطأ", "Erreur"),
  },

  common: {
    loading: bi("جاري التحميل…", "Chargement…"),
    retry: bi("حاول مرة أخرى", "Réessayer"),
    back: bi("رجوع", "Retour"),
    notFound: bi("المشروع غير موجود", "Projet introuvable"),
    unauthorized: bi("رابط غير صالح", "Lien invalide"),
    refresh: bi("تحديث", "Actualiser"),
  },
} as const;

/** Formats seconds as m:ss for comment pins and the timeline. */
export function formatTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
