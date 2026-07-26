import type { MetadataRoute } from "next";
import { withBasePath } from "@/lib/basePath";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Übungsklausur-Ersteller",
    short_name: "Klausuren",
    description:
      "Fragenpools aus eigenen Übungsklausuren erzeugen und daraus offline neue Klausuren mit Musterlösung bauen.",
    // Muss den Unterpfad enthalten, sonst startet die installierte App
    // im Wurzelverzeichnis der Domain und findet nichts.
    start_url: withBasePath("/"),
    scope: withBasePath("/"),
    display: "standalone",
    background_color: "#0b0f1a",
    theme_color: "#0b0f1a",
    lang: "de",
    icons: [
      {
        src: withBasePath("/icon.svg"),
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
