-- استكمال فهارس المفاتيح الخارجية التي أظهرها Database Advisor بعد تطبيق الجدول.
-- لا يغير بيانات أو صلاحيات أو سياسات RLS.

begin;

create index if not exists user_module_access_organization_idx
  on public.user_module_access (organization_id);

create index if not exists user_module_access_revoked_by_idx
  on public.user_module_access (revoked_by)
  where revoked_by is not null;

commit;
