import Link from "next/link";
import { Logo } from "@/components/SiteHeader";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-4 py-16">
      <Logo />
      <p className="readout mt-10 text-7xl text-sun-deep">404</p>
      <h1 className="display-wide mt-2 text-4xl">This page is not here</h1>
      <p className="mt-4 text-lg text-steel">The link may be old or mistyped. You can still book a cleaning or ask our receptionist from the home page.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/" className="btn btn-ink">Go to the home page</Link>
        <Link href="/book" className="btn btn-sun">Book a cleaning</Link>
      </div>
    </main>
  );
}
