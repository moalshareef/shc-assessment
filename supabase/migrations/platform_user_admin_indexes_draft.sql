-- فهارس المفاتيح الخارجية التي أشار إليها Performance Advisor.
create index if not exists user_organizations_created_by_idx
  on public.user_organizations (created_by);
create index if not exists user_organizations_updated_by_idx
  on public.user_organizations (updated_by);

create index if not exists user_invitations_primary_organization_idx
  on public.user_invitations (primary_organization_id);
create index if not exists user_invitations_created_by_idx
  on public.user_invitations (created_by);
create index if not exists user_invitations_sent_by_idx
  on public.user_invitations (sent_by)
  where sent_by is not null;
create index if not exists user_invitations_cancelled_by_idx
  on public.user_invitations (cancelled_by)
  where cancelled_by is not null;
