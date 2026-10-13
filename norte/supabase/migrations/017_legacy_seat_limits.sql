-- O contrato anterior de concessões também passa pela contagem de licenças.
create or replace function norte_private.seat_usage(p_owner uuid) returns jsonb language sql volatile security definer set search_path='' as $$
  with people as (
    select lower(u.email) as email,max(case m.role when 'editor' then 3 when 'reviewer' then 2 else 1 end) as level from norte_private.members m join public.norte_projects p on p.id=m.project_id join auth.users u on u.id=m.user_id where p.owner_id=p_owner and p.deleted_at is null and m.expires_at>now() and m.user_id<>p_owner group by lower(u.email)
    union all select lower(i.email),max(case i.role when 'editor' then 3 when 'reviewer' then 2 else 1 end) from norte_private.invitations i join public.norte_projects p on p.id=i.project_id where p.owner_id=p_owner and p.deleted_at is null and i.status='pending' and i.expires_at>now() group by lower(i.email)
    union all select lower(u.email),max(case a.scope when 'review' then 2 else 1 end) from public.norte_access a join public.norte_projects p on p.id=a.project_id join auth.users u on u.id=a.user_id where p.owner_id=p_owner and p.deleted_at is null and a.expires_at>now() and a.user_id<>p_owner and not exists(select 1 from norte_private.members m where m.project_id=a.project_id and m.user_id=a.user_id) group by lower(u.email)
  ), unique_people as (select email,max(level) as level from people group by email)
  select jsonb_build_object('editors',count(*) filter(where level=3),'reviewers',count(*) filter(where level=2),'viewers',count(*) filter(where level=1)) from unique_people
$$;
create or replace function norte_private.enforce_plan_seats() returns trigger language plpgsql security definer set search_path='' as $$
declare owner uuid; a public.norte_accounts;
begin
  select owner_id into owner from public.norte_projects where id=new.project_id;
  select * into a from public.norte_accounts where user_id=owner for update;
  if a.contract_kind='legacy' or a.plan<>'professional' or a.professional_until<=now() then return new; end if;
  if exists(select 1 from jsonb_each_text(norte_private.seat_usage(owner)) s where s.value::integer>(a.seats->>s.key)::integer) then raise exception 'seat_limit'; end if;
  return new;
end $$;
create trigger norte_legacy_access_seats after insert or update on public.norte_access for each row execute function norte_private.enforce_plan_seats();
revoke all on all functions in schema norte_private from public,anon,authenticated;
