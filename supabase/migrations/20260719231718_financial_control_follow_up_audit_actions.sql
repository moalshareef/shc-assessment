begin;

create or replace function private.financial_control_audit_follow_up()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_operation text;
  v_audit_action text;
begin
  if tg_op = 'INSERT' then
    v_operation := 'CREATE';
    v_audit_action := 'INSERT';
  elsif old.status is distinct from new.status and new.status = 'completed' then
    v_operation := 'COMPLETE';
    v_audit_action := 'UPDATE';
  elsif old.status is distinct from new.status and new.status = 'cancelled' then
    v_operation := 'CANCEL';
    v_audit_action := 'UPDATE';
  else
    v_operation := 'UPDATE';
    v_audit_action := 'UPDATE';
  end if;

  insert into public.audit_logs (
    actor_user_id, table_name, record_id, action, old_data, new_data, created_at
  ) values (
    (select auth.uid()),
    'financial_control_follow_ups',
    new.id::text,
    v_audit_action,
    case when tg_op = 'UPDATE' then to_jsonb(old) else null end,
    to_jsonb(new) || jsonb_build_object('follow_up_audit_action', v_operation),
    pg_catalog.clock_timestamp()
  );

  return new;
end;
$$;

revoke all on function private.financial_control_audit_follow_up()
from public, anon, authenticated, service_role;

commit;
