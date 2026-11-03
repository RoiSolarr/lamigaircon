"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Menu button for phones and tablets, where the header links do not fit.
// `links` are the same links the header shows on wide screens.
export function MobileMenu({ links, account }: { links: [string, string][]; account?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const path = usePathname();
  const [lastPath, setLastPath] = useState(path);

  // Close after moving to another page.
  if (path !== lastPath) {
    setLastPath(path);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    // A tap anywhere outside the menu closes it.
    const onDown = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [open]);

  return (
    <div ref={box} className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        className="grid h-10 w-10 place-items-center rounded-full text-ink ring-1 ring-mist transition-colors hover:bg-white"
      >
        <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
        </svg>
      </button>

      {open && (
        <div id="mobile-menu" className="animate-rise absolute inset-x-0 top-full z-40 border-b border-mist/70 bg-frost shadow-[var(--shadow-soft)]">
          <nav aria-label="Menu" className="mx-auto max-w-6xl px-4 py-3 sm:px-6">
            <ul className="divide-y divide-mist/70">
              {links.map(([href, label]) => (
                <li key={href}>
                  <Link href={href} onClick={() => setOpen(false)} className="flex items-center justify-between py-3.5 text-lg font-bold text-ink">
                    {label}
                    <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className="text-steel"><path d="M9 6l6 6-6 6" /></svg>
                  </Link>
                </li>
              ))}
            </ul>
            {account && (
                <div className="mt-2 border-t border-mist/70 pt-3 pb-1 sm:hidden" onClick={() => setOpen(false)}>
                  {account}
                </div>
              )}
            </nav>
        </div>
      )}
    </div>
  );
}
