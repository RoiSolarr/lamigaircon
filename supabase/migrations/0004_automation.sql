-- 0004_automation.sql
-- Functions the n8n workflows call, plus the actions staff take in the admin pages.
--
-- Receptionist workflow:  chat_start, save_reply, request_human (+ get_slots, book_appointment)
-- Notifications workflow: claim_due_notifications, mark_notification_sent, mark_notification_failed
-- Admin pages:            set_appointment_status, retry_notification, resolve_handoff

-- ---------------------------------------------------------------------------
-- Receptionist
-- ---------------------------------------------------------------------------

-- Called at the start of every chat turn. Saves the customer's message and
-- returns everything the AI needs: earlier messages, business info, services,
-- FAQs and a 14 day calendar, all as ready to use text for the prompt.
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
      E'Name: %s\nPhone: %s\nEmail: %s\nService area: %s\nOpen: %s, %s to %s\nWe have %s cleaning crews, so we can do up to %s jobs at the same time.\nBookings need at least %s hours notice and can be made up to %s days ahead.',
      v_settings.name, v_settings.phone, v_settings.email, v_settings.service_area,
      v_open_days,
      to_char(v_settings.open_time, 'FMHH12:MI AM'), to_char(v_settings.close_time, 'FMHH12:MI AM'),
      v_settings.crews, v_settings.crews,
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

