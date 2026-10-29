"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminNav({ waiting }: { waiting: number }) {
  const path = usePathname();
  const links = [
    { href: "/admin", label: "Appointments" },
    { href: "/admin/inbox", label: "Inbox", badge: waiting },
    { href: "/admin/automation", label: "Automation" },
  ];
  return (
    <nav aria-label="Admin" className="flex gap-1">
      {links.map((l) => {
        const active = l.href === "/admin" ? path === "/admin" : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-2 rounded-full px-3 py-1.5 ${active ? "bg-ink text-frost" : "hover:bg-ice"}`}
          >
            {l.label}
            {l.badge ? (
              <span className="rounded-full bg-sun px-2 text-sm font-bold text-deep" aria-label={`${l.badge} waiting`}>
                {l.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
