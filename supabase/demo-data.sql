-- demo-data.sql (optional)
-- Sample customers, bookings and a chat that needs a human, so the admin
-- pages have something to show before real traffic arrives. Run after seed.sql.
-- Uses @example.com addresses and creates no notifications, so no email is sent.
-- Remove later with the cleanup block at the bottom.

do $$
declare
  v_tz          text;
  v_today       date;
  v_day1        date;
  v_day2        date;
  v_past        date;
  v_ana         uuid;
  v_ben         uuid;
  v_carla       uuid;
  v_convo       uuid := '00000000-0000-4000-8000-000000000001';
  v_open_days   smallint[];
begin
  select timezone, open_days into v_tz, v_open_days from lamig.business_settings where id = 1;
  v_today := (now() at time zone v_tz)::date;

  -- Next two open days after today, and the last open day before today.
  select min(d) into v_day1 from (select v_today + i as d from generate_series(1, 20) i) x
   where extract(isodow from d)::smallint = any (v_open_days)
     and not exists (select 1 from lamig.closed_dates where closed_on = d);
  select min(d) into v_day2 from (select v_today + i as d from generate_series(1, 20) i) x
   where d > v_day1 and extract(isodow from d)::smallint = any (v_open_days)
     and not exists (select 1 from lamig.closed_dates where closed_on = d);
  select max(d) into v_past from (select v_today - i as d from generate_series(1, 20) i) x
   where extract(isodow from d)::smallint = any (v_open_days);

  insert into lamig.customers (name, phone, email) values ('Ana Reyes', '09175550101', 'ana.demo@example.com')
    on conflict (email) do update set name = excluded.name returning id into v_ana;
  insert into lamig.customers (name, phone, email) values ('Ben Castillo', '09175550102', 'ben.demo@example.com')
    on conflict (email) do update set name = excluded.name returning id into v_ben;
  insert into lamig.customers (name, phone, email) values ('Carla Mendoza', '09175550103', 'carla.demo@example.com')
    on conflict (email) do update set name = excluded.name returning id into v_carla;

  insert into lamig.conversations (id, needs_human, handoff_name, handoff_contact, handoff_reason, handoff_requested_at)
  values (v_convo, true, 'Carla Mendoza', '09175550103',
          'Customer says her split type unit is leaking water after a cleaning last week and wants someone to check it.',
          now() - interval '20 minutes')
  on conflict (id) do nothing;

  insert into lamig.messages (conversation_id, role, content, created_at)
  select v_convo, v.role, v.content, now() - v.ago
  from (values
    ('user', 'Hi, my aircon is leaking water since the cleaning last week', interval '24 minutes'),
    ('assistant', 'Sorry to hear that! Our cleaning has a 7 day warranty, so a staff member should look at this. May I have your name and mobile number so they can contact you?', interval '23 minutes'),
    ('user', 'Carla Mendoza, 09175550103', interval '21 minutes'),
    ('assistant', 'Thank you, Carla. I have passed this to our staff and someone will contact you at 09175550103 soon, usually within business hours today.', interval '20 minutes')
  ) as v(role, content, ago)
  where not exists (select 1 from lamig.messages where conversation_id = v_convo);

  insert into lamig.appointments (ref, customer_id, service_id, starts_at, ends_at, address, notes, status, source, completed_at)
  select 'LMG-DEMO01', v_ana, s.id,
         (v_past + time '09:00') at time zone v_tz, (v_past + time '11:00') at time zone v_tz,
         '12 Rizal St., Brgy. Poblacion, Ibaan, Batangas', 'Bedroom unit', 'completed', 'website', now() - interval '1 day'
  from lamig.services s where s.code = 'split_cleaning'
  on conflict (ref) do nothing;

  insert into lamig.appointments (ref, customer_id, service_id, starts_at, ends_at, address, notes, status, source)
  select 'LMG-DEMO02', v_ben, s.id,
         (v_day1 + time '10:00') at time zone v_tz, (v_day1 + time '11:00') at time zone v_tz,
         '45 P. Burgos St., Brgy. 3, Batangas City', null, 'booked', 'chat'
  from lamig.services s where s.code = 'window_cleaning'
  on conflict (ref) do nothing;

  insert into lamig.appointments (ref, customer_id, service_id, starts_at, ends_at, address, notes, status, source)
  select 'LMG-DEMO03', v_carla, s.id,
         (v_day2 + time '13:00') at time zone v_tz, (v_day2 + time '14:00') at time zone v_tz,
         '8 Mabini Ave., Brgy. Marawoy, Lipa City', 'Unit is not cooling', 'booked', 'website'
  from lamig.services s where s.code = 'checkup'
  on conflict (ref) do nothing;
end;
$$;

-- Cleanup (run this to remove the demo data):
-- delete from lamig.appointments where ref like 'LMG-DEMO%';
-- delete from lamig.conversations where id = '00000000-0000-4000-8000-000000000001';
-- delete from lamig.customers where email like '%.demo@example.com';
