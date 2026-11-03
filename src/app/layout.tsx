import type { Metadata, Viewport } from "next";
import "@fontsource-variable/archivo/wdth.css";
import "@fontsource/atkinson-hyperlegible/400.css";
import "@fontsource/atkinson-hyperlegible/700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Lamig Aircon Cleaning, Batangas", template: "%s | Lamig Aircon Cleaning" },
  description:
    "Home aircon cleaning in Batangas. See free times and book online, or chat with our receptionist any time.",
};

export const viewport: Viewport = {
  themeColor: "#10303b",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <a
          href="#main"
          className="sr-only z-50 rounded-full bg-ink px-5 py-3 font-bold text-frost focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
