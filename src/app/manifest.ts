import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Übungsklausur-Ersteller",
    short_name: "Klausuren",
    description:
      "Fragenpools aus eigenen Übungsklausuren erzeugen und daraus offline neue Klausuren mit Musterlösung bauen.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0f1a",
    theme_color: "#0b0f1a",
    lang: "de",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
