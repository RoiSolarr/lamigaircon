-- 0007_account_bookings.sql
-- Booking history for signed in customers.
--
-- A booking belongs to an account when:
--   * it was booked in a chat the customer had while signed in, or
--   * it is linked in lamig.account_bookings. The website links each booking
--     made while signed in. A customer can also link an older booking by giving
--     its reference AND the email used for it, so knowing someone's email alone
--     is never enough (same reason as in 0006).
--
-- The booking rules (get_slots, book_appointment) and existing policies are not changed.
-- Run after 0001 to 0006.

create table lamig.account_bookings (
  user_id         uuid not null references lamig.customer_accounts (user_id) on delete cascade,
  appointment_id  uuid not null references lamig.appointments (id) on delete cascade,
  created_at      timestamptz not null default now(),
  primary key (user_id, appointment_id)
);

create index account_bookings_appointment_idx on lamig.account_bookings (appointment_id);

-- ---------------------------------------------------------------------------
-- link_my_booking: add a booking to the signed in customer's history
-- ---------------------------------------------------------------------------
create or replace function lamig.link_my_booking(p_ref text, p_email text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id  uuid;
  v_ref text;
begin
  if auth.uid() is null
     or not exists (select 1 from lamig.customer_accounts where user_id = auth.uid()) then
    return jsonb_build_object('ok', false, 'error', 'Sign in and save your name first.');
  end if;

  select a.id, a.ref into v_id, v_ref
  from lamig.appointments a
  join lamig.customers c on c.id = a.customer_id
  where upper(a.ref) = upper(trim(coalesce(p_ref, '')))
    and c.email = lower(trim(coalesce(p_email, '')));

  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'No booking matches that reference and email. Check both and try again.');
  end if;

  insert into lamig.account_bookings (user_id, appointment_id)
  values (auth.uid(), v_id)
  on conflict do nothing;

  return jsonb_build_object('ok', true, 'ref', v_ref);
end;
$$;

-- ---------------------------------------------------------------------------
-- my_bookings: the signed in customer's bookings, newest first
-- ---------------------------------------------------------------------------
create or replace function lamig.my_bookings()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(row_to_json(b) order by b.starts_at desc), '[]'::jsonb)
  from (
    select a.ref, a.starts_at, a.ends_at, a.status, a.address, a.source,
           s.name as service, s.price_php
    from lamig.appointments a
    join lamig.services s on s.id = a.service_id
    where auth.uid() is not null
      and (
        a.id in (select appointment_id from lamig.account_bookings where user_id = auth.uid())
        or a.conversation_id in (select id from lamig.conversations where account_id = auth.uid())
      )
    order by a.starts_at desc
    limit 100
  ) b;
$$;

-- ---------------------------------------------------------------------------
-- Row level security and grants
-- ---------------------------------------------------------------------------

alter table lamig.account_bookings enable row level security;

create policy "admin reads account bookings" on lamig.account_bookings
  for select to authenticated using ((select lamig.is_staff()));

grant select on lamig.account_bookings to authenticated;
grant all on lamig.account_bookings to service_role;

revoke execute on function lamig.link_my_booking(text, text) from public, anon;
revoke execute on function lamig.my_bookings() from public, anon;

grant execute on function lamig.link_my_booking(text, text) to authenticated, service_role;
grant execute on function lamig.my_bookings() to authenticated, service_role;
