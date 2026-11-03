import Link from "next/link";
import { MobileMenu } from "@/components/MobileMenu";

export function Logo({ tone = "ink" }: { tone?: "ink" | "frost" }) {
  return (
    <Link
      href="/"
      className={`flex items-center gap-2 ${tone === "frost" ? "text-frost" : "text-ink"}`}
      aria-label="Lamig Aircon Cleaning, home"
    >
      <svg aria-hidden width="30" height="30" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        <path d="M16 3v26M4.7 9.5l22.6 13M4.7 22.5l22.6-13" />
        <path d="M12 5.5l4 3 4-3M12 26.5l4-3 4 3" />
      </svg>
      <span className="display-wide text-2xl leading-none">lamig</span>
    </Link>
  );
}

const LINKS: [string, string][] = [
  ["/#services", "Services"],
  ["/#how", "How it works"],
  ["/#area", "Service area"],
  ["/#faq", "Questions"],
];

// `account` is the sign in link or the signed in customer's name (HeaderAccount),
// passed in by the page so this file stays usable from client components.
// Below the lg size the links move into a menu button (MobileMenu), and on
// phones the account link moves into that menu too.
export function SiteHeader({ account }: { account?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 border-b border-mist/70 bg-frost/85 backdrop-blur-md supports-[backdrop-filter]:bg-frost/70">
      <div className="relative mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Logo />
        <nav aria-label="Main" className="flex items-center gap-1 sm:gap-2">
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href} className="hidden rounded-full px-3 py-1.5 text-steel transition-colors hover:bg-white hover:text-ink lg:inline">
              {label}
            </Link>
          ))}
          <span aria-hidden className="mx-2 hidden h-6 w-px bg-mist lg:block" />
          {account && <div className="hidden sm:block">{account}</div>}
          <Link href="/book" className="btn btn-ink btn-sm ml-1 sm:px-5">
            Book now
          </Link>
          <MobileMenu links={LINKS} account={account} />
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter({ name, phone, email }: { name: string; phone: string; email: string }) {
  return (
    <footer className="mt-24 bg-deep text-mist">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 pt-14 pb-10 sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <Logo tone="frost" />
          <p className="mt-4 max-w-sm">
            {name}. Home aircon cleaning in Batangas, booked online or through our receptionist in the chat.
          </p>
        </div>
        <div>
          <h2 className="title text-base text-frost">Contact</h2>
          <ul className="mt-3 space-y-2">
            <li>
              <a href={`tel:${phone.replace(/\s/g, "")}`} className="hover:text-frost hover:underline">{phone}</a>
            </li>
            <li>
              <a href={`mailto:${email}`} className="break-all hover:text-frost hover:underline">{email}</a>
            </li>
          </ul>
        </div>
        <div>
          <h2 className="title text-base text-frost">Your visit</h2>
          <ul className="mt-3 space-y-2">
            <li><Link href="/book" className="hover:text-frost hover:underline">Book a cleaning</Link></li>
            <li><Link href="/account" className="hover:text-frost hover:underline">My account</Link></li>
            <li><Link href="/#faq" className="hover:text-frost hover:underline">Questions</Link></li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-5 text-sm sm:px-6">
          <div>
            <p>A demo business for an AI automation project.</p>
            <p>
              Built by{" "}
              <a href="https://roislrportfolio.netlify.app" target="_blank" rel="noopener noreferrer" className="font-bold text-frost underline underline-offset-2 hover:text-sun">
                Roi Vincent Solar
              </a>
              , automation developer.
            </p>
          </div>
          <Link href="/admin" className="hover:text-frost hover:underline">Staff sign in</Link>
        </div>
      </div>
    </footer>
  );
}
