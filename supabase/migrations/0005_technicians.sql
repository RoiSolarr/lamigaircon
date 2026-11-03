-- 0005_technicians.sql
-- Phase 2: job scheduling.
--
--   * technicians and their days off
--   * every appointment gets a technician; a time is free only when a
--     technician who works that day has no other job at that time
--   * a booking is assigned automatically (fewest jobs that day first)
--   * staff can reassign; technicians sign in and see only their own jobs
--   * schedule_emails: an outbox the n8n "Technician Schedules" workflow
--     sends from (tomorrow's schedule every evening, and an updated schedule
--     when a job changes after it was sent)
--
-- Run after 0001 to 0004, then run seed.sql again (it adds two technicians).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table lamig.technicians (
  id          uuid primary key default gen_random_uuid(),
  full_name   text not null check (length(trim(full_name)) between 2 and 100),
  phone       text,
  email       text check (email is null or (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  user_id     uuid unique references auth.users (id) on delete set null,
  is_active   boolean not null default true,
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create table lamig.technician_days_off (
  technician_id  uuid not null references lamig.technicians (id) on delete cascade,
  off_on         date not null,
  reason         text,
  primary key (technician_id, off_on)
);

alter table lamig.appointments
  add column technician_id uuid references lamig.technicians (id) on delete set null;

create index appointments_technician_idx on lamig.appointments (technician_id, starts_at);

-- Hour of the day (business timezone) when tomorrow's schedules go out.
alter table lamig.business_settings
  add column schedule_send_hour smallint not null default 18 check (schedule_send_hour between 0 and 23);

create table lamig.schedule_emails (
  id             bigint generated always as identity primary key,
  technician_id  uuid not null references lamig.technicians (id) on delete cascade,
  work_date      date not null,
  status         text not null default 'pending'
                 check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts       smallint not null default 0,
  send_count     smallint not null default 0,
  last_error     text,
  claimed_at     timestamptz,
  sent_at        timestamptz,
  created_at     timestamptz not null default now(),
  unique (technician_id, work_date)
);

create index schedule_emails_status_idx on lamig.schedule_emails (status, work_date);

-- ---------------------------------------------------------------------------
-- Who is signed in
-- ---------------------------------------------------------------------------

-- Admin (office staff). Technicians are in lamig.staff too, with role 'technician',
-- so is_staff() now means admin only.
create or replace function lamig.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from lamig.staff where user_id = auth.uid() and role = 'admin');
$$;

-- The signed in technician's id, or null.
create or replace function lamig.current_technician_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.id
  from lamig.technicians t
  join lamig.staff s on s.user_id = t.user_id and s.role = 'technician'
  where t.user_id = auth.uid() and t.is_active
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Scheduling helpers
-- ---------------------------------------------------------------------------

create or replace function lamig._has_technicians()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from lamig.technicians);
$$;

-- Works that day: active and no day off.
create or replace function lamig._tech_available(p_technician_id uuid, p_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from lamig.technicians t
    where t.id = p_technician_id and t.is_active
      and not exists (select 1 from lamig.technician_days_off d
                      where d.technician_id = t.id and d.off_on = p_date)
  );
$$;

-- Works that day and has no other job overlapping [p_start, p_end).
create or replace function lamig._tech_free(p_technician_id uuid, p_start timestamptz, p_end timestamptz, p_exclude uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select lamig._tech_available(
           p_technician_id,
           (p_start at time zone (select timezone from lamig.business_settings where id = 1))::date)
     and not exists (
           select 1 from lamig.appointments a
           where a.technician_id = p_technician_id
             and a.status in ('booked', 'completed')
             and a.id is distinct from p_exclude
             and a.starts_at < p_end and a.ends_at > p_start);
$$;

-- How many jobs can run at the same time on a date: technicians working that
-- day, or business_settings.crews when no technicians are set up yet.
create or replace function lamig._capacity(p_date date)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when not lamig._has_technicians() then (select crews from lamig.business_settings where id = 1)::integer
    else (select count(*)::integer from lamig.technicians t where lamig._tech_available(t.id, p_date))
  end;
$$;

-- The free technician with the fewest jobs that day, or null.
create or replace function lamig._pick_technician(p_start timestamptz, p_end timestamptz, p_exclude uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  with day as (
    select (p_start at time zone s.timezone)::date as d, s.timezone as tz
    from lamig.business_settings s where s.id = 1
  )
  select t.id
  from lamig.technicians t, day
  where lamig._tech_free(t.id, p_start, p_end, p_exclude)
  order by (select count(*) from lamig.appointments a
            where a.technician_id = t.id and a.status in ('booked', 'completed')
              and (a.starts_at at time zone day.tz)::date = day.d),
           t.sort_order, t.full_name
  limit 1;
$$;

-- Free start times, now based on technicians. Same output as before.
create or replace function lamig._free_start_times(p_service_id uuid, p_date date)
returns table (start_time text, slot_start timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_settings  lamig.business_settings;
  v_duration  interval;
  v_local     timestamp;
  v_start     timestamptz;
  v_busiest   integer;
  v_capacity  integer;
  v_has_techs boolean;
begin
  select * into v_settings from lamig.business_settings where id = 1;
  select make_interval(mins => s.duration_minutes) into v_duration
  from lamig.services s where s.id = p_service_id;

  if v_duration is null then
    return;
  end if;

  v_capacity := lamig._capacity(p_date);
  v_has_techs := lamig._has_technicians();
  if v_capacity < 1 then
    return;
  end if;

  for v_local in
    select generate_series(
      p_date + v_settings.open_time,
      p_date + v_settings.close_time - v_duration,
      interval '1 hour'
    )
  loop
    v_start := v_local at time zone v_settings.timezone;

    continue when v_start < now() + make_interval(hours => v_settings.min_notice_hours);

    -- Every job counts, including ones nobody is assigned to yet.
    select coalesce(max(busy), 0) into v_busiest
    from (
      select (
        select count(*)
        from lamig.appointments a
        where a.status in ('booked', 'completed')
          and a.starts_at < h + interval '1 hour'
          and a.ends_at > h
      ) as busy
      from generate_series(v_start, v_start + v_duration - interval '1 hour', interval '1 hour') as h
    ) per_hour;

    continue when v_busiest >= v_capacity;
    continue when v_has_techs and lamig._pick_technician(v_start, v_start + v_duration, null) is null;

    start_time := to_char(v_local, 'HH24:MI');
    slot_start := v_start;
    return next;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Triggers on appointments
-- ---------------------------------------------------------------------------

-- New appointments get a technician automatically. book_appointment() has
-- already checked (under its lock) that one is free.
create or replace function lamig._assign_on_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.technician_id is null and new.status = 'booked' and lamig._has_technicians() then
    new.technician_id := lamig._pick_technician(new.starts_at, new.ends_at, new.id);
  end if;
  return new;
end;
$$;

create trigger appointments_assign_on_insert
  before insert on lamig.appointments
  for each row execute function lamig._assign_on_insert();

-- When a job changes after a technician's schedule email went out, queue an
-- updated schedule for that technician and day (old and new technician).
-- Marking a job done or no show does not resend.
create or replace function lamig._appointment_schedule_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz     text;
  v_today  date;
begin
  if tg_op = 'UPDATE'
     and new.technician_id is not distinct from old.technician_id
     and new.starts_at = old.starts_at
     and (new.status = 'cancelled') = (old.status = 'cancelled') then
    return null;
  end if;

  select timezone into v_tz from lamig.business_settings where id = 1;
  v_today := (now() at time zone v_tz)::date;

  update lamig.schedule_emails e
     set status = 'pending', attempts = 0, last_error = null
   where e.send_count > 0
     and e.status <> 'sending'
     and e.work_date >= v_today
     and (   (tg_op in ('UPDATE', 'DELETE') and e.technician_id = old.technician_id
              and e.work_date = (old.starts_at at time zone v_tz)::date)
          or (tg_op in ('INSERT', 'UPDATE') and e.technician_id = new.technician_id
              and e.work_date = (new.starts_at at time zone v_tz)::date));
  return null;
end;
$$;

create trigger appointments_schedule_changed
  after insert or delete or update of technician_id, status, starts_at on lamig.appointments
  for each row execute function lamig._appointment_schedule_changed();

-- ---------------------------------------------------------------------------
-- Assigning jobs nobody is doing
-- ---------------------------------------------------------------------------

-- Gives a technician to upcoming booked jobs between two dates that have none,
-- or whose technician no longer works that day (day off, deactivated).
-- Returns how many jobs are still unassigned.
create or replace function lamig.assign_open_jobs(p_from date, p_to date)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tz     text;
  v_appt   record;
  v_tech   uuid;
  v_left   integer := 0;
begin
  if not lamig._has_technicians() then
    return 0;
  end if;
  select timezone into v_tz from lamig.business_settings where id = 1;

  for v_appt in
    select a.id, a.starts_at, a.ends_at, a.technician_id
    from lamig.appointments a
    where a.status = 'booked'
      and a.starts_at > now()
      and (a.starts_at at time zone v_tz)::date between p_from and p_to
      and (a.technician_id is null
           or not lamig._tech_available(a.technician_id, (a.starts_at at time zone v_tz)::date))
    order by a.starts_at
    for update of a
  loop
    v_tech := lamig._pick_technician(v_appt.starts_at, v_appt.ends_at, v_appt.id);
    if v_tech is distinct from v_appt.technician_id then
      update lamig.appointments set technician_id = v_tech, updated_at = now() where id = v_appt.id;
    end if;
    if v_tech is null then
      v_left := v_left + 1;
    end if;
  end loop;

  return v_left;
end;
$$;

-- ---------------------------------------------------------------------------
-- Schedule emails (n8n "Technician Schedules" workflow)
-- ---------------------------------------------------------------------------

-- Called every 15 minutes. It:
--   1. assigns open jobs for today and tomorrow
--   2. after schedule_send_hour, queues tomorrow's schedule for each technician with jobs
--   3. skips technicians without an email, and frees rows stuck in 'sending'
--   4. claims due rows (marks them 'sending') and returns each with its job list
create or replace function lamig.claim_schedule_emails(p_limit integer default 20)
returns table (
  schedule_id      bigint,
  is_update        boolean,
  attempt          smallint,
  technician_name  text,
  to_email         text,
  work_date        date,
  date_label       text,
  jobs             jsonb,
  business_name    text,
  business_phone   text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_settings  lamig.business_settings;
  v_today     date;
begin
  select * into v_settings from lamig.business_settings where id = 1;
  v_today := (now() at time zone v_settings.timezone)::date;

  perform lamig.assign_open_jobs(v_today, v_today + 1);

  if extract(hour from now() at time zone v_settings.timezone) >= v_settings.schedule_send_hour then
    insert into lamig.schedule_emails (technician_id, work_date)
    select distinct a.technician_id, v_today + 1
    from lamig.appointments a
    where a.technician_id is not null
      and a.status = 'booked'
      and (a.starts_at at time zone v_settings.timezone)::date = v_today + 1
    on conflict (technician_id, work_date) do nothing;
  end if;

  update lamig.schedule_emails e
     set status = 'skipped', last_error = 'Technician has no email address'
    from lamig.technicians t
   where t.id = e.technician_id and e.status = 'pending' and t.email is null;

  update lamig.schedule_emails
     set status = 'pending'
   where status = 'sending' and claimed_at < now() - interval '15 minutes';

  return query
  with due as (
    select e.id
    from lamig.schedule_emails e
    where e.status = 'pending' and e.work_date >= v_today
    order by e.work_date, e.id
    limit greatest(1, least(coalesce(p_limit, 20), 100))
    for update of e skip locked
  ),
  claimed as (
    update lamig.schedule_emails e
       set status = 'sending', claimed_at = now(), attempts = e.attempts + 1
      from due
     where e.id = due.id
    returning e.id, e.technician_id, e.work_date, e.attempts, e.send_count
  )
  select c.id,
         c.send_count > 0,
         c.attempts,
         t.full_name,
         t.email,
         c.work_date,
         to_char(c.work_date, 'FMDay, Mon FMDD'),
         coalesce((
           select jsonb_agg(jsonb_build_object(
                    'ref', a.ref,
                    'time', to_char(a.starts_at at time zone v_settings.timezone, 'FMHH12:MI AM'),
                    'end', to_char(a.ends_at at time zone v_settings.timezone, 'FMHH12:MI AM'),
                    'service', s.name,
                    'customer', cu.name,
                    'phone', cu.phone,
                    'address', a.address,
                    'notes', a.notes
                  ) order by a.starts_at)
           from lamig.appointments a
           join lamig.services s on s.id = a.service_id
           join lamig.customers cu on cu.id = a.customer_id
           where a.technician_id = c.technician_id
             and a.status = 'booked'
             and (a.starts_at at time zone v_settings.timezone)::date = c.work_date
         ), '[]'::jsonb),
         v_settings.name,
         v_settings.phone
  from claimed c
  join lamig.technicians t on t.id = c.technician_id
  order by c.work_date, t.sort_order, t.full_name;
end;
$$;

create or replace function lamig.mark_schedule_sent(p_schedule_id bigint)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update lamig.schedule_emails
     set status = 'sent', sent_at = now(), send_count = send_count + 1, last_error = null
   where id = p_schedule_id and status = 'sending';
  return jsonb_build_object('ok', found);
end;
$$;

create or replace function lamig.mark_schedule_failed(p_schedule_id bigint, p_error text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row lamig.schedule_emails;
begin
  update lamig.schedule_emails
     set status = case when attempts >= 3 then 'failed' else 'pending' end,
         last_error = left(coalesce(nullif(trim(p_error), ''), 'Unknown error'), 500)
   where id = p_schedule_id and status = 'sending'
  returning * into v_row;
  return jsonb_build_object('ok', v_row.id is not null, 'status', v_row.status);
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff and technician actions
-- ---------------------------------------------------------------------------

-- Admin: any change. Technician: only their own jobs, to done / no show / back to booked.
-- Setting a job back to booked needs a free technician at that time.
create or replace function lamig.set_appointment_status(p_appointment_id uuid, p_status text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_appt   lamig.appointments;
  v_admin  boolean := lamig.is_staff();
  v_tech   uuid := lamig.current_technician_id();
  v_assign uuid;
begin
  if p_status is null or p_status not in ('booked', 'completed', 'cancelled', 'no_show') then
    return jsonb_build_object('ok', false, 'error', 'Unknown status.');
  end if;

  select * into v_appt from lamig.appointments where id = p_appointment_id for update;
  if v_appt.id is null then
    return jsonb_build_object('ok', false, 'error', 'Appointment not found.');
  end if;

  if not v_admin then
    if v_tech is null or v_appt.technician_id is distinct from v_tech then
      return jsonb_build_object('ok', false, 'error', 'Staff only.');
    end if;
    if p_status = 'cancelled' or v_appt.status = 'cancelled' then
      return jsonb_build_object('ok', false, 'error', 'Ask the office to cancel or restore a job.');
    end if;
  end if;

  v_assign := v_appt.technician_id;
  if p_status = 'booked' and v_appt.status in ('cancelled', 'no_show') and lamig._has_technicians() then
    if v_assign is null or not lamig._tech_free(v_assign, v_appt.starts_at, v_appt.ends_at, v_appt.id) then
      v_assign := lamig._pick_technician(v_appt.starts_at, v_appt.ends_at, v_appt.id);
    end if;
    if v_assign is null then
      return jsonb_build_object('ok', false, 'error', 'No technician is free at that time anymore. Book a new time instead.');
    end if;
  end if;

  update lamig.appointments
     set status = p_status,
         technician_id = v_assign,
         updated_at = now(),
         completed_at = case when p_status = 'completed' then now() end,
         cancelled_at = case when p_status = 'cancelled' then now() end
   where id = p_appointment_id;

  return jsonb_build_object('ok', true);
end;
$$;

-- Admin: give a job to a technician (or null to unassign).
create or replace function lamig.set_appointment_technician(p_appointment_id uuid, p_technician_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_appt lamig.appointments;
begin
  if not lamig.is_staff() then
    return jsonb_build_object('ok', false, 'error', 'Staff only.');
  end if;

  select * into v_appt from lamig.appointments where id = p_appointment_id for update;
  if v_appt.id is null then
    return jsonb_build_object('ok', false, 'error', 'Appointment not found.');
  end if;

  if p_technician_id is not null
     and not lamig._tech_free(p_technician_id, v_appt.starts_at, v_appt.ends_at, v_appt.id) then
    return jsonb_build_object('ok', false,
      'error', 'That technician is off that day or already has a job at that time.');
  end if;

  update lamig.appointments
     set technician_id = p_technician_id, updated_at = now()
   where id = p_appointment_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- Admin: add or edit a technician.
create or replace function lamig.save_technician(
  p_technician_id uuid,
  p_full_name     text,
  p_phone         text,
  p_email         text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name  text := trim(coalesce(p_full_name, ''));
  v_phone text := nullif(regexp_replace(coalesce(p_phone, ''), '[\s().-]', '', 'g'), '');
  v_email text := nullif(lower(trim(coalesce(p_email, ''))), '');
  v_id    uuid;
begin
  if not lamig.is_staff() then
    return jsonb_build_object('ok', false, 'error', 'Staff only.');
  end if;
  if length(v_name) < 2 or length(v_name) > 100 then
    return jsonb_build_object('ok', false, 'error', 'Enter the technician''s full name.');
  end if;
  if v_phone is not null and v_phone !~ '^\+?[0-9]{10,13}$' then
    return jsonb_build_object('ok', false, 'error', 'Enter a valid mobile number, like 09171234567.');
  end if;
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'error', 'Enter a valid email, or leave it empty.');
  end if;

  if p_technician_id is null then
    insert into lamig.technicians (full_name, phone, email, sort_order)
    values (v_name, v_phone, v_email, coalesce((select max(sort_order) + 1 from lamig.technicians), 1))
    returning id into v_id;
    -- A new technician can take jobs nobody is doing yet.
    perform lamig.assign_open_jobs(
      (now() at time zone (select timezone from lamig.business_settings where id = 1))::date,
      (now() at time zone (select timezone from lamig.business_settings where id = 1))::date + 366);
  else
    update lamig.technicians set full_name = v_name, phone = v_phone, email = v_email
     where id = p_technician_id
    returning id into v_id;
    if v_id is null then
      return jsonb_build_object('ok', false, 'error', 'Technician not found.');
    end if;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- Admin: turn a technician on or off. Their upcoming jobs move to others.
create or replace function lamig.set_technician_active(p_technician_id uuid, p_active boolean)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_tz   text;
  v_left integer;
begin
  if not lamig.is_staff() then
    return jsonb_build_object('ok', false, 'error', 'Staff only.');
  end if;
  update lamig.technicians set is_active = coalesce(p_active, true) where id = p_technician_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Technician not found.');
  end if;

  select timezone into v_tz from lamig.business_settings where id = 1;
  v_left := lamig.assign_open_jobs((now() at time zone v_tz)::date, (now() at time zone v_tz)::date + 366);
  return jsonb_build_object('ok', true, 'unassigned', v_left);
end;
$$;

-- Admin: add or remove a day off. Jobs that day move to other technicians.
create or replace function lamig.set_day_off(p_technician_id uuid, p_date date, p_off boolean, p_reason text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_left integer;
begin
  if not lamig.is_staff() then
    return jsonb_build_object('ok', false, 'error', 'Staff only.');
  end if;
  if p_date is null then
    return jsonb_build_object('ok', false, 'error', 'Pick a date.');
  end if;
  if not exists (select 1 from lamig.technicians where id = p_technician_id) then
    return jsonb_build_object('ok', false, 'error', 'Technician not found.');
  end if;

  if coalesce(p_off, true) then
    insert into lamig.technician_days_off (technician_id, off_on, reason)
    values (p_technician_id, p_date, left(nullif(trim(coalesce(p_reason, '')), ''), 200))
    on conflict (technician_id, off_on) do update set reason = excluded.reason;
  else
    delete from lamig.technician_days_off where technician_id = p_technician_id and off_on = p_date;
  end if;

  v_left := lamig.assign_open_jobs(p_date, p_date);
  return jsonb_build_object('ok', true, 'unassigned', v_left);
end;
$$;

-- Admin: let a technician sign in. Create the user first in Supabase
-- (Authentication > Users), then link it here by email.
create or replace function lamig.link_technician_login(p_technician_id uuid, p_email text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_user  uuid;
  v_role  text;
  v_tech  lamig.technicians;
begin
  if not lamig.is_staff() then
    return jsonb_build_object('ok', false, 'error', 'Staff only.');
  end if;

  select * into v_tech from lamig.technicians where id = p_technician_id;
  if v_tech.id is null then
    return jsonb_build_object('ok', false, 'error', 'Technician not found.');
  end if;

  select id into v_user from auth.users where lower(email) = lower(trim(coalesce(p_email, ''))) limit 1;
  if v_user is null then
    return jsonb_build_object('ok', false,
      'error', 'No user with that email. Create it first in Supabase: Authentication > Users > Add user.');
  end if;

  select role into v_role from lamig.staff where user_id = v_user;
  if v_role = 'admin' then
    return jsonb_build_object('ok', false, 'error', 'That account is an admin. Use a different email for the technician.');
  end if;
  if exists (select 1 from lamig.technicians where user_id = v_user and id <> p_technician_id) then
    return jsonb_build_object('ok', false, 'error', 'That login already belongs to another technician.');
  end if;

  insert into lamig.staff (user_id, full_name, role)
  values (v_user, v_tech.full_name, 'technician')
  on conflict (user_id) do update set full_name = excluded.full_name, role = 'technician';

  update lamig.technicians set user_id = v_user where id = p_technician_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- Admin: send a failed or skipped schedule email again.
create or replace function lamig.retry_schedule_email(p_schedule_id bigint)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not lamig.is_staff() then
    return jsonb_build_object('ok', false, 'error', 'Staff only.');
  end if;
  update lamig.schedule_emails
     set status = 'pending', attempts = 0, last_error = null, claimed_at = null
   where id = p_schedule_id and status in ('failed', 'skipped');
  if not found then
    return jsonb_build_object('ok', false, 'error', 'Only failed or skipped emails can be sent again.');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

-- ---------------------------------------------------------------------------
-- The AI receptionist's business info: count technicians instead of crews
-- ---------------------------------------------------------------------------
-- Same as 0004, except the capacity line.
create or replace function lamig.chat_start(p_conversation_id uuid, p_message text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_settings     lamig.business_settings;
  v_convo        lamig.conversations;
  v_message      text := left(trim(coalesce(p_message, '')), 1000);
  v_today        date;
  v_history      text;
  v_recent       integer;
  v_last_day     integer;
  v_open_days    text;
  v_team         integer;
begin
  select * into v_settings from lamig.business_settings where id = 1;

  if p_conversation_id is null or v_message = '' then
    return jsonb_build_object('ok', false, 'limited', true, 'reply', 'Please type a message first.');
  end if;

  insert into lamig.conversations (id) values (p_conversation_id)
  on conflict (id) do update set last_message_at = now()
  returning * into v_convo;

  -- Simple limits that protect the free AI quota from one noisy visitor or a bot.
  select count(*) into v_recent from lamig.messages
  where conversation_id = p_conversation_id and role = 'user' and created_at > now() - interval '10 minutes';
  select count(*) into v_last_day from lamig.messages
  where role = 'user' and created_at > now() - interval '24 hours';

  if v_recent >= 20 or v_last_day >= 500 then
    return jsonb_build_object(
      'ok', true,
      'limited', true,
      'reply', format('We are getting a lot of messages right now. Please call or text us at %s, or book on the website.', v_settings.phone)
    );
  end if;

  select string_agg(
           case m.role when 'user' then 'Customer: ' else 'Receptionist: ' end || m.content,
           E'\n' order by m.id)
  into v_history
  from (
    select id, role, content from lamig.messages
    where conversation_id = p_conversation_id
    order by id desc
    limit 16
  ) m;

  insert into lamig.messages (conversation_id, role, content)
  values (p_conversation_id, 'user', v_message);

  v_today := (now() at time zone v_settings.timezone)::date;
  v_team := case when lamig._has_technicians()
                 then (select count(*)::integer from lamig.technicians where is_active)
                 else v_settings.crews end;

  select string_agg(to_char(date '2024-01-01' + (d - 1), 'FMDay'), ', ' order by d)
  into v_open_days
  from unnest(v_settings.open_days) d;

  return jsonb_build_object(
    'ok', true,
    'limited', false,
    'conversation_id', p_conversation_id,
    'message', v_message,
    'needs_human', v_convo.needs_human,
    'business_name', v_settings.name,
    'phone', v_settings.phone,
    'history', coalesce(v_history, '(no earlier messages, this is the first one)'),
    'now', to_char(now() at time zone v_settings.timezone, 'FMDay, YYYY-MM-DD, FMHH12:MI AM'),
    'business', format(
      E'Name: %s\nPhone: %s\nEmail: %s\nService area: %s\nOpen: %s, %s to %s\nWe have %s technicians, so we can do up to %s jobs at the same time (fewer on days someone is off).\nBookings need at least %s hours notice and can be made up to %s days ahead.',
      v_settings.name, v_settings.phone, v_settings.email, v_settings.service_area,
      v_open_days,
      to_char(v_settings.open_time, 'FMHH12:MI AM'), to_char(v_settings.close_time, 'FMHH12:MI AM'),
      v_team, v_team,
      v_settings.min_notice_hours, v_settings.max_days_ahead),
    'services', (
      select string_agg(
               format('- %s (service_code: %s). %s Takes about %s hour%s. Price: PHP %s per unit.',
                      s.name, s.code, s.description,
                      s.duration_minutes / 60, case when s.duration_minutes = 60 then '' else 's' end,
                      to_char(s.price_php, 'FM999,999,990')),
               E'\n' order by s.sort_order)
      from lamig.services s where s.is_active),
    'faqs', coalesce((
      select string_agg(format(E'Q: %s\nA: %s', f.question, f.answer), E'\n\n' order by f.sort_order)
      from lamig.faqs f where f.is_active), '(none)'),
    'calendar', (
      select string_agg(
               to_char(d, 'Dy YYYY-MM-DD') ||
               case when d = v_today then ' (today)' when d = v_today + 1 then ' (tomorrow)' else '' end ||
               case
                 when not (extract(isodow from d)::smallint = any (v_settings.open_days)) then ': closed'
                 when c.reason is not null then ': closed, ' || c.reason
                 else ''
               end,
               E'\n' order by d)
      from generate_series(0, 13) as g(i)
      cross join lateral (select v_today + g.i as d) dd
      left join lamig.closed_dates c on c.closed_on = dd.d)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table lamig.technicians          enable row level security;
alter table lamig.technician_days_off  enable row level security;
alter table lamig.schedule_emails      enable row level security;

-- Everyone signed in can read their own staff row (to know their role).
create policy "users read own staff row" on lamig.staff
  for select to authenticated using (user_id = (select auth.uid()));

create policy "admin reads technicians" on lamig.technicians
  for select to authenticated
  using ((select lamig.is_staff()) or user_id = (select auth.uid()));

create policy "admin reads days off" on lamig.technician_days_off
  for select to authenticated
  using ((select lamig.is_staff()) or technician_id = (select lamig.current_technician_id()));

create policy "admin reads schedule emails" on lamig.schedule_emails
  for select to authenticated using ((select lamig.is_staff()));

create policy "technician reads own jobs" on lamig.appointments
  for select to authenticated
  using (technician_id = (select lamig.current_technician_id()));

create policy "technician reads own customers" on lamig.customers
  for select to authenticated
  using (exists (select 1 from lamig.appointments a
                 where a.customer_id = customers.id
                   and a.technician_id = (select lamig.current_technician_id())));

grant select on lamig.technicians, lamig.technician_days_off, lamig.schedule_emails to authenticated;
grant all on lamig.technicians, lamig.technician_days_off, lamig.schedule_emails to service_role;
grant all on all sequences in schema lamig to service_role;

-- ---------------------------------------------------------------------------
-- Function grants (all lamig functions, old and new)
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema lamig from public, anon, authenticated;
grant execute on function lamig.is_staff() to anon, authenticated, service_role;
grant execute on function lamig.current_technician_id() to authenticated, service_role;
grant execute on function lamig.get_slots(text, text) to anon, authenticated, service_role;
grant execute on function lamig.book_appointment(text, text, text, text, text, text, text, text, text, uuid)
  to anon, authenticated, service_role;
grant execute on function lamig.set_appointment_status(uuid, text) to authenticated, service_role;
grant execute on function lamig.retry_notification(bigint) to authenticated, service_role;
grant execute on function lamig.resolve_handoff(uuid) to authenticated, service_role;
grant execute on function lamig.set_appointment_technician(uuid, uuid) to authenticated, service_role;
grant execute on function lamig.save_technician(uuid, text, text, text) to authenticated, service_role;
grant execute on function lamig.set_technician_active(uuid, boolean) to authenticated, service_role;
grant execute on function lamig.set_day_off(uuid, date, boolean, text) to authenticated, service_role;
grant execute on function lamig.link_technician_login(uuid, text) to authenticated, service_role;
grant execute on function lamig.retry_schedule_email(bigint) to authenticated, service_role;
