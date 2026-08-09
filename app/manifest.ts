import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SpotPilot — Eastern Crete Edition",
    short_name: "SpotPilot",
    description: "Spot-calibrated windsurfing session quality forecasts for Eastern Crete (Kouremenos, Tenda, Xerokampos)",
    start_url: "/",
    display: "standalone",
    background_color: "#0a0f1d",
    theme_color: "#0a0f1d",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  };
}
