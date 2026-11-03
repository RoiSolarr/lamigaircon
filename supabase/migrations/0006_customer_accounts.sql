-- 0006_customer_accounts.sql
-- Customer accounts and staff replies in chats.
--
--   * customer_accounts: customers who sign in on the website (name, phone).
--     Kept separate from lamig.customers on purpose: linking an account to
--     existing bookings by email would let anyone who signs up with someone
--     else's email see that person's details.
--   * conversations now know who they belong to: the signed in account, or the
--     customer who booked in that chat. The admin Inbox shows that name.
--   * staff can reply in a chat. A reply pauses the AI for that chat, so the
--     customer talks to the person until staff let the AI answer again.
--
-- Run after 0001 to 0005.

-- ---------------------------------------------------------------------------
-- Tables and columns
-- ---------------------------------------------------------------------------

create table lamig.customer_accounts (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null check (length(trim(full_name)) between 2 and 100),
  phone       text not null default '',
  email       text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table lamig.conversations
  add column account_id  uuid references lamig.customer_accounts (user_id) on delete set null,
  add column customer_id uuid references lamig.customers (id) on delete set null,
  add column ai_paused   boolean not null default false;

create index conversations_account_idx  on lamig.conversations (account_id, last_message_at desc);
create index conversations_customer_idx on lamig.conversations (customer_id);

alter table lamig.messages drop constraint messages_role_check;
alter table lamig.messages add constraint messages_role_check check (role in ('user', 'assistant', 'staff'));

-- ---------------------------------------------------------------------------
-- A booking made in a chat names that chat's customer
-- ---------------------------------------------------------------------------

create or replace function lamig._link_conversation_customer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.conversation_id is not null then
    update lamig.conversations
       set customer_id = new.customer_id
     where id = new.conversation_id and customer_id is null;
  end if;
  return null;
end;
$$;

create trigger appointments_link_conversation
  after insert on lamig.appointments
  for each row execute function lamig._link_conversation_customer();

-- Chats that already have a booking.
update lamig.conversations c
   set customer_id = a.customer_id
  from lamig.appointments a
 where a.conversation_id = c.id and c.customer_id is null;

-- ---------------------------------------------------------------------------
-- Customer account functions (signed in customers)
-- ---------------------------------------------------------------------------

-- Create or update the signed in customer's account.
create or replace function lamig.save_my_account(p_full_name text, p_phone text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_name  text := trim(coalesce(p_full_name, ''));
  v_phone text := regexp_replace(coalesce(p_phone, ''), '[\s().-]', '', 'g');
  v_email text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in first.');
  end if;
  if length(v_name) < 2 or length(v_name) > 100 then
    return jsonb_build_object('ok', false, 'error', 'Please give your full name.');
  end if;
  if v_phone <> '' and v_phone !~ '^\+?[0-9]{10,13}$' then
    return jsonb_build_object('ok', false, 'error', 'Please give a valid mobile number, like 09171234567.');
  end if;

  select lower(email) into v_email from auth.users where id = auth.uid();

  insert into lamig.customer_accounts (user_id, full_name, phone, email)
  values (auth.uid(), v_name, v_phone, coalesce(v_email, ''))
  on conflict (user_id) do update
    set full_name = excluded.full_name, phone = excluded.phone, email = excluded.email, updated_at = now();

  return jsonb_build_object('ok', true);
end;
$$;

-- Attach a chat to the signed in customer (only chats nobody owns yet).
create or replace function lamig.claim_conversation(p_conversation_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or p_conversation_id is null
     or not exists (select 1 from lamig.customer_accounts where user_id = auth.uid()) then
    return jsonb_build_object('ok', false);
  end if;

  insert into lamig.conversations (id, account_id)
  values (p_conversation_id, auth.uid())
  on conflict (id) do update
    set account_id = excluded.account_id
    where lamig.conversations.account_id is null;

  return jsonb_build_object('ok', true);
end;
$$;

-- The signed in customer's latest chat, to continue it on another device.
create or replace function lamig.my_latest_conversation()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_convo lamig.conversations;
begin
  if auth.uid() is null then
    return jsonb_build_object('conversation_id', null);
  end if;

  select * into v_convo from lamig.conversations
  where account_id = auth.uid()
  order by last_message_at desc
  limit 1;

  if v_convo.id is null then
    return jsonb_build_object('conversation_id', null);
  end if;

  return jsonb_build_object(
    'conversation_id', v_convo.id,
    'paused', v_convo.ai_paused,
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'role', m.role, 'content', m.content) order by m.id)
      from (select id, role, content from lamig.messages
            where conversation_id = v_convo.id order by id desc limit 40) m
    ), '[]'::jsonb)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Chat functions for the website (anyone with the chat id)
-- ---------------------------------------------------------------------------

