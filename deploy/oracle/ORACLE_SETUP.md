# Run the AI receptionist n8n on Oracle Cloud (free)

Free Render was too small for the AI Agent (512 MB memory, a fraction of a CPU), so replies took minutes. An Oracle Cloud Always Free ARM VM gives n8n 2 CPUs and 12 GB of memory for free.

What runs where after this:

| Part | Where |
|---|---|
| Lamig Receptionist workflow (AI chat) | **n8n on Oracle** (this guide) |
| Lamig Notifications workflow (emails) | n8n on Render (`n8n-hiraiyatta91`), unchanged |
| Database (`lamig` schema) | Supabase, unchanged |
| Website | Vercel / your laptop, one setting changes |

On the VM, n8n stores its own data (workflows, credentials, executions) in a file on the VM's disk, not in Supabase. That avoids the database timeouts we saw on Render.

Plan about 45 minutes.

## 1. Create the Oracle Cloud account

1. Sign up at https://www.oracle.com/cloud/free/ ("Start for free").
2. A card is required for identity checks. The Always Free resources used here cost nothing.
3. **Home region:** choose carefully, it cannot be changed later.
   - Pick the region closest to your Supabase project. Check it in Supabase: **Project Settings > General > Region**. For example `us-east-1` is close to Oracle **US East (Ashburn)**, `us-west-1` to **US West (San Jose)**.
   - If you cannot match it, pick any region; it still works, each database call is just a bit slower.

## 2. Create the VM

In the Oracle console: **Menu > Compute > Instances > Create instance**.

| Setting | Value |
|---|---|
| Name | `lamig-n8n` |
| Image | **Canonical Ubuntu 24.04** (click *Change image*) |
| Shape | *Change shape* > **Ampere** > `VM.Standard.A1.Flex`, **2 OCPUs, 12 GB memory** |
| Networking | Create a new virtual cloud network and a **public subnet**, and keep **Assign a public IPv4 address** on |
| SSH keys | **Generate a key pair for me**, then click **Download private key** (and keep this file safe; you cannot download it again) |
| Boot volume | Default (about 47 GB) is fine |

Click **Create**. When the state is **Running**, copy the **Public IP address** from the instance page.

2 OCPUs and 12 GB is the Always Free limit for ARM since mid 2026. Do not choose more, or Oracle may stop the VM.

If you see **"Out of capacity"**, try another *Availability domain* on the same form, try again later in the day, or use 1 OCPU and 6 GB for now.

## 3. Open ports 80 and 443 in Oracle's network

1. On the instance page, click the **subnet** link (under Primary VNIC).
2. Open **Security** (or *Security Lists*) and click the **Default Security List**.
3. **Add Ingress Rules**, two rules:

| Source CIDR | IP Protocol | Destination Port |
|---|---|---|
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |

Port 22 (SSH) is already open by default.

## 4. Connect from your Windows laptop

Open **PowerShell** in the folder where the private key was downloaded (for example `Downloads`). Oracle names it like `ssh-key-2026-11-02.key`.

Windows refuses keys that other users can read, so lock the file first (once):

```powershell
icacls .\ssh-key-2026-11-02.key /inheritance:r
icacls .\ssh-key-2026-11-02.key /grant:r "$($env:USERNAME):(R)"
```

Copy this folder (`deploy\oracle` from the project) to the VM. Replace the key name and IP:

```powershell
scp -i .\ssh-key-2026-11-02.key -r C:\Users\solar\Music\lamig-aircon\deploy\oracle ubuntu@YOUR_IP:~/n8n
```

Type `yes` when asked about the fingerprint. Then log in:

```powershell
ssh -i .\ssh-key-2026-11-02.key ubuntu@YOUR_IP
```

## 5. Install and start n8n

On the VM (after `ssh`):

```bash
cd ~/n8n
bash setup.sh
```

The script:

1. opens ports 80 and 443 in the VM's own firewall (Oracle's Ubuntu blocks them by default),
2. installs Docker,
3. creates `.env` with your address (`YOUR-IP-WITH-DASHES.sslip.io`, a free name that points to your IP) and a new encryption key,
4. starts n8n and Caddy (Caddy gets the free HTTPS certificate).

At the end it prints your n8n address, your encryption key and the website setting. **Save the encryption key** in your password manager. If it is lost, n8n cannot read its saved credentials anymore.

