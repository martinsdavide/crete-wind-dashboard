import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Crete Wind Dashboard",
    short_name: "Crete Wind",
    description: "Windsurfing conditions and local wind forecasts for Kouremenos & Tenda in eastern Crete.",
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
