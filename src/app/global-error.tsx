"use client";

/**
 * Last-resort error screen, replacing the framework default.
 *
 * It owns <html> and <body> because a global error means the root layout itself
 * did not render. Copy is inlined rather than imported so this file depends on
 * nothing that could be the thing that broke.
 */
export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="ar" dir="rtl">
      <body
        style={{
          minHeight: "100dvh",
          margin: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1.5rem",
          padding: "1.5rem",
          textAlign: "center",
          backgroundColor: "#0b0b0d",
          color: "#f4f4f6",
          fontFamily: '"Segoe UI", system-ui, sans-serif',
        }}
      >
        <p style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700 }}>
          حدث خطأ غير متوقع
          <span
            dir="ltr"
            style={{ display: "block", fontSize: "0.85rem", fontWeight: 400, color: "#a0a0b0" }}
          >
            Une erreur inattendue s&apos;est produite
          </span>
        </p>

        <button
          type="button"
          onClick={reset}
          style={{
            minHeight: "2.75rem",
            padding: "0 1.25rem",
            borderRadius: "0.75rem",
            border: "none",
            backgroundColor: "#f5a524",
            color: "#0b0b0d",
            fontWeight: 600,
            fontSize: "1rem",
            cursor: "pointer",
          }}
        >
          حاول مرة أخرى · Réessayer
        </button>
      </body>
    </html>
  );
}
