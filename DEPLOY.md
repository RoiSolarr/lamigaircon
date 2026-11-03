# Deploy checklist

The code is ready to deploy. These steps are settings in your accounts that only you can change. Do them in order.

## 1. Move the AI receptionist off your laptop

Right now the Receptionist workflow runs in n8n on your laptop (http://localhost:5678). A website on Vercel cannot reach your laptop, so the chat would stop working once you deploy.

1. Open your n8n on Render. Import `n8n/receptionist.json` (or open the copy you already have there).
2. In its Gemini node, pick your Gemini credential and the model `models/gemini-3.5-flash`.
3. Check the Postgres and "Lamig webhook secret" credentials, then **Publish** the workflow.
4. Copy the **Production URL** of its Webhook node. It looks like `https://your-n8n.onrender.com/webhook/lamig-chat`.
5. Put that URL in `N8N_CHAT_WEBHOOK_URL` (step 4 below).
6. Keep Render awake with the wake up step in `n8n/SETUP.md`. A sleeping free Render service makes the first chat reply take up to a minute.

## 2. Supabase: sign in settings

In **Authentication > URL Configuration**:

* **Site URL:** your Vercel URL, for example `https://lamig-aircon.vercel.app`
* **Redirect URLs:** add both
  * `https://lamig-aircon.vercel.app/account/callback`
  * `http://localhost:3000/account/callback`

In **Authentication > Sign In / Providers > Email**:

* **Allow new users to sign up:** on
* **Minimum password length:** 8. The website also checks for an uppercase letter, a lowercase letter and a special character.
* **Confirm email:** your choice. Off means customers can sign in right after creating an account. On means they click a link in an email first.

## 3. Supabase: emails to customers

"Confirm email" and "Forgot password?" send emails from Supabase, not from n8n. Supabase's built in email sender only sends to members of your Supabase team, a few per hour. For real customers, add your own sender:

1. In Brevo, open **SMTP & API > SMTP** and copy the SMTP server, port, login and SMTP key.
2. In Supabase, **Authentication > Emails > SMTP Settings**, turn on **Custom SMTP** and paste them. Sender email: the address you verified in Brevo. Sender name: Lamig Aircon Cleaning.

Render blocks SMTP for n8n, but this connection goes from Supabase to Brevo, so it works.

## 4. Vercel

1. Push the project to GitHub (`.env.local` stays out because of `.gitignore`).
2. In Vercel, **Add New > Project**, import the repo.
3. Add these five variables in **Settings > Environment Variables**:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | same as `.env.local` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same as `.env.local` |
| `N8N_CHAT_WEBHOOK_URL` | the Render URL from step 1 |
| `N8N_NOTIFY_WEBHOOK_URL` | the Render URL of the Notifications webhook |
| `N8N_WEBHOOK_SECRET` | same as `.env.local` |

4. Deploy. If you add or change a variable later, redeploy so the site picks it up.

## 5. Test on the live site

| Do this | What should happen |
|---|---|
| Book on the website with your email | Confirmation email within a few minutes |
| Ask the chat "How much is split type cleaning?" | Answer with the price |
| Create an account, then chat | Admin > Inbox shows your name |
| Reply from Admin > Inbox | The reply shows in the customer chat within about 10 seconds |
| Sign out, then "Forgot password?" | Reset email arrives, the link opens "Set a new password" |
| Sign in at /admin/login | Appointments page |

## Optional, for a real business

* Cloudflare Turnstile on the booking form and chat, to stop bots.
* Your own domain in Vercel (**Settings > Domains**), then update the Site URL and Redirect URLs in step 2.
* Supabase Pro for daily backups.
