import type { Metadata, Viewport } from "next";
import { DiagnosticsOverlay } from "@/components/DiagnosticsOverlay";
import { Nav } from "@/components/Nav";
import { ServiceWorker } from "@/components/ServiceWorker";
import "katex/dist/katex.min.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Übungsklausur-Ersteller",
  description:
    "Fragenpools aus eigenen Übungsklausuren erzeugen und daraus offline neue Klausuren mit Musterlösung bauen.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Klausuren", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0b0f1a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className="h-full">
      <body className="min-h-full antialiased">
        <ServiceWorker />
        <Nav />
        <main className="mx-auto w-full max-w-6xl px-4 pb-24 pt-6 sm:px-6">{children}</main>
        <DiagnosticsOverlay />
      </body>
    </html>
  );
}
