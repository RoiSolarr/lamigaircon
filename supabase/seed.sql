-- seed.sql
-- Business setup for the fictional "Lamig Aircon Cleaning". Safe to run again:
-- it updates the settings row and adds services, FAQs and holidays that are missing.
-- Change anything here (or later in the Supabase table editor) and both the
-- website and the AI receptionist pick it up, no code changes needed.

insert into lamig.business_settings (
  id, name, phone, email, service_area, timezone,
  open_time, close_time, open_days, crews,
  min_notice_hours, max_days_ahead, reminder_hours_before, follow_up_hours_after
) values (
  1,
  'Lamig Aircon Cleaning',
  '0917 555 0123',
  'hello@lamigaircon.example',
  'Batangas City, Lipa, Ibaan, San Jose, Rosario, Cuenca and Tanauan in Batangas',
  'Asia/Manila',
  '08:00', '17:00', '{1,2,3,4,5,6}', 2,
  2, 30, 24, 24
)
on conflict (id) do update set
  name = excluded.name,
  phone = excluded.phone,
  email = excluded.email,
  service_area = excluded.service_area,
  timezone = excluded.timezone,
  open_time = excluded.open_time,
  close_time = excluded.close_time,
  open_days = excluded.open_days,
  crews = excluded.crews,
  min_notice_hours = excluded.min_notice_hours,
  max_days_ahead = excluded.max_days_ahead,
  reminder_hours_before = excluded.reminder_hours_before,
  follow_up_hours_after = excluded.follow_up_hours_after;

insert into lamig.services (code, name, description, duration_minutes, price_php, sort_order) values
  ('window_cleaning',
   'Window type cleaning',
   'Full cleaning of one window type unit: filter, evaporator and condenser coils, blower and drain. We bring our own cover and pressure washer.',
   60, 800, 1),
  ('split_cleaning',
   'Split type cleaning',
   'Cleaning of one split type (wall mounted) unit, indoor and outdoor: filters, coils, blower wheel and drain line.',
   120, 1500, 2),
  ('split_deep_cleaning',
   'Split type deep cleaning',
   'The indoor unit is taken down and washed fully. Best for units not cleaned in over a year, or with a bad smell or weak airflow.',
   180, 2800, 3),
  ('checkup',
   'Check up and diagnosis',
   'A technician checks a unit that is not cooling, leaking water, noisy or not turning on, then gives a repair quote. The fee is deducted if you approve the repair.',
   60, 500, 4)
on conflict (code) do nothing;

insert into lamig.faqs (question, answer, sort_order)
select v.question, v.answer, v.sort_order
from (values
  ('How often should I have my aircon cleaned?',
   'Every 3 to 6 months for homes. If the unit runs all day or there are pets at home, every 3 months.', 1),
  ('Do you charge a transportation fee?',
   'No, not inside our service area. For places outside it, message us first and staff will give a quote.', 2),
  ('How do I pay?',
   'Cash or GCash after the job is done. We give a receipt for every job.', 3),
  ('I have more than one unit. How do I book?',
   'Each booking covers one unit. Book one slot per unit (you can book the same time twice if the slot is still open, since we have two crews), or chat with us and a staff member will arrange it.', 4),
  ('What should I prepare before the technician arrives?',
   'Clear the area under and around the unit, make sure there is a power outlet and a water source nearby, and have someone 18 or older at home.', 5),
  ('Can I reschedule or cancel?',
   'Yes, free of charge if you tell us at least 12 hours before. Chat with us or reply to your confirmation email with your booking reference.', 6),
  ('Do you have a warranty?',
   'Yes, 7 days on cleaning. If the unit leaks or has a problem caused by our work, we come back for free.', 7),
  ('Do you do repairs?',
   'We start with a check up and diagnosis, then give a repair quote. Staff schedule the repair once you approve it.', 8)
) as v(question, answer, sort_order)
where not exists (select 1 from lamig.faqs f where f.question = v.question);

insert into lamig.closed_dates (closed_on, reason) values
  ('2026-11-30', 'Bonifacio Day'),
  ('2026-12-08', 'Feast of the Immaculate Conception'),
  ('2026-12-24', 'Christmas Eve'),
  ('2026-12-25', 'Christmas Day'),
  ('2026-12-30', 'Rizal Day'),
  ('2026-12-31', 'New Year''s Eve'),
  ('2027-01-01', 'New Year''s Day')
on conflict (closed_on) do nothing;
