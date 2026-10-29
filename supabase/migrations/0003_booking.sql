-- 0003_booking.sql
-- Booking rules. The website and the AI receptionist both call these two
-- functions, so a time slot means the same thing everywhere:
--
--   lamig.get_slots(service_code, date)            which start times are free
--   lamig.book_appointment(service_code, date, ...) book one of them
--
-- Both take the date as text ('YYYY-MM-DD') and return jsonb with ok: true or
-- ok: false plus a friendly error, so the AI can read the result and recover.

-- Human friendly date and time in the business timezone, e.g. "Wednesday, Oct 28, 9:00 AM".
create or replace function lamig.when_label(p_at timestamptz)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select to_char(p_at at time zone s.timezone, 'FMDay, Mon FMDD, FMHH12:MI AM')
  from lamig.business_settings s
  where s.id = 1;
$$;

-- Free start times for one service on one local date, as local 'HH24:MI'.
-- A start time is free when, for every hour the job would take, fewer
-- appointments overlap that hour than there are crews.
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
begin
  select * into v_settings from lamig.business_settings where id = 1;
  select make_interval(mins => s.duration_minutes) into v_duration
  from lamig.services s where s.id = p_service_id;

  if v_duration is null then
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

    if v_busiest < v_settings.crews then
      start_time := to_char(v_local, 'HH24:MI');
      slot_start := v_start;
      return next;
    end if;
  end loop;
end;
$$;

-- Free slots for a service on a date, with the reason when there are none.
create or replace function lamig.get_slots(p_service_code text, p_date text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_settings  lamig.business_settings;
  v_service   lamig.services;
  v_date      date;
  v_today     date;
  v_closed    text;
  v_slots     jsonb;
  v_reason    text;
begin
  select * into v_settings from lamig.business_settings where id = 1;
  select * into v_service from lamig.services
  where code = lower(trim(coalesce(p_service_code, ''))) and is_active;

  if v_service.id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'Unknown service. Use one of: ' ||
        (select string_agg(code, ', ' order by sort_order) from lamig.services where is_active)
    );
  end if;

  begin
    v_date := trim(p_date)::date;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'The date must look like YYYY-MM-DD.');
  end;

  v_today := (now() at time zone v_settings.timezone)::date;
  select reason into v_closed from lamig.closed_dates where closed_on = v_date;

  if v_date < v_today then
    v_reason := 'That date has already passed.';
  elsif v_date > v_today + v_settings.max_days_ahead then
    v_reason := format('We only take bookings up to %s days ahead.', v_settings.max_days_ahead);
  elsif not (extract(isodow from v_date)::smallint = any (v_settings.open_days)) then
    v_reason := format('We are closed on %ss.', trim(to_char(v_date, 'Day')));
  elsif v_closed is not null then
    v_reason := format('We are closed that day (%s).', v_closed);
  end if;

  if v_reason is null then
    select coalesce(jsonb_agg(
             jsonb_build_object(
               'start_time', f.start_time,
               'label', to_char(f.slot_start at time zone v_settings.timezone, 'FMHH12:MI AM')
             ) order by f.slot_start), '[]'::jsonb)
    into v_slots
    from lamig._free_start_times(v_service.id, v_date) f;

    if jsonb_array_length(v_slots) = 0 then
      v_reason := 'No free slots left that day. Please try another date.';
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'date', to_char(v_date, 'YYYY-MM-DD'),
    'date_label', to_char(v_date, 'FMDay, Mon FMDD'),
    'service', jsonb_build_object(
      'code', v_service.code,
      'name', v_service.name,
      'duration_minutes', v_service.duration_minutes,
      'price_php', v_service.price_php
    ),
    'slots', coalesce(v_slots, '[]'::jsonb),
    'reason', v_reason
  );
end;
$$;

-- Short booking reference like LMG-7K3P9Q (no 0/O or 1/I to avoid mixups).
create or replace function lamig._new_ref()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_ref   text;
begin
  loop
    v_ref := 'LMG-' || (
      select string_agg(substr(v_chars, 1 + floor(random() * length(v_chars))::int, 1), '')
      from generate_series(1, 6)
    );
    exit when not exists (select 1 from lamig.appointments where ref = v_ref);
  end loop;
  return v_ref;
end;
$$;

-- Book an appointment. Locks the day so two people can't take the last slot
-- at the same moment, saves the customer, the appointment and its
-- notifications (confirmation now, reminder before, follow up after).
create or replace function lamig.book_appointment(
  p_service_code     text,
  p_date             text,
  p_start_time       text,
  p_name             text,
  p_phone            text,
  p_email            text,
  p_address          text,
  p_notes            text default null,
  p_source           text default 'website',
  p_conversation_id  uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_settings     lamig.business_settings;
  v_service      lamig.services;
  v_date         date;
  v_name         text := trim(coalesce(p_name, ''));
  v_phone        text := regexp_replace(coalesce(p_phone, ''), '[\s().-]', '', 'g');
  v_email        text := lower(trim(coalesce(p_email, '')));
  v_address      text := trim(coalesce(p_address, ''));
  v_notes        text := nullif(trim(coalesce(p_notes, '')), '');
  v_start_time   text := trim(coalesce(p_start_time, ''));
  v_slot_start   timestamptz;
  v_customer_id  uuid;
  v_appt         lamig.appointments;
  v_reminder_at  timestamptz;
  -- Role from the Supabase JWT ('anon' or 'authenticated'); empty for direct
  -- database connections such as n8n's Postgres credential.
  v_caller_role  text := coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '');
