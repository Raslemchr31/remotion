import type { Metadata, Viewport } from "next";

import "./globals.css";

/**
 * Cairo is declared as self-hosted @font-face rules in globals.css rather than
 * through next/font — see the note there. The Arabic subset is preloaded because
 * it renders the first text the client sees on every screen.
 */

export const metadata: Metadata = {
  title: "مراجعة الفيديو · Révision vidéo",
  description: "ارفع فيديو، شاهد التعديلات، واترك ملاحظاتك · Téléversez, révisez, commentez",
};

export const viewport: Viewport = {
  themeColor: "#0b0b0d",
  width: "device-width",
  initialScale: 1,
  // The review page pins comments to a timeline; a phone rotating to landscape
  // for a wide video must not lock out zoom on the comment text.
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <head>
        <link
          rel="preload"
          href="/fonts/cairo-arabic.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
