import {
  linkTechnicianLogin,
  saveTechnician,
  setDayOff,
  setTechnicianActive,
} from "@/app/admin/actions";
import { AdminPageHeader } from "@/components/AdminPageHeader";
import { ErrorBanner } from "@/components/ErrorBanner";
import { addDays, manilaDateOf, manilaToday } from "@/lib/format";
import { staffDb } from "@/lib/supabase/server";

type Technician = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  is_active: boolean;
  user_id: string | null;
};

type DayOff = { technician_id: string; off_on: string; reason: string | null };

const dateLabel = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-PH", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export default async function TechniciansPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error: actionError } = await searchParams;
  const today = manilaToday();
  const weekEnd = addDays(today, 7);
  const db = await staffDb();

  const [techs, daysOff, jobs] = await Promise.all([
    db.from("technicians").select("id, full_name, phone, email, is_active, user_id").order("sort_order").order("full_name"),
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

  return (
    <>
      <ErrorBanner message={actionError} />
      <AdminPageHeader title="Technicians">
        Free times on the website and in the chat come from who works each day. New bookings go to the free technician
        with the fewest jobs that day. Each evening, the n8n Technician Schedules workflow emails everyone their jobs for
        tomorrow.
      </AdminPageHeader>
      {unassigned > 0 && (
        <p className="mt-6 rounded-2xl bg-sun/20 px-4 py-3 font-bold text-deep ring-1 ring-sun/50">
          {unassigned} job{unassigned === 1 ? "" : "s"} in the next 7 days without a technician. Assign them on the Appointments page.
        </p>
      )}

      {technicians.length === 0 && (
        <div className="panel mt-8 p-8 text-center">
          <p className="title text-xl">No technicians yet</p>
          <p className="mt-1 text-steel">
            Until you add one, the booking limit comes from &quot;crews&quot; in business_settings.
          </p>
        </div>
      )}

      <ul className="mt-8 space-y-6">
        {technicians.map((t) => {
          const theirOffs = offs.filter((o) => o.technician_id === t.id);
          const week = jobsFor(t.id).length;
          return (
            <li key={t.id} className={`panel overflow-hidden ${t.is_active ? "" : "opacity-75"}`}>
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-mist/70 p-5 sm:p-6">
                <div className="flex min-w-0 items-start gap-4">
                  <span className={`avatar h-12 w-12 text-lg ${t.is_active ? "bg-ink text-frost" : ""}`}>
                    {t.full_name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                  </span>
                  <div className="min-w-0">
                  <h2 className="title flex flex-wrap items-center gap-2 text-xl">
                    {t.full_name}
                    {t.is_active ? (
                      <span className="pill bg-ok/10 text-xs text-ok">Taking jobs</span>
                    ) : (
                      <span className="pill bg-mist/60 text-xs text-steel">Not working</span>
                    )}
                  </h2>
                  <p className="mt-1 text-sm text-steel">
                    {jobsToday(t.id)} job{jobsToday(t.id) === 1 ? "" : "s"} today, {week} in the next 7 days.{" "}
                    {t.email ? `Schedule emails go to ${t.email}.` : "No email, so no schedule email."}{" "}
                    {t.user_id ? "Can sign in." : "No sign in yet."}
                  </p>
                  </div>
                </div>
                <form action={setTechnicianActive}>
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="active" value={t.is_active ? "false" : "true"} />
                  <button className="btn btn-quiet btn-sm">
                    {t.is_active ? "Stop assigning jobs" : "Start assigning jobs"}
                  </button>
                </form>
              </div>

              <div className="grid gap-6 p-5 sm:p-6 lg:grid-cols-3 lg:divide-x lg:divide-mist/70 [&>*]:lg:pl-6 [&>*:first-child]:lg:pl-0">
                <form action={saveTechnician} className="space-y-3">
                  <input type="hidden" name="id" value={t.id} />
                  <h3 className="title text-base">Details</h3>
                  <div>
                    <label htmlFor={`name-${t.id}`} className="label text-sm">Full name</label>
                    <input id={`name-${t.id}`} name="full_name" defaultValue={t.full_name} required className="field py-1.5" />
                  </div>
                  <div>
                    <label htmlFor={`phone-${t.id}`} className="label text-sm">Mobile number</label>
                    <input id={`phone-${t.id}`} name="phone" defaultValue={t.phone ?? ""} inputMode="tel" className="field py-1.5" />
                  </div>
                  <div>
                    <label htmlFor={`email-${t.id}`} className="label text-sm">Email for schedules</label>
                    <input id={`email-${t.id}`} name="email" type="email" defaultValue={t.email ?? ""} className="field py-1.5" />
                  </div>
                  <button className="btn btn-ink btn-sm">Save details</button>
                </form>

                <div>
                  <h3 className="title text-base">Days off</h3>
                  {theirOffs.length === 0 ? (
                    <p className="mt-2 text-sm text-steel">None coming up.</p>
                  ) : (
                    <ul className="mt-2 space-y-1">
                      {theirOffs.map((o) => (
                        <li key={o.off_on} className="flex items-center justify-between gap-2 text-sm">
                          <span>
                            {dateLabel(o.off_on)}
                            {o.reason ? `, ${o.reason}` : ""}
                          </span>
                          <form action={setDayOff}>
                            <input type="hidden" name="id" value={t.id} />
                            <input type="hidden" name="date" value={o.off_on} />
                            <input type="hidden" name="off" value="false" />
                            <button className="underline underline-offset-2">Remove</button>
                          </form>
                        </li>
                      ))}
                    </ul>
                  )}
                  <form action={setDayOff} className="mt-3 flex flex-wrap items-end gap-2">
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

                <div>
                  <h3 className="title text-base">Sign in</h3>
                  <p className="mt-2 text-sm text-steel">
                    {t.user_id
                      ? "This technician can sign in at /admin/login and sees only their own jobs."
                      : "1. In Supabase, Authentication > Users > Add user (tick Auto Confirm). 2. Enter that email here."}
                  </p>
                  <form action={linkTechnicianLogin} className="mt-3 flex flex-wrap items-end gap-2">
                    <input type="hidden" name="id" value={t.id} />
                    <div className="min-w-40 flex-1">
                      <label htmlFor={`login-${t.id}`} className="label text-sm">Login email</label>
                      <input id={`login-${t.id}`} name="email" type="email" required className="field py-1.5" />
                    </div>
                    <button className="btn btn-quiet btn-sm">{t.user_id ? "Change login" : "Give access"}</button>
                  </form>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <section className="panel mt-10 max-w-md p-5 sm:p-6">
        <h2 className="title text-xl">Add a technician</h2>
        <form action={saveTechnician} className="mt-4 space-y-3">
          <div>
            <label htmlFor="new-name" className="label text-sm">Full name</label>
            <input id="new-name" name="full_name" required className="field py-1.5" />
          </div>
          <div>
            <label htmlFor="new-phone" className="label text-sm">Mobile number</label>
            <input id="new-phone" name="phone" inputMode="tel" className="field py-1.5" />
          </div>
          <div>
            <label htmlFor="new-email" className="label text-sm">Email for schedules</label>
            <input id="new-email" name="email" type="email" className="field py-1.5" />
          </div>
          <button className="btn btn-ink btn-sm">Add technician</button>
        </form>
        <p className="mt-3 text-sm text-steel">Each technician you add lets the website take one more job at the same time.</p>
      </section>
    </>
  );
}
