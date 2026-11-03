import type { Metadata } from "next";
import Link from "next/link";
import { saveTechnician, setDayOff, setTechnicianActive } from "@/app/admin/actions";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { ErrorBanner } from "@/components/ErrorBanner";
import { NoticeBanner } from "@/components/NoticeBanner";
import { addDays, manilaDateOf, manilaToday } from "@/lib/format";
import { staffDb } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Technicians" };

type Technician = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  is_active: boolean;
};

type DayOff = { technician_id: string; off_on: string; reason: string | null };

const dateLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

// The team list. "Edit" opens one technician's details and days off;
// saving closes it again (the action redirects without ?edit=).
export default async function TechniciansPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string; edit?: string }> }) {
  const { error: actionError, notice, edit } = await searchParams;
  const today = manilaToday();
  const weekEnd = addDays(today, 7);
  const db = await staffDb();

  const [techs, daysOff, jobs] = await Promise.all([
    db.from("technicians").select("id, full_name, phone, email, is_active").order("sort_order").order("full_name"),
    db.from("technician_days_off").select("technician_id, off_on, reason").gte("off_on", today).order("off_on"),
    db
      .from("appointments")
      .select("technician_id, starts_at")
      .eq("status", "booked")
      .gte("starts_at", new Date(`${today}T00:00:00+08:00`).toISOString())
      .lt("starts_at", new Date(`${weekEnd}T00:00:00+08:00`).toISOString()),
  ]);
  if (techs.error) throw new Error(techs.error.message);

  const technicians = (techs.data ?? []) as Technician[];
  const offs = (daysOff.data ?? []) as DayOff[];
  const jobRows = (jobs.data ?? []) as { technician_id: string | null; starts_at: string }[];

  const jobsFor = (id: string) => jobRows.filter((j) => j.technician_id === id);
  const jobsToday = (id: string) => jobsFor(id).filter((j) => manilaDateOf(j.starts_at) === today).length;
  const unassigned = jobRows.filter((j) => !j.technician_id).length;
  const adding = edit === "new";

  return (
    <>
      <ErrorBanner message={actionError} />
      <NoticeBanner message={notice} />
      <AdminPageHeader
        title="Technicians"
        actions={
          !adding && (
            <Link href="/admin/technicians?edit=new" scroll={false} className="btn btn-ink btn-sm">
              <svg aria-hidden width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 3v10M3 8h10" /></svg>
              Add technician
            </Link>
          )
        }
      >
        New bookings go to the free technician with the fewest jobs that day. Each evening, every technician gets an email
        with their jobs for tomorrow.
      </AdminPageHeader>
      {unassigned > 0 && (
        <p className="mt-6 rounded-2xl bg-sun/20 px-4 py-3 font-bold text-deep ring-1 ring-sun/50">
          {unassigned} job{unassigned === 1 ? "" : "s"} in the next 7 days without a technician. Assign them on the Appointments page.
        </p>
      )}

      {adding && (
        <section aria-labelledby="new-title" className="panel animate-rise mt-8 p-5 sm:p-6">
          <h2 id="new-title" className="title text-xl">Add a technician</h2>
          <form action={saveTechnician} className="mt-4">
            <DetailFields id="new" />
            <div className="mt-5 flex flex-wrap gap-2">
              <button className="btn btn-ink btn-sm">Add technician</button>
              <Link href="/admin/technicians" scroll={false} className="btn btn-quiet btn-sm">Cancel</Link>
            </div>
          </form>
          <p className="mt-3 text-sm text-steel">Each technician you add lets the website take one more job at the same time.</p>
        </section>
      )}

      {technicians.length === 0 ? (
        <div className="panel mt-8 p-8 text-center">
          <p className="title text-xl">No technicians yet</p>
          <p className="mt-1 text-steel">Until you add one, the booking limit comes from &quot;crews&quot; in business_settings.</p>
        </div>
      ) : (
        <ul className="panel mt-8 divide-y divide-mist/70 overflow-hidden">
          {technicians.map((t) => {
            const open = edit === t.id;
            const theirOffs = offs.filter((o) => o.technician_id === t.id);
            const week = jobsFor(t.id).length;
            return (
              <li key={t.id} id={`tech-${t.id}`} className={open ? "bg-frost/60" : ""}>
                <div className="flex flex-wrap items-center gap-4 p-5 sm:px-6">
                  <span className={`avatar h-12 w-12 text-lg ${t.is_active ? "bg-ink text-frost" : ""}`}>{initials(t.full_name)}</span>
                  <div className={`min-w-0 flex-1 ${t.is_active ? "" : "opacity-70"}`}>
                    <h2 className="title flex flex-wrap items-center gap-2 text-xl">
                      {t.full_name}
                      {t.is_active ? (
                        <span className="pill bg-ok/10 text-xs text-ok">Taking jobs</span>
                      ) : (
                        <span className="pill bg-mist/60 text-xs text-steel">Not working</span>
                      )}
                    </h2>
                    <p className="mt-0.5 text-sm text-steel">
                      {jobsToday(t.id)} job{jobsToday(t.id) === 1 ? "" : "s"} today, {week} in the next 7 days.{" "}
                      {theirOffs.length > 0 && `Next day off ${dateLabel(theirOffs[0].off_on)}. `}
                      {t.email ? `Schedule emails go to ${t.email}.` : "No email, so no schedule email."}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <form action={setTechnicianActive}>
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="active" value={t.is_active ? "false" : "true"} />
                      <button className="btn btn-quiet btn-sm">{t.is_active ? "Stop assigning jobs" : "Start assigning jobs"}</button>
                    </form>
                    {open ? (
                      <Link href="/admin/technicians" scroll={false} className="btn btn-quiet btn-sm">Close</Link>
                    ) : (
                      <Link href={`/admin/technicians?edit=${t.id}`} scroll={false} className="btn btn-ink btn-sm">
                        <svg aria-hidden width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" /></svg>
                        Edit
                      </Link>
                    )}
                  </div>
                </div>

                {open && (
                  <div className="animate-rise grid gap-8 border-t border-mist/70 px-5 pt-6 pb-7 sm:px-6 lg:grid-cols-2 lg:divide-x lg:divide-mist/70">
                    <form action={saveTechnician}>
                      <input type="hidden" name="id" value={t.id} />
                      <h3 className="title text-base">Details</h3>
                      <div className="mt-3">
                        <DetailFields id={t.id} technician={t} />
                      </div>
                      <div className="mt-5 flex flex-wrap gap-2">
                        <button className="btn btn-ink btn-sm">Save details</button>
                        <Link href="/admin/technicians" scroll={false} className="btn btn-quiet btn-sm">Cancel</Link>
                      </div>
                    </form>

                    <div className="lg:pl-8">
                      <h3 className="title text-base">Days off</h3>
                      {theirOffs.length === 0 ? (
                        <p className="mt-2 text-sm text-steel">None coming up.</p>
                      ) : (
                        <ul className="mt-3 space-y-2">
                          {theirOffs.map((o) => (
                            <li key={o.off_on} className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 text-sm ring-1 ring-mist/70">
                              <span>
                                <span className="font-bold">{dateLabel(o.off_on)}</span>
                                {o.reason ? `, ${o.reason}` : ""}
                              </span>
                              <form action={setDayOff}>
                                <input type="hidden" name="id" value={t.id} />
                                <input type="hidden" name="date" value={o.off_on} />
                                <input type="hidden" name="off" value="false" />
                                <button className="text-steel underline underline-offset-2 hover:text-bad">Remove</button>
                              </form>
                            </li>
                          ))}
                        </ul>
                      )}
                      <form action={setDayOff} className="mt-4 flex flex-wrap items-end gap-2">
                        <input type="hidden" name="id" value={t.id} />
                        <div>
                          <label htmlFor={`off-${t.id}`} className="label text-sm">Date</label>
                          <input id={`off-${t.id}`} name="date" type="date" min={today} required className="field w-auto py-1.5" />
                        </div>
                        <div className="min-w-32 flex-1">
                          <label htmlFor={`reason-${t.id}`} className="label text-sm">Reason (optional)</label>
                          <input id={`reason-${t.id}`} name="reason" maxLength={200} className="field py-1.5" />
                        </div>
                        <button className="btn btn-quiet btn-sm">Add day off</button>
                      </form>
                      <p className="mt-2 text-sm text-steel">Their jobs that day move to someone free, or show as unassigned.</p>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function DetailFields({ id, technician }: { id: string; technician?: Technician }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label htmlFor={`name-${id}`} className="label text-sm">Full name</label>
        <input id={`name-${id}`} name="full_name" defaultValue={technician?.full_name ?? ""} required className="field py-1.5" />
      </div>
      <div>
        <label htmlFor={`phone-${id}`} className="label text-sm">Mobile number</label>
        <input id={`phone-${id}`} name="phone" defaultValue={technician?.phone ?? ""} inputMode="tel" className="field py-1.5" />
      </div>
      <div className="sm:col-span-2">
        <label htmlFor={`email-${id}`} className="label text-sm">Email for schedules</label>
        <input id={`email-${id}`} name="email" type="email" defaultValue={technician?.email ?? ""} className="field py-1.5" />
      </div>
    </div>
  );
}
