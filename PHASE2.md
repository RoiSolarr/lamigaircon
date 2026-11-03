# Phase 2: job scheduling

Every job now belongs to a technician.

- **Free times come from technicians.** A time is free when a technician who works that day has no other job then. The website and the AI receptionist both follow this, with no changes on their side.
- **Automatic assignment.** Each new booking goes to the free technician with the fewest jobs that day.
- **Days off and inactive technicians.** Their jobs move to someone free, or show as unassigned for the office.
- **Schedule emails.** Every evening (6 PM by default), the n8n **Technician Schedules** workflow emails each technician tomorrow's jobs. If a job changes after that (new booking, cancelled, reassigned), they get an updated schedule.
- **Technician login.** Technicians sign in and see only their own jobs (today and the next 6 days), with call and map links and a **Mark done** button. Marking done starts the customer's follow up email.

## What changed

| File | Change |
|---|---|
| `supabase/migrations/0005_technicians.sql` | **New.** Tables, assignment rules, schedule outbox, technician permissions |
| `supabase/seed.sql` | Adds two technicians (Mario Santos, Jun Reyes) and assigns existing bookings |
| `n8n/technician-schedules.json` | **New** workflow |
| `n8n/notifications.json` | Sends with Brevo (HTTP Request) like the version running on Render. No need to re import yours. |
| `n8n/receptionist.json` | Gemini model set to `models/gemini-3.5-flash` |
| `src/app/admin/(staff)/technicians/page.tsx` | **New** Technicians page |
| `src/app/tech/page.tsx` | **New** page for technicians |
| `src/app/admin/(staff)/page.tsx` | Technician on each job, reassign, unassigned warning |
| `src/app/admin/(staff)/automation/page.tsx` | Technician schedule emails list |
| `src/app/admin/actions.ts` | New actions, errors shown on the page instead of an error screen |
| `src/app/admin/(staff)/layout.tsx`, `nav.tsx` | Technicians link, technicians redirected to their page |
| `src/components/ErrorBanner.tsx` | **New** |
| `src/proxy.ts` | Protects `/tech` |
| `scripts/security-check.mjs` | Checks the new tables and functions |

## Setup

### 1. Copy the files

Copy everything from the zip into your `lamig-aircon` folder and replace when asked. Your `.env.local` is not in the zip, so it stays as it is.

### 2. Supabase

In the SQL Editor, run:

1. `supabase/migrations/0005_technicians.sql`
2. `supabase/seed.sql` again (safe to run twice; it adds the technicians and gives your existing bookings one)

The new tables appear in the `lamig` schema. Nothing outside it changes.

### 3. Technician emails

The seed technicians have no email, so no schedule goes out yet. To receive them yourself, use Gmail plus addresses. They all arrive in your own inbox:

```sql
update lamig.technicians set email = 'claudenumberis2+mario@gmail.com' where full_name = 'Mario Santos';
update lamig.technicians set email = 'claudenumberis2+jun@gmail.com'   where full_name = 'Jun Reyes';
```

Or do it on the new **Admin > Technicians** page.

### 4. n8n (your Render n8n, next to Lamig Notifications)

1. **Create workflow > ... > Import from File** > `n8n/technician-schedules.json`.
2. Set the credentials:
   - **Claim schedule emails**, **Mark sent**, **Mark failed:** `Lamig Postgres (Supabase)`
   - **Send schedule:** Generic Credential Type > Header Auth > `Brevo API key`
3. In **Send schedule**, check the sender email in the JSON body matches the sender you verified in Brevo.
4. **Ctrl+S**, then **Publish**.

This workflow uses no AI, so it is light enough for free Render.

### 5. Restart the website

```powershell
npm run dev
npm run check:security
```

## Try it

| Do this | What should happen |
|---|---|
| Admin > Technicians | Mario and Jun, with job counts |
| Book two jobs at the same time | One goes to each technician; a third at that time is refused |
| Give Mario a day off on a day with a job | His job moves to Jun, or shows "no technician" on Appointments |
| Admin > Appointments, change a job's technician to a busy one | A message says that technician is busy |
| Add a technician | One more job fits at the same time; unassigned jobs go to them |
| Technician login (below) | They see only their jobs and can mark them done |

**Schedule emails without waiting for 6 PM:** they go out after the hour in `schedule_send_hour`. To test now:

```sql
update lamig.business_settings set schedule_send_hour = 0;
```

Book a job for tomorrow, and within 15 minutes each technician with jobs gets an email. Set it back to 18 afterwards. The status shows in **Admin > Automation > Technician schedules**.

**Technician login:**

1. Supabase: **Authentication > Users > Add user** with a new email and password (tick Auto Confirm). It must be different from your admin email.
2. Admin > Technicians > the technician > **Login email** > **Give access**.
3. Sign in with that account at `/admin/login`. Technicians go straight to their jobs page.

## Rules, in short

- Capacity per day = technicians working that day (no technicians at all: the old `crews` setting).
- A job needs one technician for its whole time, so with Mario busy 8 to 10 and Jun busy 10 to 12, a 2 hour job at 9 is not offered even though no single hour is full.
- Technicians can mark their own jobs done, no show, or undo. Only the office can cancel, reassign or restore a cancelled job.
- Technicians cannot see chats, other technicians' jobs or customers, or the email logs.

Tested on a local copy of the stack: 58 new database tests (assignment, days off, fairness, permissions, schedule emails and updates), the 68 earlier tests, the workflow end to end with a mock Brevo, and the new pages in a browser.
