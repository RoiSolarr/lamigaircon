# Lamig Aircon Cleaning: AI receptionist and booking automation

A website for a fictional home aircon cleaning business in Batangas, with three automations working together:

1. **AI receptionist.** A chat on the website, run by an n8n workflow with Gemini. It answers questions from the business info in the database, checks free times and books appointments. Anything it can't handle (complaints, cancellations, repairs) goes to a staff inbox.
2. **Appointment booking.** Visitors pick a free time on the website. Website and AI use the same database functions, so a slot means the same thing everywhere and two people can't take the last slot.
3. **Customer follow ups.** Every booking schedules a confirmation email, a reminder 24 hours before, and a follow up a day after staff mark the job done. An n8n workflow sends them, retries failures and reports problems.

Staff get an admin area with **Appointments**, an **Inbox** of every chat (with the ones that need a person on top), and an **Automation** page that shows whether the email workflow is healthy.

Job scheduling (assigning technicians) is phase 2. See "Next steps" in ARCHITECTURE.md.

## Stack

| Part | Tool | Cost |
|---|---|---|
| Website and admin | Next.js 16, TypeScript, Tailwind CSS 4, on Vercel | Free (Hobby) |
| Database and staff login | Supabase (Postgres, Auth, row level security) | Free |
| Automations | n8n (self hosted on Render) | Free instance |
| AI | Google Gemini through the n8n AI Agent node | Free tier |
| Email | Gmail SMTP with an app password | Free |

## Project layout

```
supabase/
  migrations/0001_schema.sql      tables, in their own "lamig" schema
  migrations/0002_security.sql    row level security and grants
  migrations/0003_booking.sql     get_slots() and book_appointment()
  migrations/0004_automation.sql  functions for n8n and for staff actions
  seed.sql                        business info, services, FAQs, holidays
  demo-data.sql                   optional sample bookings and a chat
n8n/
  receptionist.json               import into n8n: the AI receptionist
  notifications.json              import into n8n: confirmation, reminder, follow up
  SETUP.md                        step by step n8n setup
src/
  app/page.tsx                    home page with live free times
  app/book/                       booking page
  app/api/slots, book, chat       API routes the browser calls
  app/admin/                      staff sign in, appointments, inbox, automation
  components/ChatWidget.tsx       the chat bubble
  proxy.ts                        keeps the staff session fresh
scripts/security-check.mjs        PASS/FAIL check of what visitors can access
```

## Setup

Plan about an hour. Do the steps in order.

### Step 1. Supabase

You can use a new Supabase project or the one you already have. Everything lives in the `lamig` schema, so it won't touch other tables.

1. Open **SQL Editor**. Paste and run each file, in this order:
   `0001_schema.sql`, `0002_security.sql`, `0003_booking.sql`, `0004_automation.sql`, then `seed.sql`.
   Optional: `demo-data.sql` adds sample bookings so the admin pages are not empty.
2. Expose the schema to the API: **Project Settings > Data API > Exposed schemas**, add `lamig`, save.
3. Copy the **Project URL** and the **anon** (or **publishable**) key from **Project Settings > API Keys**.

### Step 2. Run the website locally

```bash
npm install
cp .env.example .env.local     # on Windows: copy .env.example .env.local
```

Fill in `.env.local` (the n8n values can wait until Step 5), then:

```bash
npm run dev
npm run check:security         # should end with "All checks passed"
```

Open http://localhost:3000. Free times and booking already work. The chat needs n8n (Step 5).

### Step 3. Your staff account

1. In Supabase, **Authentication > Users > Add user > Create new user**. Use your email and a password, and tick **Auto Confirm User**.
2. In **SQL Editor**, run (with your email):

```sql
insert into lamig.staff (user_id, full_name)
select id, 'Your Name' from auth.users where email = 'you@example.com';
```

3. Go to http://localhost:3000/admin and sign in.

### Step 4. Gmail app password (for sending email)

1. Turn on 2 Step Verification for the Gmail account that will send the emails.
2. Open https://myaccount.google.com/apppasswords, create an app password named "n8n", and copy the 16 letters.

### Step 5. n8n

Follow [n8n/SETUP.md](n8n/SETUP.md). You will create four credentials, import the two workflows, publish them, and copy two webhook URLs plus a shared secret into `.env.local`.

### Step 6. Deploy

1. Push to GitHub and import the repo in Vercel.
2. Add the five variables from `.env.local` in **Vercel > Project > Settings > Environment Variables**, then deploy.
3. In Supabase **Authentication > URL Configuration**, set the Site URL to your Vercel URL.

## Try it

| Do this | What should happen |
|---|---|
| Book on the website with your own email | Confirmation email within a minute. The booking shows in Admin > Appointments. |
| In the chat: "How much is split type cleaning?" | Answer with the price from the database |
| In the chat: "Can you book me a window type cleaning tomorrow morning?" | It checks free times, asks for your details, repeats them back, books after you say yes |
| In the chat: "My aircon is leaking since your cleaning" | It asks for a contact and passes it to staff. Admin > Inbox shows "Needs a person". |
| Change a price in the `lamig.services` table | The website and the AI use the new price right away |
| Mark a job done in Admin | The follow up email goes out a day later |
| Turn off the Notifications workflow and book | After 15 minutes, Admin > Automation shows the emails as late |

To test reminders and follow ups without waiting, run this in the SQL Editor, then wait up to 5 minutes:

```sql
update lamig.notifications set send_at = now() where status = 'pending';
```

## Day to day: running the automation

Automation removes the manual work, but someone still keeps it healthy. Once a day:

- **Admin > Inbox**: call or text everyone marked "Needs a person", then mark it handled.
- **Admin > Automation**: the banner should say "On schedule". Use "Send again" on failed emails after fixing the cause.
- **Admin > Appointments**: mark finished jobs done, so follow ups go out.

Once a week:

- Read a few chats in the Inbox. If the AI got something wrong, fix the business info, FAQs or services in Supabase (the AI reads them on every message), or adjust the system message in the AI Receptionist node.
- In n8n, open **Executions** for both workflows and look for errors.
- Check your Gemini usage in Google AI Studio.

## Development tools

- **Next.js 16** (App Router, Server Actions, `proxy.ts`), **TypeScript**, **Tailwind CSS 4**, ESLint
- **Supabase**: Postgres functions, row level security, Auth, `@supabase/ssr`
- **n8n 2.x**: Webhook, Schedule Trigger, AI Agent, Google Gemini Chat Model, Postgres and Postgres Tool, Code, Send Email
- **Fonts**: Archivo and Atkinson Hyperlegible, self hosted through Fontsource
- **AI coding assistant**: Claude (Anthropic) helped write the code, SQL, workflows and docs. Everything was tested on a local Postgres 17, PostgREST and n8n 2.44 with a mocked Gemini and mail server: 68 database tests (booking rules, double booking race, notification retries, permissions), both workflows end to end, and the website in a headless browser.

See [ARCHITECTURE.md](ARCHITECTURE.md) for how the pieces fit and why.
