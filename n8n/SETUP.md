# n8n setup

Two workflows:

| File | Workflow | Starts when |
|---|---|---|
| `receptionist.json` | Lamig Receptionist | The website sends a chat message (webhook `lamig-chat`) |
| `notifications.json` | Lamig Notifications | Every 5 minutes, and right after a website booking (webhook `lamig-notify`) |

Built and tested on n8n 2.44. Any recent 2.x version should work.

## 1. Create a shared secret

Both webhooks reject requests without the right `x-lamig-secret` header. Make a long random string (run in a terminal):

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Put it in `.env.local` as `N8N_WEBHOOK_SECRET`. You need it again below.

## 2. Create four credentials

In n8n go to **Overview > Credentials > Create credential**. Use these exact names, so the imported nodes are easy to match.

### Lamig Postgres (Supabase)

Type: **Postgres**. The values come from Supabase: click **Connect** at the top of your project, then **Session pooler** (Render needs the IPv4 pooler, not the direct connection).

| Field | Value |
|---|---|
| Host | the pooler host, like `aws-0-ap-southeast-1.pooler.supabase.com` |
| Database | `postgres` |
| User | `postgres.your-project-ref` |
| Password | your database password |
| Port | `5432` |
| SSL | `Require` (turn on **Ignore SSL Issues** if the test fails on the certificate) |

If your n8n already stores its own data in this Supabase project, you can copy the values from Render's environment variables.

### Gemini API

Type: **Google Gemini (PaLM) API**. Paste an API key from https://aistudio.google.com/apikey. Leave Host as it is.

### Lamig webhook secret

Type: **Header Auth**.

| Field | Value |
|---|---|
| Name | `x-lamig-secret` |
| Value | the secret from step 1 |

### Gmail SMTP

Type: **SMTP**.

| Field | Value |
|---|---|
| User | your full Gmail address |
| Password | the 16 letter app password (README, Step 4) |
| Host | `smtp.gmail.com` |
| Port | `465` |
| SSL/TLS | on |

## 3. Import the workflows

For each JSON file: **Overview > Create workflow**, then the **...** menu at the top right > **Import from File**.

Then in each workflow:

1. Open every node with a warning icon and pick the matching credential from step 2.
2. **Lamig Notifications > Send email**: change **From Email** to `Lamig Aircon Cleaning <your-address@gmail.com>`. Gmail only sends from your own address.
3. **Lamig Receptionist > Gemini**: check the model. It is set to `models/gemini-2.5-flash`. If that is not in the list, pick the newest Flash model (the one you use in other projects works).
4. Save, then click **Publish** at the top. A webhook only listens on its Production URL while the workflow is published.

## 4. Connect the website

Open each Webhook node (**Chat message in** and **Booking made**), switch to **Production URL**, copy it, and put it in `.env.local` (and later in Vercel):

```
N8N_CHAT_WEBHOOK_URL=https://your-n8n.onrender.com/webhook/lamig-chat
N8N_NOTIFY_WEBHOOK_URL=https://your-n8n.onrender.com/webhook/lamig-notify
```

Restart `npm run dev` after editing `.env.local`.

### Quick test from a terminal

PowerShell (Windows):

```powershell
$headers = @{ "x-lamig-secret" = "YOUR_SECRET" }
$body = '{"sessionId":"11111111-1111-4111-8111-111111111111","message":"Hi, how much is window type cleaning?"}'
Invoke-RestMethod -Method Post -Uri "https://your-n8n.onrender.com/webhook/lamig-chat" -Headers $headers -ContentType "application/json" -Body $body
```

You should get back `reply` with the price. Then check **Executions** in n8n to see each step.

## 5. Keep n8n awake (free Render plan)

A free Render service sleeps after 15 minutes without traffic. While asleep, the "Every 5 minutes" trigger does not run, and the first chat message waits about a minute while it wakes up.

Supabase can ping n8n on a schedule for free with `pg_cron` and `pg_net`. Run this once in the Supabase SQL Editor, with your URL and secret. Don't save it in a migration file, because it contains the secret.

```sql
create extension if not exists pg_net;
create extension if not exists pg_cron;

select cron.schedule(
  'lamig-wake-n8n',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := 'https://your-n8n.onrender.com/webhook/lamig-notify',
    headers := jsonb_build_object('content-type', 'application/json', 'x-lamig-secret', 'YOUR_SECRET'),
    body := '{"reason":"wake_up"}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
```

Every 10 minutes this wakes n8n and also sends any due emails. To stop it: `select cron.unschedule('lamig-wake-n8n');`

Render's free plan gives 750 instance hours a month per workspace. One service awake all month uses about 744, so this only fits if n8n is your only free service there.

## How the workflows work

**Lamig Receptionist**

1. **Chat message in** (Webhook, Header Auth) receives `{ sessionId, message }`.
2. **Save message and load context** runs `lamig.chat_start()`: it saves the message and returns the earlier messages, business info, services, FAQs and a 14 day calendar.
3. **Too many messages?** answers with a fixed message when a visitor sends more than 20 messages in 10 minutes, or the whole site passes 500 a day. This protects your free Gemini quota.
4. **AI Receptionist** (AI Agent with Gemini) answers. It has three tools, each one fixed SQL query where the AI only fills in the values:
   * `check_free_slots` runs `lamig.get_slots()`
   * `book_appointment` runs `lamig.book_appointment()` with source `chat`
   * `request_human` runs `lamig.request_human()`, which puts the chat in the admin Inbox
5. **Save reply** stores the answer, and **Reply to website** sends it back.
6. If Gemini fails (quota, outage), **Reply: AI failed** sends a polite message with the phone number instead of an error.

**Lamig Notifications**

1. **Every 5 minutes** or **Booking made** starts it.
2. **Claim due emails** runs `lamig.claim_due_notifications(20)`. It skips emails that no longer make sense (cancelled jobs, reminders for jobs already done), then returns the due ones and marks them "sending", so two runs never send the same email.
3. **Write the email** builds the subject and HTML for each kind (confirmation, reminder, follow up).
4. **Send email** sends through Gmail. On success **Mark sent**, on failure **Mark failed**, which retries after 10 and then 20 minutes before giving up. Failed emails show in Admin > Automation with the error and a "Send again" button.

## Troubleshooting

| Problem | Check |
|---|---|
| Website chat says the receptionist is not answering | The Receptionist workflow is published, `N8N_CHAT_WEBHOOK_URL` is the Production URL, and the secret matches on both sides. Look at n8n Executions. |
| 403 from a webhook | The `x-lamig-secret` value differs between `.env.local`/Vercel and the n8n credential |
| Postgres node: `relation "lamig..." does not exist` | The migrations were run in a different Supabase project than the one in the credential |
| Website: "Could not load business info" | `lamig` is not in Supabase **Exposed schemas**, or seed.sql was not run |
| Gemini: 429 | Free tier limit reached. Wait, or choose another Flash model. |
| Emails stuck as late in Admin > Automation | Notifications workflow not published, n8n asleep (see step 5), or Gmail app password wrong (see the error in Executions) |
| Gmail: "Username and Password not accepted" | Use the app password, not your normal password, and 2 Step Verification must be on |