-- Save the receptionist's reply after the AI answers.
create or replace function lamig.save_reply(p_conversation_id uuid, p_reply text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into lamig.messages (conversation_id, role, content)
  values (p_conversation_id, 'assistant', left(coalesce(p_reply, ''), 4000));

  update lamig.conversations set last_message_at = now() where id = p_conversation_id;
  return jsonb_build_object('ok', true);
end;
$$;

-- The AI calls this when it can't help (complaints, repairs, cancellations,
-- anything it isn't sure about). Staff see it in the admin Inbox.
create or replace function lamig.request_human(
  p_conversation_id  uuid,
  p_name             text,
  p_contact          text,
  p_reason           text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_contact text := trim(coalesce(p_contact, ''));
begin
  if length(v_contact) < 7 then
    return jsonb_build_object('ok', false,
      'error', 'Ask the customer for a mobile number or email first, then try again.');
  end if;

  insert into lamig.conversations (id) values (p_conversation_id)
  on conflict (id) do nothing;

  update lamig.conversations
     set needs_human = true,
         handoff_name = left(nullif(trim(coalesce(p_name, '')), ''), 100),
         handoff_contact = left(v_contact, 100),
         handoff_reason = left(trim(coalesce(p_reason, '')), 500),
         handoff_requested_at = now(),
         resolved_at = null
   where id = p_conversation_id;

  return jsonb_build_object('ok', true,
    'message', 'Saved. Tell the customer a staff member will contact them soon, usually within business hours the same day.');
end;
$$;

-- ---------------------------------------------------------------------------
-- Notifications (outbox)
-- ---------------------------------------------------------------------------

-- Hand the workflow the notifications that are due, marking them 'sending'
-- so a second run can't send them twice. Also tidies up first:
--   * skips notifications whose appointment was cancelled or was a no show,
--     reminders for jobs that already started, and follow ups for jobs nobody
--     marked completed within 7 days (and reminders for jobs already done)
--   * puts rows stuck in 'sending' for 15 minutes (a crashed run) back to 'pending'
-- Follow ups only go out once staff mark the job completed.
create or replace function lamig.claim_due_notifications(p_limit integer default 20)
returns table (
  notification_id  bigint,
  kind             text,
  attempt          smallint,
  to_email         text,
  customer_name    text,
  ref              text,
  service_name     text,
  when_label       text,
  address          text,
  price_php        numeric,
  business_name    text,
  business_phone   text,
  business_email   text
)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  update lamig.notifications n
     set status = 'skipped',
         last_error = case
           when a.status in ('cancelled', 'no_show') then 'Appointment marked ' || a.status
           when n.kind = 'reminder' and a.status = 'completed' then 'Job already done'
           when n.kind = 'reminder' then 'Appointment already started'
           else 'Job was not marked completed within 7 days'
         end
    from lamig.appointments a
   where a.id = n.appointment_id
     and n.status = 'pending'
     and (   a.status in ('cancelled', 'no_show')
          or (n.kind = 'reminder' and (a.starts_at <= now() or a.status = 'completed'))
          or (n.kind = 'follow_up' and a.status = 'booked' and n.send_at < now() - interval '7 days'));

  update lamig.notifications
     set status = 'pending'
   where status = 'sending' and claimed_at < now() - interval '15 minutes';

  return query
  with due as (
    select n.id
    from lamig.notifications n
    join lamig.appointments a on a.id = n.appointment_id
    where n.status = 'pending'
      and n.send_at <= now()
      and (n.kind <> 'follow_up' or a.status = 'completed')
    order by n.send_at
    limit greatest(1, least(coalesce(p_limit, 20), 100))
    for update of n skip locked
  ),
  claimed as (
    update lamig.notifications n
       set status = 'sending', claimed_at = now(), attempts = n.attempts + 1
      from due
     where n.id = due.id
    returning n.id, n.kind, n.attempts, n.appointment_id
  )
  select c.id, c.kind, c.attempts, cu.email, cu.name, a.ref, s.name,
         lamig.when_label(a.starts_at), a.address, s.price_php,
         bs.name, bs.phone, bs.email
  from claimed c
  join lamig.appointments a on a.id = c.appointment_id
  join lamig.customers cu on cu.id = a.customer_id
  join lamig.services s on s.id = a.service_id
  cross join lamig.business_settings bs
  order by c.id;
end;
$$;

create or replace function lamig.mark_notification_sent(p_notification_id bigint)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update lamig.notifications
     set status = 'sent', sent_at = now(), last_error = null
   where id = p_notification_id and status = 'sending';
  return jsonb_build_object('ok', found);
end;
$$;

-- Retries twice more (after 10, then 20 minutes) before giving up as 'failed'.
create or replace function lamig.mark_notification_failed(p_notification_id bigint, p_error text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_row lamig.notifications;
begin
  update lamig.notifications
     set status = case when attempts >= 3 then 'failed' else 'pending' end,
         send_at = case when attempts >= 3 then send_at else now() + make_interval(mins => 10 * attempts) end,
         last_error = left(coalesce(nullif(trim(p_error), ''), 'Unknown error'), 500)
   where id = p_notification_id and status = 'sending'
  returning * into v_row;
  return jsonb_build_object('ok', v_row.id is not null, 'status', v_row.status);
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff actions (admin pages)
-- ---------------------------------------------------------------------------

create or replace function lamig.set_appointment_status(p_appointment_id uuid, p_status text)
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
  if p_status is null or p_status not in ('booked', 'completed', 'cancelled', 'no_show') then
    return jsonb_build_object('ok', false, 'error', 'Unknown status.');
  end if;

  update lamig.appointments
     set status = p_status,
         updated_at = now(),
         completed_at = case when p_status = 'completed' then now() end,
         cancelled_at = case when p_status = 'cancelled' then now() end
   where id = p_appointment_id;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Appointment not found.');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function lamig.retry_notification(p_notification_id bigint)
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

  update lamig.notifications
     set status = 'pending', attempts = 0, send_at = now(), last_error = null, claimed_at = null
   where id = p_notification_id and status in ('failed', 'skipped');

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Only failed or skipped notifications can be retried.');
  end if;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function lamig.resolve_handoff(p_conversation_id uuid)
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

  update lamig.conversations
     set needs_human = false, resolved_at = now()
   where id = p_conversation_id;
  return jsonb_build_object('ok', found);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. The receptionist and notification functions are for n8n only
-- (it connects as the database owner), so anon and authenticated get nothing.
-- ---------------------------------------------------------------------------
revoke execute on all functions in schema lamig from public, anon, authenticated;
grant execute on function lamig.is_staff() to anon, authenticated, service_role;
grant execute on function lamig.get_slots(text, text) to anon, authenticated, service_role;
grant execute on function lamig.book_appointment(text, text, text, text, text, text, text, text, text, uuid)
  to anon, authenticated, service_role;
grant execute on function lamig.set_appointment_status(uuid, text) to authenticated, service_role;
grant execute on function lamig.retry_notification(bigint) to authenticated, service_role;
grant execute on function lamig.resolve_handoff(uuid) to authenticated, service_role;
