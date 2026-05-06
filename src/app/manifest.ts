import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Hermi Dashboard",
    short_name: "Hermi",
    description: "Dream House Lending Mission Control dashboard for Fonz.",
    start_url: "/finance",
    scope: "/",
    display: "standalone",
    background_color: "#0A0A0A",
    theme_color: "#0A0A0A",
    orientation: "portrait",
    icons: [
      {
        src: "/icons/hermi-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Finance CFO",
        short_name: "Finance",
        description: "Open the CFO finance dashboard.",
        url: "/finance",
      },
      {
        name: "Ask Hermes",
        short_name: "Ask",
        description: "Open the DHL Ask Hermes assistant.",
        url: "/ask",
      },
      {
        name: "Pipeline",
        short_name: "Pipeline",
        description: "Open the pipeline view.",
        url: "/pipeline",
      },
    ],
  };
}
