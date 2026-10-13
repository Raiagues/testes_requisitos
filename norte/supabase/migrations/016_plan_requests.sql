-- Catálogo proposto: solicitações não são pagamentos e não concedem acesso.
create table public.norte_plan_catalog (
  version integer primary key, active boolean not null default false,
  individual integer not null check(individual between 0 and 10000000),
  company integer not null check(company between 0 and 10000000),
  editor integer not null check(editor between 0 and 1000000),
  reviewer integer not null check(reviewer between 0 and 1000000),
  approved boolean not null default false,created_at timestamptz not null default now()
);
create unique index norte_plan_catalog_active on public.norte_plan_catalog(active) where active;
insert into public.norte_plan_catalog values(1,true,7900,14900,3900,1900,false,now());
alter table public.norte_plan_catalog enable row level security;
grant select on public.norte_plan_catalog to anon,authenticated;
create policy norte_plan_catalog_read on public.norte_plan_catalog for select to anon,authenticated using(active);
create table norte_private.plan_requests (
  id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),
  client_key uuid not null,selection jsonb not null,quote jsonb not null,
  status text not null default 'requested' check(status in ('requested','contacted','confirmed','cancelled')),
  version integer not null default 1,created_at timestamptz not null default now(),confirmed_at timestamptz,
  unique(user_id,client_key)
);
alter table norte_private.plan_requests enable row level security;
revoke all on norte_private.plan_requests from public,anon,authenticated;
alter table public.norte_accounts add column professional_until timestamptz;
alter table public.norte_accounts add column contract_kind text not null default 'legacy' check(contract_kind in ('legacy','individual','company'));
alter table public.norte_accounts add column seats jsonb not null default '{"editors":19,"reviewers":19,"viewers":19}';
create or replace function public.norte_entitlements() returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.norte_accounts; c public.norte_config; tier text;
begin
  a:=norte_private.account(); select * into c from public.norte_config where active;
  tier:=case when a.plan='professional' and (a.professional_until is null or a.professional_until>now()) then 'professional' when a.trial_ends_at>now() then 'trial' else 'essential' end;
  return jsonb_build_object('tier',tier,'limits',c.limits->tier,'trialStartedAt',a.trial_started_at,'trialEndsAt',a.trial_ends_at,'editableProject',a.editable_project,'serverTime',now(),'contractKind',a.contract_kind,'professionalUntil',a.professional_until,'seats',a.seats);
end $$;
create or replace function norte_private.team_advanced(p public.norte_projects) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.norte_accounts a join auth.users u on u.id=a.user_id where a.user_id=p.owner_id and not a.suspended and (u.banned_until is null or u.banned_until<now()) and ((a.plan='professional' and (a.professional_until is null or a.professional_until>now())) or a.trial_ends_at>now()))
$$;
create function public.norte_plan_quote(p_selection jsonb) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare c public.norte_plan_catalog; ed integer; re integer; vi integer; amount integer;
begin
  perform norte_private.assert_keys(p_selection,array['kind','company','editors','reviewers','viewers']);
  if jsonb_typeof(p_selection) is distinct from 'object' or (select count(*) from jsonb_each(p_selection))<>5 or coalesce(p_selection->>'kind','') not in ('individual','company') or jsonb_typeof(p_selection->'company') is distinct from 'string' or length(p_selection->>'company')>120 then raise exception 'invalid_fields'; end if;
  if exists(select 1 from jsonb_each(p_selection) v where v.key in ('editors','reviewers','viewers') and (jsonb_typeof(v.value)<>'number' or v.value::text !~ '^[0-9]{1,2}$')) then raise exception 'invalid_fields'; end if;
  ed:=(p_selection->>'editors')::integer; re:=(p_selection->>'reviewers')::integer; vi:=(p_selection->>'viewers')::integer;
  if ed+re+vi>19 or (p_selection->>'kind'='individual' and (ed<>0 or re>1 or vi>3)) or (p_selection->>'kind'='company' and length(trim(p_selection->>'company'))<2) then raise exception 'invalid_fields'; end if;
  select * into c from public.norte_plan_catalog where active;
  amount:=case when p_selection->>'kind'='individual' then c.individual else c.company+ed*c.editor+re*c.reviewer end;
  return jsonb_build_object('version',c.version,'kind',p_selection->>'kind','monthlyCents',amount,'baseCents',case when p_selection->>'kind'='individual' then c.individual else c.company end,'editorCents',case when p_selection->>'kind'='individual' then 0 else ed*c.editor end,'reviewerCents',case when p_selection->>'kind'='individual' then 0 else re*c.reviewer end,'currency','BRL','approved',c.approved,'periodDays',30,'automaticRenewal',false,'paymentsProcessed',false);