Wait 1 to 2 minutes, then open the printed `https://...sslip.io` address in your browser.

## 6. Set up n8n

1. Create the owner account (any email and a new password; let Chrome save it).
2. Create the three credentials, same values as on Render:

| Credential | Type | Fields |
|---|---|---|
| `Lamig Postgres (Supabase)` | Postgres | Session pooler Host and User, Password, Database `postgres`, Port `5432`, Max connections `5`, **Ignore SSL Issues** on |
| `Gemini API` | Google Gemini (PaLM) API | your Gemini key (starts with `AIza`) |
| `Lamig webhook secret` | Header Auth | Name `x-lamig-secret`, Value = `N8N_WEBHOOK_SECRET` from `.env.local` |

3. Import `n8n/receptionist.json` (**Create workflow > ... > Import from File**).
4. Set the credentials on all nodes, and check the **Gemini** model (Gemini 3.8 Flash, or the newest Flash in the list).
5. **Ctrl+S**, then **Publish**.

## 7. Point the website at the new n8n

In `.env.local` (and later in Vercel's environment variables):

```
N8N_CHAT_WEBHOOK_URL=https://YOUR-IP-WITH-DASHES.sslip.io/webhook/lamig-chat
N8N_NOTIFY_WEBHOOK_URL=https://n8n-hiraiyatta91.onrender.com/webhook/lamig-notify
```

Restart `npm run dev`, click **Start a new chat**, and test:

1. "How much is split type cleaning?"
2. "Please check Friday morning." (uses the slot tool)
3. A full booking with your details, confirming with "yes".
4. New chat: "My aircon is leaking since your cleaning." (handoff to Admin > Inbox)

Each reply should take a few seconds. Check times in n8n **Executions**.

## 8. Clean up the Render attempt

1. Supabase SQL Editor, stop the keep alive ping:
   ```sql
   select cron.unschedule('wake-lamig-receptionist');
   ```
2. Render, service `lamig-receptionist`: **Settings > Suspend** (or delete it).
3. Optional, after a few days of everything working: remove its tables in Supabase:
   ```sql
   drop schema if exists n8n_receptionist cascade;
   ```
   Only this schema. Never run it with `n8n`, which belongs to Shortlist's n8n.

## Everyday commands (on the VM)

```bash
cd ~/n8n
sudo docker compose ps                 # is it running?
sudo docker compose logs -f n8n        # live n8n logs (Ctrl+C to stop)
sudo docker compose logs caddy         # HTTPS certificate problems
sudo docker compose restart n8n        # restart n8n
```

**Upgrade n8n on purpose:** change `N8N_VERSION` in `.env`, then `sudo docker compose up -d`. Read the n8n release notes first. The version is pinned so it never changes by surprise like `latest` did on Render.

**Back up** (workflows and credentials are in the `n8n_data` volume): in n8n, download the workflow JSON after changes. Keep `.env` safe; it holds the encryption key.

## Troubleshooting

| Problem | Check |
|---|---|
| Browser cannot reach the address | Ingress rules for 80 and 443 (step 3). On the VM: `sudo iptables -L INPUT -n --line-numbers` should show ACCEPT for ports 80 and 443 near the top. |
| Certificate error or "Not secure" | Wait 2 minutes after the first start. Then `sudo docker compose logs caddy`. Port 80 must be open for the certificate check. |
| `ssh`: "UNPROTECTED PRIVATE KEY FILE" | Run the two `icacls` lines in step 4. |
| `ssh`: connection timed out | The instance is not Running, or wrong IP. Port 22 must be in the security list. |
| Chat: 403 | `N8N_WEBHOOK_SECRET` in `.env.local` and the `Lamig webhook secret` credential differ. |
| Chat: 404 | Workflow not published in this n8n. |
| VM stopped by itself | Oracle may reclaim Always Free VMs that stay almost idle for 7 days. Start it again from the console (n8n starts automatically). Upgrading the account to Pay As You Go stops this; set a small budget alert (Billing > Budgets) if you do. |
| Public IP changed after stop/start | Oracle gives a new ephemeral IP. Run `bash setup.sh` again after setting `N8N_DOMAIN=` to empty in `.env`, then update `N8N_CHAT_WEBHOOK_URL`. To avoid this, reserve the IP: instance > VNIC > IPv4 addresses > edit > **Reserved public IP**. |