begin
  -- Who may use which source
  if p_source is null or p_source not in ('website', 'chat', 'staff') then
    return jsonb_build_object('ok', false, 'error', 'Unknown booking source.');
  end if;
  if p_source = 'chat' and v_caller_role in ('anon', 'authenticated') then
    return jsonb_build_object('ok', false, 'error', 'Chat bookings come from the receptionist workflow only.');
  end if;
  if p_source = 'staff' and not lamig.is_staff() then
    return jsonb_build_object('ok', false, 'error', 'Only staff can create staff bookings.');
  end if;

  -- Input checks, worded so a customer (or the AI) knows what to fix
  if length(v_name) < 2 or length(v_name) > 100 then
    return jsonb_build_object('ok', false, 'error', 'Please give your full name.');
  end if;
  if v_phone !~ '^\+?[0-9]{10,13}$' then
    return jsonb_build_object('ok', false, 'error', 'Please give a valid mobile number, like 09171234567.');
  end if;
  if length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return jsonb_build_object('ok', false, 'error', 'Please give a valid email address. We send the confirmation there.');
  end if;
  if length(v_address) < 10 or length(v_address) > 300 then
    return jsonb_build_object('ok', false, 'error', 'Please give the full service address (house number, street, barangay, city).');
  end if;
  if length(coalesce(v_notes, '')) > 500 then
    return jsonb_build_object('ok', false, 'error', 'Notes are too long. Please keep them under 500 characters.');
  end if;
  if v_start_time !~ '^\d{1,2}:\d{2}$' then
    return jsonb_build_object('ok', false, 'error', 'The start time must look like HH:MM, for example 09:00.');
  end if;
  v_start_time := lpad(v_start_time, 5, '0');

  select * into v_settings from lamig.business_settings where id = 1;
  select * into v_service from lamig.services
  where code = lower(trim(coalesce(p_service_code, ''))) and is_active;
  if v_service.id is null then
    return jsonb_build_object('ok', false, 'error', 'Unknown service.');
  end if;

  begin
    v_date := trim(p_date)::date;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'The date must look like YYYY-MM-DD.');
  end;

  -- One booking at a time per day: the check below and the insert can't interleave.
  perform pg_advisory_xact_lock(hashtext('lamig.booking'), v_date - date '2000-01-01');

  select f.slot_start into v_slot_start
  from lamig._free_start_times(v_service.id, v_date) f
  where f.start_time = v_start_time;

  if v_slot_start is null
     or not (extract(isodow from v_date)::smallint = any (v_settings.open_days))
     or exists (select 1 from lamig.closed_dates where closed_on = v_date)
     or v_date > (now() at time zone v_settings.timezone)::date + v_settings.max_days_ahead then
    return jsonb_build_object('ok', false, 'error', 'That time is not available. Please pick another slot.');
  end if;

  if p_conversation_id is not null
     and not exists (select 1 from lamig.conversations where id = p_conversation_id) then
    p_conversation_id := null;
  end if;

  insert into lamig.customers (name, phone, email)
  values (v_name, v_phone, v_email)
  on conflict (email) do update
    set name = excluded.name, phone = excluded.phone, updated_at = now()
  returning id into v_customer_id;

  insert into lamig.appointments
    (ref, customer_id, service_id, starts_at, ends_at, address, notes, source, conversation_id)
  values
    (lamig._new_ref(), v_customer_id, v_service.id, v_slot_start,
     v_slot_start + make_interval(mins => v_service.duration_minutes),
     v_address, v_notes, p_source, p_conversation_id)
  returning * into v_appt;

  -- Notifications. The reminder is skipped when the job is too soon for one to help.
  insert into lamig.notifications (appointment_id, kind, send_at)
  values (v_appt.id, 'confirmation', now());

  v_reminder_at := v_appt.starts_at - make_interval(hours => v_settings.reminder_hours_before);
  if v_reminder_at > now() + interval '30 minutes' then
    insert into lamig.notifications (appointment_id, kind, send_at)
    values (v_appt.id, 'reminder', v_reminder_at);
  end if;

  insert into lamig.notifications (appointment_id, kind, send_at)
  values (v_appt.id, 'follow_up', v_appt.ends_at + make_interval(hours => v_settings.follow_up_hours_after));

  return jsonb_build_object(
    'ok', true,
    'ref', v_appt.ref,
    'service', v_service.name,
    'when', lamig.when_label(v_appt.starts_at),
    'starts_at', v_appt.starts_at,
    'price_php', v_service.price_php,
    'email', v_email
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants: visitors may check slots and book; the helpers stay private.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema lamig from public, anon, authenticated;
grant execute on function lamig.is_staff() to anon, authenticated, service_role;
grant execute on function lamig.get_slots(text, text) to anon, authenticated, service_role;
grant execute on function lamig.book_appointment(text, text, text, text, text, text, text, text, text, uuid)
  to anon, authenticated, service_role;
