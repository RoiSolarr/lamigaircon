-- 0001_schema.sql
-- Lamig Aircon: tables for the AI receptionist, booking and follow up automation.
-- Everything lives in its own "lamig" schema so it can share a Supabase project
-- with other apps (and with n8n's own tables) without name clashes.

create schema if not exists lamig;

-- ---------------------------------------------------------------------------
-- Business setup (edited by the owner in the Supabase table editor)
-- ---------------------------------------------------------------------------

-- Exactly one row (id = 1). Hours, crews and notification timing live here
-- so the booking rules and the AI receptionist read the same values.
create table lamig.business_settings (
  id                      smallint primary key default 1 check (id = 1),
  name                    text not null,
  phone                   text not null,
  email                   text not null,
  service_area            text not null,
  timezone                text not null default 'Asia/Manila',
  open_time               time not null default '08:00',
  close_time              time not null default '17:00',
  open_days               smallint[] not null default '{1,2,3,4,5,6}', -- ISO weekday, 1 = Monday, 7 = Sunday
  crews                   smallint not null default 2 check (crews between 1 and 20),
  min_notice_hours        smallint not null default 2 check (min_notice_hours >= 0),
  max_days_ahead          smallint not null default 30 check (max_days_ahead between 1 and 180),
  reminder_hours_before   smallint not null default 24 check (reminder_hours_before between 1 and 168),
  follow_up_hours_after   smallint not null default 24 check (follow_up_hours_after between 1 and 168),
  check (close_time > open_time)
);

create table lamig.services (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique check (code ~ '^[a-z0-9_]+$'),
  name              text not null,
  description       text not null,
  duration_minutes  integer not null check (duration_minutes between 60 and 480 and duration_minutes % 60 = 0),
  price_php         numeric(10, 2) not null check (price_php >= 0),
  is_active         boolean not null default true,
  sort_order        integer not null default 0
);

-- Questions the AI receptionist (and the FAQ section) answer from.
create table lamig.faqs (
  id          bigint generated always as identity primary key,
  question    text not null,
  answer      text not null,
  is_active   boolean not null default true,
  sort_order  integer not null default 0
);

-- Holidays and other days with no bookings.
create table lamig.closed_dates (
  closed_on  date primary key,
  reason     text not null
);

-- ---------------------------------------------------------------------------
-- Staff (people who can open the admin pages)
-- ---------------------------------------------------------------------------

create table lamig.staff (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null,
  role        text not null default 'admin' check (role in ('admin', 'technician')),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Customers, conversations and appointments
-- ---------------------------------------------------------------------------

create table lamig.customers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text not null,
  email       text not null unique check (email = lower(email)),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- One row per chat session. The id is the session id the browser generates.
create table lamig.conversations (
  id                    uuid primary key,
  created_at            timestamptz not null default now(),
  last_message_at       timestamptz not null default now(),
  needs_human           boolean not null default false,
  handoff_name          text,
  handoff_contact       text,
  handoff_reason        text,
  handoff_requested_at  timestamptz,
  resolved_at           timestamptz
);

create table lamig.messages (
  id               bigint generated always as identity primary key,
  conversation_id  uuid not null references lamig.conversations (id) on delete cascade,
  role             text not null check (role in ('user', 'assistant')),
  content          text not null,
  created_at       timestamptz not null default now()
);

create table lamig.appointments (
  id               uuid primary key default gen_random_uuid(),
  ref              text not null unique,
  customer_id      uuid not null references lamig.customers (id),
  service_id       uuid not null references lamig.services (id),
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  address          text not null,
  notes            text,
  status           text not null default 'booked'
                   check (status in ('booked', 'completed', 'cancelled', 'no_show')),
  source           text not null check (source in ('website', 'chat', 'staff')),
  conversation_id  uuid references lamig.conversations (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  completed_at     timestamptz,
  cancelled_at     timestamptz,
  check (ends_at > starts_at)
);

-- ---------------------------------------------------------------------------
-- Notification outbox
-- The booking function writes rows here; the n8n Notifications workflow
-- claims due rows, sends the emails and marks each row sent or failed.
-- ---------------------------------------------------------------------------

create table lamig.notifications (
  id              bigint generated always as identity primary key,
  appointment_id  uuid not null references lamig.appointments (id) on delete cascade,
  kind            text not null check (kind in ('confirmation', 'reminder', 'follow_up')),
  channel         text not null default 'email' check (channel in ('email')),
  send_at         timestamptz not null,
  status          text not null default 'pending'
                  check (status in ('pending', 'sending', 'sent', 'failed', 'skipped')),
  attempts        smallint not null default 0,
  last_error      text,
  claimed_at      timestamptz,
  sent_at         timestamptz,
  created_at      timestamptz not null default now(),
  unique (appointment_id, kind)
);

-- ---------------------------------------------------------------------------
-- Indexes for the queries the app and the workflows run
-- ---------------------------------------------------------------------------

create index appointments_time_idx      on lamig.appointments (starts_at, ends_at) where status in ('booked', 'completed');
create index appointments_customer_idx  on lamig.appointments (customer_id);
create index appointments_service_idx   on lamig.appointments (service_id);
create index appointments_convo_idx     on lamig.appointments (conversation_id);
create index messages_convo_idx         on lamig.messages (conversation_id, id);
create index notifications_due_idx      on lamig.notifications (send_at) where status = 'pending';
create index notifications_status_idx   on lamig.notifications (status, created_at desc);
create index conversations_recent_idx   on lamig.conversations (last_message_at desc);
