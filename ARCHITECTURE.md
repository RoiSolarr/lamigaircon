# Architecture

## The pieces

```
                 Browser (customer)                      Browser (staff)
                 │            │                                 │
       free times│     chat   │                                 │ sign in, pages,
       and booking│   message │                                 │ server actions
                 ▼            ▼                                 ▼
        ┌─────────────────────────────── Next.js on Vercel ───────────────────────────┐
        │ /api/slots   /api/book ──────────┐      /api/chat          /admin/*          │
        └──────┬──────────┬────────────────┼──────────┬────────────────┬───────────────┘
               │ anon key │                │ secret   │ secret         │ staff session
               ▼          ▼                ▼          ▼                ▼
        ┌──────────── Supabase ───────────┐   ┌──────────── n8n on Render ────────────┐
        │ lamig.get_slots()               │◄──┤ Lamig Receptionist                    │
        │ lamig.book_appointment()        │   │   Webhook > chat_start > AI Agent     │
        │ lamig.* tables (RLS on all)     │   │   (Gemini + 3 Postgres tools) > reply │
        │ notifications outbox            │◄──┤ Lamig Notifications                   │
        │ staff functions                 │   │   Schedule/Webhook > claim > email    │
        └─────────────────────────────────┘   └───────────────┬──────────────────────┘
                                                              ▼
                                                         Gmail SMTP
```

## Main flows

**Website booking.** The browser loads free times from `/api/slots`, which calls `lamig.get_slots()`. On submit, `/api/book` calls `lamig.book_appointment()`. That function validates everything again, locks the day, checks the slot is still free, saves the customer and appointment, and writes three rows to `lamig.notifications` (confirmation now, reminder 24 hours before, follow up a day after the job). After the response is sent, the route pings the n8n `lamig-notify` webhook, so the confirmation goes out within seconds instead of on the next 5 minute run.

**Chat.** The browser keeps a random session id and sends `{ sessionId, message }` to `/api/chat`, which forwards it to the n8n `lamig-chat` webhook with the shared secret. The workflow calls `lamig.chat_start()` (saves the message, returns history and business info), runs the AI Agent, saves the reply with `lamig.save_reply()` and responds. The browser only ever sends the newest message. The history comes from the database, so a visitor can't rewrite it.

**Emails.** `lamig.claim_due_notifications()` returns due rows and marks them `sending` in the same statement, using `FOR UPDATE SKIP LOCKED`. The workflow sends each email and marks it `sent` or `failed`. Failures retry after 10 and 20 minutes, then stay `failed` for staff to see.

## Decisions and why

**Booking rules live in Postgres functions, not in the app or the workflow.** The website and the AI call the same two functions. A slot can't be "free" on the website and "taken" for the AI, and the rules (hours, crews, holidays, notice) are written once. Both return `{ ok, error }` with plain language errors, so the AI can read a failure and recover ("that time was just taken, here are others").

**Capacity is checked per hour, not per booking.** With 2 crews, a start time is free when every hour of the job has fewer than 2 overlapping appointments. That is exact for jobs that start on the hour, and it never overbooks.

**Double booking is impossible.** `book_appointment()` takes a transaction level advisory lock for the date before checking and inserting. Two people pressing Book for the last slot at the same moment get one success and one "not available". This is covered by a race test.

**An outbox table instead of sending email inside the booking.** Booking never waits on Gmail, and email problems never lose a booking. Every email has a status, an attempt count and the last error, so the Automation page can show exactly what happened. Whether to send is decided at send time: a cancelled job gets no reminder, and a follow up waits until staff mark the job done.

**The AI can't run arbitrary SQL.** Each tool is one fixed query. The AI only fills in values through `$fromAI()`, passed as query parameters (an array, so commas in addresses are safe). Chat bookings can only come from n8n: if the anon key tries `p_source = 'chat'`, the function refuses.

**The prompt is built from the database on every message.** Services, prices, FAQs, hours, holidays and a 14 day calendar are loaded fresh, so editing a table changes what the AI says with no redeploy. The calendar lets the model turn "next Saturday" into a date without doing date math.

**Security model.**

| Who | Can |
|---|---|
| Visitor (anon key) | Read settings, services, FAQs, holidays. Call `get_slots()` and `book_appointment()` (website source only). Nothing else. |
| Signed in, not staff | Nothing beyond a visitor. RLS returns no rows. |
| Staff | Read all lamig tables. Change data only through `set_appointment_status()`, `retry_notification()`, `resolve_handoff()`, which check `lamig.is_staff()`. |
| n8n | Connects as the database owner and calls the `lamig.*` functions |

Row level security is on for every table, no table is writable by anon or authenticated, and every function has `search_path = ''` and an explicit grant (Postgres grants functions to everyone by default, so each migration revokes that). `npm run check:security` verifies this against the live API.

**Its own schema.** Everything is in `lamig`, so it can share a Supabase project with other apps and with n8n's own tables.

**Free tier limits.** The receptionist stops calling Gemini after 20 messages in 10 minutes from one visitor or 500 a day overall. The booking form has a honeypot field. For a real business, add Cloudflare Turnstile on the form and chat.

## Data model

```
business_settings (1 row)   services ──┐
faqs                        closed_dates│
staff ── auth.users                     │
customers ──< appointments >────────────┘
                   │  └──> conversations ──< messages
                   └──< notifications (confirmation | reminder | follow_up)
```

## Next steps (phase 2: job scheduling)

The data model is ready for it. Add a `technicians` table (name, phone, active), a `technician_id` on appointments, and a `technician_unavailable` table for days off. Then:

- Change the capacity check from "crews" to "free technicians at that hour".
- Add an n8n workflow that runs each evening, assigns tomorrow's jobs (fewest jobs first, nearest barangay next), and emails or texts each technician their schedule.
- Add a technician view in the admin with today's route and a "Done" button, which also triggers the follow up.

Other ideas: customer self service cancel and reschedule by reference and email, SMS reminders through a local provider, and a weekly report workflow (bookings, chats handed off, failed emails).

## Development tools

Next.js 16, TypeScript, Tailwind CSS 4, ESLint, Supabase (Postgres 17, Auth, `@supabase/ssr`), n8n 2.44 (AI Agent, Google Gemini Chat Model, Postgres Tool), Gmail SMTP, Fontsource. Claude (Anthropic) was the AI coding assistant for the code, SQL, workflows and docs.

Testing used a local stack: Postgres 17, PostgREST, n8n 2.44 with a mock Gemini server and a mock SMTP server, and Playwright for the pages. Covered: 68 database tests (slot rules, closed days, validation, the double booking race, outbox claiming, retries, skipping, chat context, rate limits, and permissions for anon, signed in and staff users), both workflows end to end through their webhooks, the website APIs, and the main pages on desktop and mobile.