-- When staff have taken over a chat, save the customer's message here instead
-- of sending it to the AI. Returns paused = false when the AI should answer.
create or replace function lamig.customer_message_if_paused(p_conversation_id uuid, p_message text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_message text := left(trim(coalesce(p_message, '')), 1000);
begin
  if not exists (select 1 from lamig.conversations where id = p_conversation_id and ai_paused) then
    return jsonb_build_object('paused', false);
  end if;
  if v_message = '' then
    return jsonb_build_object('paused', true, 'error', 'Type a message first.');
  end if;
  if (select count(*) from lamig.messages
      where conversation_id = p_conversation_id and role = 'user'
        and created_at > now() - interval '10 minutes') >= 20 then
    return jsonb_build_object('paused', true, 'error', 'Too many messages. Please wait a few minutes.');
  end if;

  insert into lamig.messages (conversation_id, role, content) values (p_conversation_id, 'user', v_message);
  update lamig.conversations set last_message_at = now() where id = p_conversation_id;
  return jsonb_build_object('paused', true);
end;
$$;

-- Staff replies newer than p_after, so the chat window can show them.
create or replace function lamig.staff_messages(p_conversation_id uuid, p_after bigint)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'paused', coalesce((select ai_paused from lamig.conversations where id = p_conversation_id), false),
    'messages', coalesce((
      select jsonb_agg(jsonb_build_object('id', m.id, 'content', m.content, 'created_at', m.created_at) order by m.id)
      from lamig.messages m
      where m.conversation_id = p_conversation_id and m.role = 'staff' and m.id > coalesce(p_after, 0)
    ), '[]'::jsonb)
  );
$$;

-- ---------------------------------------------------------------------------
-- Staff functions (admin Inbox)
-- ---------------------------------------------------------------------------

create or replace function lamig.staff_reply(p_conversation_id uuid, p_message text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_message text := trim(coalesce(p_message, ''));
begin
  if not lamig.is_staff() then
    return jsonb_build_object('ok', false, 'error', 'Staff only.');
  end if;
  if v_message = '' or length(v_message) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'Write a reply of up to 2,000 characters.');
  end if;
  if not exists (select 1 from lamig.conversations where id = p_conversation_id) then
    return jsonb_build_object('ok', false, 'error', 'Chat not found.');
  end if;

  insert into lamig.messages (conversation_id, role, content) values (p_conversation_id, 'staff', v_message);
  update lamig.conversations set ai_paused = true, last_message_at = now() where id = p_conversation_id;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function lamig.set_ai_paused(p_conversation_id uuid, p_paused boolean)
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
  update lamig.conversations set ai_paused = coalesce(p_paused, false) where id = p_conversation_id;
  return jsonb_build_object('ok', found);
end;
$$;

-- ---------------------------------------------------------------------------
-- The AI receptionist sees staff replies in the history as "Staff member"
-- (same as 0005 otherwise)
-- ---------------------------------------------------------------------------
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
           case m.role when 'user' then 'Customer: ' when 'staff' then 'Staff member: ' else 'Receptionist: ' end || m.content,
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
-- Row level security and grants
-- ---------------------------------------------------------------------------

alter table lamig.customer_accounts enable row level security;

create policy "customer reads own account" on lamig.customer_accounts
  for select to authenticated using (user_id = (select auth.uid()));

create policy "admin reads accounts" on lamig.customer_accounts
  for select to authenticated using ((select lamig.is_staff()));

grant select on lamig.customer_accounts to authenticated;
grant all on lamig.customer_accounts to service_role;

revoke execute on function lamig._link_conversation_customer() from public, anon, authenticated;
revoke execute on function lamig.save_my_account(text, text) from public, anon;
revoke execute on function lamig.claim_conversation(uuid) from public, anon;
revoke execute on function lamig.my_latest_conversation() from public, anon;
revoke execute on function lamig.customer_message_if_paused(uuid, text) from public;
revoke execute on function lamig.staff_messages(uuid, bigint) from public;
revoke execute on function lamig.staff_reply(uuid, text) from public, anon;
revoke execute on function lamig.set_ai_paused(uuid, boolean) from public, anon;
revoke execute on function lamig.chat_start(uuid, text) from public, anon, authenticated;

grant execute on function lamig.save_my_account(text, text) to authenticated, service_role;
grant execute on function lamig.claim_conversation(uuid) to authenticated, service_role;
grant execute on function lamig.my_latest_conversation() to authenticated, service_role;
grant execute on function lamig.customer_message_if_paused(uuid, text) to anon, authenticated, service_role;
grant execute on function lamig.staff_messages(uuid, bigint) to anon, authenticated, service_role;
grant execute on function lamig.staff_reply(uuid, text) to authenticated, service_role;
grant execute on function lamig.set_ai_paused(uuid, boolean) to authenticated, service_role;
