"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ICONS: Record<string, string> = {
  "/admin": "M4 6h16v14H4zM4 10h16M9 3v4M15 3v4",
  "/admin/history": "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2",
  "/admin/inbox": "M4 5h16v11H9l-5 4z",
  "/admin/customers": "M16 21v-1.5A3.5 3.5 0 0 0 12.5 16h-5A3.5 3.5 0 0 0 4 19.5V21M10 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM20 8v6M23 11h-6",
  "/admin/technicians": "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21c1-4 3.8-6 7-6s6 2 7 6M16 3.5a4 4 0 0 1 0 7.5M18.5 15c1.8.8 3 2.7 3.5 6",
  "/admin/automation": "M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
};

// The admin menu: a column in the dark sidebar on wide screens, a scrolling row on phones.
export function AdminNav({ waiting, vertical = false }: { waiting: number; vertical?: boolean }) {
  const path = usePathname();
  const links = [
    { href: "/admin", label: "Appointments" },
    { href: "/admin/history", label: "Booking history" },
    { href: "/admin/inbox", label: "Inbox", badge: waiting },
    { href: "/admin/customers", label: "Customers" },
    { href: "/admin/technicians", label: "Technicians" },
    { href: "/admin/automation", label: "Automation" },
  ];
  return (
    <nav aria-label="Admin" className={vertical ? "flex flex-col gap-1" : "-mx-4 flex gap-1 overflow-x-auto px-4 pb-3"}>
      {links.map((l) => {
        const active = l.href === "/admin" ? path === "/admin" : path.startsWith(l.href);
        const style = vertical
          ? active
            ? "bg-white/10 text-frost"
            : "text-mist hover:bg-white/5 hover:text-frost"
          : active
            ? "bg-ink text-frost"
            : "bg-white text-ink ring-1 ring-mist hover:ring-ink";
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`relative flex shrink-0 items-center gap-3 rounded-xl px-3 py-2 font-bold transition-colors ${style}`}
          >
            {vertical && active && <span aria-hidden className="absolute top-2 bottom-2 -left-3 w-1 rounded-r-full bg-sun" />}
            <svg aria-hidden width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d={ICONS[l.href]} />
            </svg>
            <span className="flex-1">{l.label}</span>
            {l.badge ? (
              <span className="readout min-w-6 rounded-full bg-sun px-1.5 text-center text-sm text-deep" aria-label={`${l.badge} waiting`}>
                {l.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
