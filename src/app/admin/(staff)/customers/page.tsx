import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminPageHeader, StatStrip } from "@/components/AdminPageHeader";
import { formatPeso } from "@/lib/format";
import { customerHref, dateOnly, initials, lastActivity, loadPeople, spent } from "./data";

export const metadata: Metadata = { title: "Customers" };

const FILTERS = { all: "All", accounts: "With account", guests: "Guests" } as const;

// Everyone who booked or made an account, one row per email.
// Click a name to open that customer's page.
export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; show?: string; email?: string }> }) {
  const { q: rawQ, show: rawShow, email } = await searchParams;
  // Old links (?email=...) open the customer page.
  if (email) redirect(customerHref(email));

  const q = (rawQ ?? "").trim().toLowerCase();
  const show = (rawShow && rawShow in FILTERS ? rawShow : "all") as keyof typeof FILTERS;

  const everyone = await loadPeople();
  const list = everyone.filter(
    (p) =>
      (show === "all" || (show === "accounts" ? p.account : !p.account)) &&
      (!q || [p.name, p.email, p.phone].some((v) => v.toLowerCase().includes(q))),
  );

  const link = (next: Record<string, string>) => {
    const p = new URLSearchParams({ ...(q ? { q } : {}), ...(show !== "all" ? { show } : {}), ...next });
    for (const [k, v] of [...p.entries()]) if (!v || (k === "show" && v === "all")) p.delete(k);
    const s = p.toString();
    return s ? `/admin/customers?${s}` : "/admin/customers";
  };

  return (
    <>
      <AdminPageHeader title="Customers">
        Everyone who booked or made an account, one row per email. Click a name to see their details, bookings and chats.
      </AdminPageHeader>

      <StatStrip
        stats={[
          { label: "Customers", value: everyone.length },
          { label: "With an account", value: everyone.filter((p) => p.account).length },
          { label: "Booked more than once", value: everyone.filter((p) => p.bookings.length > 1).length },
          { label: "Earned from done jobs", value: formatPeso(everyone.reduce((s, p) => s + spent(p), 0)) },
        ]}
      />

      <div className="mt-8 flex flex-wrap items-center justify-between gap-4">
        <nav aria-label="Filter customers" className="flex flex-wrap gap-1 rounded-full bg-white p-1 shadow-[var(--shadow-soft)] ring-1 ring-mist/70">
          {Object.entries(FILTERS).map(([key, label]) => (
            <Link
              key={key}
              href={link({ show: key })}
              aria-current={show === key ? "page" : undefined}
              className={`rounded-full px-4 py-1.5 font-bold transition-colors ${show === key ? "bg-ink text-frost" : "text-steel hover:text-ink"}`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <form role="search" className="flex w-full gap-2 sm:w-auto">
          {show !== "all" && <input type="hidden" name="show" value={show} />}
          <label htmlFor="customers-q" className="sr-only">Search customers</label>
          <input id="customers-q" name="q" defaultValue={rawQ ?? ""} placeholder="Name, email or phone" className="field py-2 sm:w-72" />
          <button className="btn btn-ink btn-sm">Search</button>
        </form>
      </div>

      {list.length === 0 ? (
        <div className="panel mt-6 p-10 text-center">
          <p className="title text-xl">{q ? "No customers match your search" : "No customers yet"}</p>
          <p className="mt-2 text-steel">
            {q ? <Link href={link({ q: "" })} className="underline underline-offset-2">Clear the search</Link> : "Customers appear here after their first booking or sign up."}
          </p>
        </div>
      ) : (
        <div className="panel mt-6 overflow-hidden">
          <table className="w-full text-left">
            <thead className="border-b border-mist/70 bg-frost/60 text-sm text-steel">
              <tr>
                <th scope="col" className="px-5 py-3 font-bold">Customer</th>
                <th scope="col" className="hidden px-4 py-3 font-bold md:table-cell">Mobile number</th>
                <th scope="col" className="hidden px-4 py-3 font-bold sm:table-cell">Type</th>
                <th scope="col" className="px-4 py-3 text-right font-bold">Bookings</th>
                <th scope="col" className="hidden px-4 py-3 text-right font-bold lg:table-cell">Spent</th>
                <th scope="col" className="hidden px-5 py-3 text-right font-bold xl:table-cell">Last active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-mist/70">
              {list.map((p) => (
                <tr key={p.email} className="group relative transition-colors hover:bg-frost/70">
                  <td className="w-full max-w-0 px-5 py-3.5">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={`avatar ${p.account ? "bg-ink text-frost" : ""}`}>{initials(p.name || p.email)}</span>
                      <div className="min-w-0">
                        {/* The link covers the whole row, so any click on it opens the customer. */}
                        <Link href={customerHref(p.email)} className="block truncate font-bold after:absolute after:inset-0 group-hover:underline group-hover:underline-offset-2">
                          {p.name || "No name yet"}
                        </Link>
                        <span className="block truncate text-sm text-steel">{p.email}</span>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3.5 text-steel md:table-cell">{p.phone || "None"}</td>
                  <td className="hidden px-4 py-3.5 sm:table-cell">
                    {p.account ? <span className="pill bg-ok/10 text-xs text-ok">Account</span> : <span className="pill bg-frost text-xs text-steel">Guest</span>}
                  </td>
                  <td className="readout px-4 py-3.5 text-right text-xl">{p.bookings.length}</td>
                  <td className="readout hidden px-4 py-3.5 text-right text-xl lg:table-cell">{formatPeso(spent(p))}</td>
                  <td className="hidden px-5 py-3.5 text-right text-sm text-steel xl:table-cell">{dateOnly(new Date(lastActivity(p)).toISOString())}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
