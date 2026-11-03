import type { Metadata } from "next";

// The sign in page is a client component, so its title is set here.
export const metadata: Metadata = { title: "Staff sign in" };

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
