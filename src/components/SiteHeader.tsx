import Link from "next/link";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 text-ink" aria-label="Lamig Aircon Cleaning, home">
      <svg aria-hidden width="30" height="30" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        <path d="M16 3v26M4.7 9.5l22.6 13M4.7 22.5l22.6-13" />
        <path d="M12 5.5l4 3 4-3M12 26.5l4-3 4 3" />
      </svg>
      <span className="display-wide text-2xl leading-none">lamig</span>
    </Link>
  );
}

export function SiteHeader() {
  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-6">
      <Logo />
      <nav aria-label="Main" className="flex items-center gap-1 sm:gap-6">
        <Link href="/#services" className="hidden px-2 py-1 hover:underline sm:inline">
          Services
        </Link>
        <Link href="/#area" className="hidden px-2 py-1 hover:underline sm:inline">
          Service area
        </Link>
        <Link href="/#faq" className="hidden px-2 py-1 hover:underline sm:inline">
          Questions
        </Link>
        <Link href="/book" className="btn btn-ink px-4 py-2">
          Book
        </Link>
      </nav>
    </header>
  );
}

export function SiteFooter({ name, phone, email }: { name: string; phone: string; email: string }) {
  return (
    <footer className="mt-24 bg-deep text-mist">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-end sm:justify-between sm:px-6">
        <div>
          <p className="display-wide text-3xl text-frost">lamig</p>
          <p className="mt-2">{name}. A demo business for an AI automation project.</p>
        </div>
        <div className="sm:text-right">
          <p>
            Call or text <a href={`tel:${phone.replace(/\s/g, "")}`} className="text-frost underline">{phone}</a>
          </p>
          <p>
            Email <a href={`mailto:${email}`} className="text-frost underline">{email}</a>
          </p>
          <p className="mt-2 text-sm">
            <Link href="/admin" className="underline">Staff sign in</Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
