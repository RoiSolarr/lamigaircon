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
      <body>{children}</body>
    </html>
  );
}
