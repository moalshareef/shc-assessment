-- إصلاح تفويض حفظ الأنشطة التشغيلية على الملاحظة دون توسيع الصلاحيات.
-- تبقى العضويات القديمة والصلاحيات المركزية مدعومتين عبر Helper واحدة قابلة للاستخدام من RLS.

create or replace function private.financial_control_can_add_activity(
  p_workspace_id uuid,
  p_finding_id uuid,
  p_corrective_action_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    private.financial_control_can_manage_finding(p_workspace_id, p_finding_id)
    or private.financial_control_user_has_legacy_role(
      p_workspace_id,
      (select auth.uid()),
      array['specialist']::text[]
    )
    or (
      p_corrective_action_id is null
      and private.financial_control_can_work_finding(p_workspace_id, p_finding_id)
    )
    or (
      p_corrective_action_id is not null
      and private.financial_control_can_work_action(
        p_workspace_id,
        p_finding_id,
        p_corrective_action_id
      )
    );
$function$;

revoke all on function private.financial_control_can_add_activity(uuid, uuid, uuid)
from public, anon, authenticated;
grant execute on function private.financial_control_can_add_activity(uuid, uuid, uuid)
to authenticated;

drop policy if exists finding_comments_insert on public.finding_comments;
create policy finding_comments_insert on public.finding_comments
for insert to authenticated
with check (
  author_user_id = (select auth.uid())
  and private.financial_control_can_add_activity(
    workspace_id,
    finding_id,
    corrective_action_id
  )
);

drop policy if exists finding_messages_insert on public.finding_messages;
create policy finding_messages_insert on public.finding_messages
for insert to authenticated
with check (
  recorded_by = (select auth.uid())
  and private.financial_control_can_add_activity(
    workspace_id,
    finding_id,
    corrective_action_id
  )
);

select pg_catalog.pg_notify('pgrst', 'reload schema');
