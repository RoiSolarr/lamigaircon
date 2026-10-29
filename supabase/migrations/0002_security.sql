-- 0002_security.sql
-- Who can see and change what.
--
--   anon (website visitors)  read business info, services, FAQs, closed dates.
--                            Everything else only through the functions in 0003
--                            (get_slots, book_appointment), never the raw tables.
--   authenticated + staff    read everything, change it through the staff
--                            functions in 0004.
--   n8n                      connects with the Postgres credential (table owner),
--                            and only calls the lamig.* functions in 0004.

-- Is the signed in user a staff member?
create or replace function lamig.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from lamig.staff where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Row level security on every table
-- ---------------------------------------------------------------------------

alter table lamig.business_settings enable row level security;
alter table lamig.services          enable row level security;
alter table lamig.faqs              enable row level security;
alter table lamig.closed_dates      enable row level security;
alter table lamig.staff             enable row level security;
alter table lamig.customers         enable row level security;
alter table lamig.conversations     enable row level security;
alter table lamig.messages          enable row level security;
alter table lamig.appointments      enable row level security;
alter table lamig.notifications     enable row level security;

-- Public business info
create policy "public reads settings"   on lamig.business_settings for select to anon, authenticated using (true);
create policy "public reads services"   on lamig.services          for select to anon, authenticated using (is_active or (select lamig.is_staff()));
create policy "public reads faqs"       on lamig.faqs              for select to anon, authenticated using (is_active or (select lamig.is_staff()));
create policy "public reads closed"     on lamig.closed_dates      for select to anon, authenticated using (true);

-- Staff only
create policy "staff reads staff"          on lamig.staff         for select to authenticated using ((select lamig.is_staff()));
create policy "staff reads customers"      on lamig.customers     for select to authenticated using ((select lamig.is_staff()));
create policy "staff reads conversations"  on lamig.conversations for select to authenticated using ((select lamig.is_staff()));
create policy "staff reads messages"       on lamig.messages      for select to authenticated using ((select lamig.is_staff()));
create policy "staff reads appointments"   on lamig.appointments  for select to authenticated using ((select lamig.is_staff()));
create policy "staff reads notifications"  on lamig.notifications for select to authenticated using ((select lamig.is_staff()));

-- ---------------------------------------------------------------------------
-- Grants. A custom schema gets no automatic grants, so list them here.
-- Writes are not granted to anon or authenticated at all: every change goes
-- through a security definer function that validates its input.
-- ---------------------------------------------------------------------------

grant usage on schema lamig to anon, authenticated, service_role;

grant select on lamig.business_settings, lamig.services, lamig.faqs, lamig.closed_dates
  to anon, authenticated;

grant select on lamig.staff, lamig.customers, lamig.conversations, lamig.messages,
  lamig.appointments, lamig.notifications
  to authenticated;

grant all on all tables in schema lamig to service_role;
grant all on all sequences in schema lamig to service_role;

-- Functions are executable by PUBLIC by default in Postgres. Every migration
-- that adds functions revokes that at the end and grants each one on purpose.
revoke execute on all functions in schema lamig from public, anon, authenticated;
grant execute on function lamig.is_staff() to anon, authenticated, service_role;
