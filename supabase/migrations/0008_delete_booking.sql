-- 0008_delete_booking.sql
-- Lets staff delete a finished booking (done, cancelled or no show) from
-- Booking history. Open (booked) jobs cannot be deleted here, so a booked
-- customer never loses their time slot by mistake.
--
-- Its emails (lamig.notifications) and account history links are removed with
-- it by the existing "on delete cascade" foreign keys.
-- The booking rules (get_slots, book_appointment) and existing policies are not changed.
-- Run after 0001 to 0007.

create or replace function lamig.delete_appointment(p_appointment_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ref     text;
  v_status  text;
begin
  if not lamig.is_staff() then
    return jsonb_build_object('ok', false, 'error', 'Staff only.');
  end if;

  select ref, status into v_ref, v_status
  from lamig.appointments
  where id = p_appointment_id
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'Booking not found. It may be deleted already.');
  end if;
  if v_status = 'booked' then
    return jsonb_build_object('ok', false, 'error', 'Open jobs cannot be deleted. Cancel it first.');
  end if;

  delete from lamig.appointments where id = p_appointment_id;
  return jsonb_build_object('ok', true, 'ref', v_ref);
end;
$$;

revoke execute on function lamig.delete_appointment(uuid) from public, anon;
grant execute on function lamig.delete_appointment(uuid) to authenticated, service_role;
