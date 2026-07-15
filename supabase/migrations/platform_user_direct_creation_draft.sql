-- Direct platform-user creation and mandatory first-login password change.
-- Existing profiles remain unaffected because the new flag defaults to false.

alter table public.profiles
  add column if not exists must_change_password boolean not null default false,
  add column if not exists password_changed_at timestamptz;

comment on column public.profiles.must_change_password is
  'Blocks application access until a directly-created user changes the temporary password.';

create or replace function private.guard_profile_password_state()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if (
    new.must_change_password is distinct from old.must_change_password
    or new.password_changed_at is distinct from old.password_changed_at
  ) and coalesce((select auth.role()), '') <> 'service_role'
    and current_user not in ('postgres', 'supabase_admin') then
    raise exception using
      errcode = '42501',
      message = 'Password state can only be changed by the secure backend service.';
  end if;

  return new;
end;
$function$;

revoke all on function private.guard_profile_password_state() from public;
revoke execute on function private.guard_profile_password_state() from anon, authenticated;

drop trigger if exists profiles_guard_password_state on public.profiles;
create trigger profiles_guard_password_state
before update of must_change_password, password_changed_at on public.profiles
for each row execute function private.guard_profile_password_state();

create or replace function public.platform_current_user_access_state()
returns table (
  is_active boolean,
  must_change_password boolean
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authenticated session is required.';
  end if;

  return query
  select p.is_active, p.must_change_password
  from public.profiles p
  where p.id = v_user_id;

  if not found then
    raise exception using errcode = '42501', message = 'Active profile is required.';
  end if;
end;
$function$;

revoke all on function public.platform_current_user_access_state() from public;
revoke execute on function public.platform_current_user_access_state() from anon;
grant execute on function public.platform_current_user_access_state() to authenticated;