end $$;
create function public.norte_plan_request(p_key uuid,p_selection jsonb,p_version integer,p_expected integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=norte_private.uid(); q jsonb; r norte_private.plan_requests;
begin
  perform norte_private.account();
  perform pg_advisory_xact_lock(hashtextextended(uid::text,16));
  select * into r from norte_private.plan_requests where user_id=uid and client_key=p_key;
  if r.id is not null then
    if r.selection is distinct from p_selection or (r.quote->>'version')::integer is distinct from p_version or (r.quote->>'monthlyCents')::integer is distinct from p_expected then raise exception 'idempotency_conflict'; end if;
    return to_jsonb(r);
  end if;
  q:=public.norte_plan_quote(p_selection);
  if p_key is null or (q->>'version')::integer is distinct from p_version or (q->>'monthlyCents')::integer is distinct from p_expected then raise exception 'quote_expired_or_changed'; end if;
  if (select count(*) from norte_private.plan_requests where user_id=uid and status in ('requested','contacted'))>=3 then raise exception 'content_limit'; end if;
  insert into norte_private.plan_requests(user_id,client_key,selection,quote) values(uid,p_key,p_selection,q) returning * into r;
  insert into public.norte_audit(actor_id,event) values(uid,'plan_requested'); return to_jsonb(r);
end $$;
create function public.norte_plan_requests(p_admin boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if p_admin then perform norte_private.require_admin('commercial'); end if;
  return coalesce((select jsonb_agg(to_jsonb(x)) from (select r.id,r.user_id,r.selection,r.quote,r.status,r.version,r.created_at,u.email,coalesce(nullif(f.name,''),split_part(u.email,'@',1)) as name from norte_private.plan_requests r join auth.users u on u.id=r.user_id left join norte_private.profiles f on f.user_id=r.user_id where p_admin or r.user_id=norte_private.uid() order by r.created_at desc limit 100) x),'[]');
end $$;
create function public.norte_plan_cancel(p_id uuid,p_version integer) returns void language plpgsql security definer set search_path='' as $$
begin
  update norte_private.plan_requests set status='cancelled',version=version+1 where id=p_id and user_id=norte_private.uid() and version=p_version and status in ('requested','contacted');
  if not found then raise exception 'version_conflict'; end if;
  insert into public.norte_audit(actor_id,event) values(norte_private.uid(),'plan_request_cancelled');
end $$;
create function public.norte_admin_plan_catalog(p_version integer,p_prices jsonb,p_approved boolean) returns integer language plpgsql security definer set search_path='' as $$
declare v integer;
begin
  perform norte_private.require_admin('commercial');
  perform norte_private.assert_keys(p_prices,array['individual','company','editor','reviewer']);
  if jsonb_typeof(p_prices) is distinct from 'object' or (select count(*) from jsonb_each(p_prices))<>4 or exists(select 1 from jsonb_each(p_prices) where jsonb_typeof(value)<>'number' or value::text !~ '^[0-9]{1,8}$') or p_approved is null then raise exception 'invalid_fields'; end if;
  lock table public.norte_plan_catalog in exclusive mode;
  select version into v from public.norte_plan_catalog where active;
  if v is distinct from p_version then raise exception 'version_conflict'; end if;
  update public.norte_plan_catalog set active=false where active;
  insert into public.norte_plan_catalog(version,active,individual,company,editor,reviewer,approved) values(v+1,true,(p_prices->>'individual')::integer,(p_prices->>'company')::integer,(p_prices->>'editor')::integer,(p_prices->>'reviewer')::integer,p_approved);
  insert into public.norte_audit(actor_id,event) values(norte_private.uid(),'plan_catalog_changed'); return v+1;
end $$;
create function public.norte_admin_plan_request(p_id uuid,p_version integer,p_status text,p_confirm boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare r norte_private.plan_requests; q jsonb;
begin
  perform norte_private.require_admin('commercial');
  select * into r from norte_private.plan_requests where id=p_id for update;
  if r.id is null then raise exception 'not_found'; end if;
  if r.version is distinct from p_version then raise exception 'version_conflict'; end if;
  if p_status is null or p_status not in ('contacted','confirmed','cancelled') or r.status in ('confirmed','cancelled') then raise exception 'invalid_fields'; end if;
  if p_status='confirmed' then
    perform 1 from public.norte_accounts where user_id=r.user_id for update;
    q:=public.norte_plan_quote(r.selection);
    if not coalesce(p_confirm,false) or not (q->>'approved')::boolean then raise exception 'offer_pending'; end if;
    -- O cliente precisa confirmar novamente uma cotação alterada.
    if (q-'approved') is distinct from (r.quote-'approved') then raise exception 'quote_expired_or_changed'; end if;
    if exists(select 1 from jsonb_each_text(norte_private.seat_usage(r.user_id)) s where s.value::integer>(r.selection->>s.key)::integer) then raise exception 'seat_limit'; end if;
    update public.norte_accounts set plan='professional',professional_until=greatest(now(),coalesce(professional_until,now()))+interval '30 days',contract_kind=r.selection->>'kind',seats=r.selection-array['kind','company'] where user_id=r.user_id;
  end if;
  update norte_private.plan_requests set status=p_status,version=version+1,confirmed_at=case when p_status='confirmed' then now() else null end where id=p_id;
  insert into public.norte_audit(actor_id,event,result) values(norte_private.uid(),'plan_request_'||p_status,p_id::text);
end $$;
-- Licenças pertencem ao contratante e valem para seus projetos. Uma pessoa é
-- contada uma vez, na função mais alta, incluindo convites ainda pendentes.
create function norte_private.seat_usage(p_owner uuid) returns jsonb language sql stable security definer set search_path='' as $$
  with people as (
    select lower(u.email) as email,max(case m.role when 'editor' then 3 when 'reviewer' then 2 else 1 end) as level from norte_private.members m join public.norte_projects p on p.id=m.project_id join auth.users u on u.id=m.user_id where p.owner_id=p_owner and p.deleted_at is null and m.expires_at>now() group by lower(u.email)
    union all select lower(i.email),max(case i.role when 'editor' then 3 when 'reviewer' then 2 else 1 end) from norte_private.invitations i join public.norte_projects p on p.id=i.project_id where p.owner_id=p_owner and p.deleted_at is null and i.status='pending' and i.expires_at>now() group by lower(i.email)
  ), unique_people as (select email,max(level) as level from people group by email)
  select jsonb_build_object('editors',count(*) filter(where level=3),'reviewers',count(*) filter(where level=2),'viewers',count(*) filter(where level=1)) from unique_people
$$;
create function norte_private.enforce_plan_seats() returns trigger language plpgsql security definer set search_path='' as $$
declare owner uuid; a public.norte_accounts; ed integer; re integer; vi integer;
begin
  select owner_id into owner from public.norte_projects where id=new.project_id;
  select * into a from public.norte_accounts where user_id=owner for update;
  if a.contract_kind='legacy' or a.plan<>'professional' or a.professional_until<=now() then return new; end if;
  with people as (
    select lower(u.email) as email,max(case m.role when 'editor' then 3 when 'reviewer' then 2 else 1 end) as level from norte_private.members m join public.norte_projects p on p.id=m.project_id join auth.users u on u.id=m.user_id where p.owner_id=owner and p.deleted_at is null and m.expires_at>now() group by lower(u.email)
    union all select lower(i.email),max(case i.role when 'editor' then 3 when 'reviewer' then 2 else 1 end) from norte_private.invitations i join public.norte_projects p on p.id=i.project_id where p.owner_id=owner and p.deleted_at is null and i.status='pending' and i.expires_at>now() group by lower(i.email)
  ), unique_people as (select email,max(level) as level from people group by email)
  select count(*) filter(where level=3),count(*) filter(where level=2),count(*) filter(where level=1) into ed,re,vi from unique_people;
  if ed>(a.seats->>'editors')::integer or re>(a.seats->>'reviewers')::integer or vi>(a.seats->>'viewers')::integer then raise exception 'seat_limit'; end if;
  return new;
end $$;
create trigger norte_member_seats after insert or update on norte_private.members for each row execute function norte_private.enforce_plan_seats();
create trigger norte_invitation_seats after insert or update on norte_private.invitations for each row execute function norte_private.enforce_plan_seats();
revoke all on all functions in schema norte_private from public,anon,authenticated;
do $$ declare f record; begin
  for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname in ('norte_plan_quote','norte_plan_request','norte_plan_requests','norte_plan_cancel','norte_admin_plan_catalog','norte_admin_plan_request') loop
    execute format('revoke all on function %s from public,anon',f.signature);
    execute format('grant execute on function %s to authenticated',f.signature);
  end loop;
end $$;
