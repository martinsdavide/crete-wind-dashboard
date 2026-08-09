import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "SpotPilot | Eastern Crete Edition",
  description: "SpotPilot: Spot-calibrated windsurfing session quality forecasts for Kouremenos, Tenda, and Xerokampos in Eastern Crete.",
  applicationName: "SpotPilot",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "SpotPilot",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0f1d",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@500;700;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen flex flex-col font-sans selection:bg-sky-500/30 selection:text-sky-200">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
