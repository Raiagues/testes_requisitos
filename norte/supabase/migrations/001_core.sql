-- Executar em transação. Não altera auth nem dados de outras aplicações.
create schema if not exists norte_private;
revoke all on schema norte_private from public, anon, authenticated;

create table public.norte_config (
  version integer primary key,
  created_at timestamptz not null default now(),
  active boolean not null default false,
  offer jsonb not null,
  limits jsonb not null,
  operationally_approved boolean not null default false
);
create unique index norte_one_active_config on public.norte_config(active) where active;
insert into public.norte_config(version, active, offer, limits) values (1, true,
  '{"monthly":24900,"firstDiscount":40,"feedbackDiscount":60,"validDays":7,"services":{"analysis":48000,"impact":69000,"documents":89000},"volumes":{"small":100,"medium":250,"large":500},"hours":{"small":2,"medium":5,"large":10},"reviewers":{"self":0,"junior":14000,"mid":24000,"senior":38000},"addons":{"trace":18000,"handover":24000,"editable":22000},"dedicatedSetup":90000,"dedicatedMonthly":25000}',
  '{"essential":{"projects":1,"requirements":50,"verifications":20,"generations":0},"trial":{"projects":3,"requirements":200,"verifications":50,"generations":10},"professional":{"projects":10,"requirements":1000,"verifications":300,"generations":100},"trialDays":14}') on conflict do nothing;
create table public.norte_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan text not null default 'essential' check (plan in ('essential','professional')),
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  editable_project uuid,
  suspended boolean not null default false,
  created_at timestamptz not null default now()
);
create table norte_private.admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('commercial','technical'))
);
create table public.norte_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  name text not null check (length(name) between 1 and 160),
  project_type text not null check (project_type in ('satellite','payload','ground','software','other')),
  profile text not null check (profile in ('NASA','ECSS','CUSTOM')),
  start_date date not null,
  phase text not null default 'Concepção',
  classification text not null default 'private' check (classification in ('private','public','restricted')),
  ai_authorized boolean not null default false,
  archived boolean not null default false,
  version integer not null default 1,
  payload jsonb not null default '{"requirements":[],"verifications":[],"engineering":{},"settings":{},"lifecycle":{}}',
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index norte_owner_projects on public.norte_projects(owner_id);
create table public.norte_access (
  project_id uuid not null references public.norte_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check(scope in ('read','review')),
  expires_at timestamptz not null,
  granted_by uuid not null references auth.users(id),
  primary key(project_id,user_id)
);
create table public.norte_requirements (
  project_id uuid not null references public.norte_projects(id) on delete cascade,
  id text not null check (id ~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,59}$'),
  version integer not null check (version > 0),
  data jsonb not null,
  primary key(project_id,id)
);
create table public.norte_verifications (
  project_id uuid not null references public.norte_projects(id) on delete cascade,
  id text not null,
  data jsonb not null,
  primary key(project_id,id)
);
create table public.norte_links (
  project_id uuid not null,
  requirement_id text not null,
  verification_id text not null,
  requirement_version integer not null,
  primary key(project_id,requirement_id,verification_id),
  foreign key(project_id,requirement_id) references public.norte_requirements(project_id,id) on delete cascade,
  foreign key(project_id,verification_id) references public.norte_verifications(project_id,id) on delete cascade
);
create table public.norte_versions (
  project_id uuid not null references public.norte_projects(id) on delete cascade,
  version integer not null,
  payload jsonb not null,
  author_id uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  primary key(project_id,version)
);
create table public.norte_audit (
  id bigint generated always as identity primary key,
  actor_id uuid,
  project_id uuid,
  event text not null,
  result text not null default 'ok',
  request_id uuid,
  created_at timestamptz not null default now()
);
create table public.norte_sources (
  id text primary key,
  title text not null,
  issuer text not null,
  code text not null,
  edition text not null,
  issued_on date,
  language text not null default 'en',
  official_url text not null,
  obtained_at timestamptz,
  sha256 text check (sha256 ~ '^[a-f0-9]{64}$'),
  storage_path text,
  license_status text not null check (license_status in ('public_authorized','licensed','metadata','pending')),
  license_note text not null,
  checked boolean not null default false,
  ai_allowed boolean not null default false,
  suspended boolean not null default false
);
create table public.norte_source_access (
  source_id text references public.norte_sources(id),
  user_id uuid references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  primary key(source_id,user_id)
);
create table public.norte_citations (
  id text primary key,
  source_id text not null references public.norte_sources(id),
  page_index integer not null check(page_index between 0 and 1999),
  printed_page text not null,
  clause text not null,
  exact_text text not null check(length(exact_text) <= 4000),
  context_before text not null default '',
  context_after text not null default '',
  rects jsonb not null default '[]',
  verified boolean not null default false
);
create table public.norte_source_adoptions (
  project_id uuid not null references public.norte_projects(id) on delete cascade,
  source_id text not null references public.norte_sources(id),
  decision text not null,
  rationale text not null,
  responsible text not null,
  primary key(project_id,source_id)
);

create function norte_private.uid() returns uuid language sql stable security definer set search_path = '' as $$
  select auth.uid() where exists(select 1 from auth.users u where u.id = auth.uid() and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until < now())) and not exists(select 1 from public.norte_accounts a where a.user_id = auth.uid() and a.suspended)
$$;
create function public.norte_can_read(p_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.norte_projects p where p.id = p_id and p.deleted_at is null and (p.owner_id = norte_private.uid() or exists(select 1 from public.norte_access a where a.project_id = p.id and a.user_id = norte_private.uid() and a.expires_at > now())))
$$;
create function public.norte_is_admin(p_role text default null) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((auth.jwt()->>'aal') = 'aal2',false) and exists(select 1 from norte_private.admins a where a.user_id = norte_private.uid() and (p_role is null or a.role = p_role))
$$;
create function public.norte_source_allowed(p_id text) returns boolean language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.norte_sources s where s.id = p_id and s.checked and not s.suspended and (s.license_status = 'public_authorized' or (s.license_status = 'licensed' and exists(select 1 from public.norte_source_access a where a.source_id = s.id and a.user_id = norte_private.uid() and a.expires_at > now()))))
$$;
create function norte_private.account() returns public.norte_accounts language plpgsql security definer set search_path = '' as $$
declare a public.norte_accounts;
begin
  if norte_private.uid() is null then raise exception 'not_authenticated'; end if;
  insert into public.norte_accounts(user_id) values (norte_private.uid()) on conflict do nothing;
  select * into a from public.norte_accounts where user_id = norte_private.uid() for update;
  return a;
end $$;
create function public.norte_entitlements() returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.norte_accounts; c public.norte_config; tier text;
begin
  a := norte_private.account();
  select * into c from public.norte_config where active;
  tier := case when a.plan = 'professional' then 'professional' when a.trial_ends_at > now() then 'trial' else 'essential' end;
  return jsonb_build_object('tier',tier,'limits',c.limits->tier,'trialStartedAt',a.trial_started_at,'trialEndsAt',a.trial_ends_at,'editableProject',a.editable_project,'serverTime',now());
end $$;
create function public.norte_activate_trial() returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.norte_accounts; days integer;
begin
  a := norte_private.account();
  if a.trial_started_at is not null then raise exception 'trial_already_used'; end if;
  select (limits->>'trialDays')::integer into days from public.norte_config where active;
  update public.norte_accounts set trial_started_at = now(), trial_ends_at = now() + make_interval(days => days) where user_id = a.user_id;
  insert into public.norte_audit(actor_id,event) values (a.user_id,'trial_activated');
  return public.norte_entitlements();
end $$;
create function norte_private.assert_owner(p_id uuid) returns public.norte_projects language plpgsql security definer set search_path = '' as $$
declare p public.norte_projects;
begin
  select * into p from public.norte_projects where id = p_id and owner_id = norte_private.uid() and deleted_at is null for update;
  if p.id is null then raise exception 'not_found'; end if;
  return p;
end $$;
create function norte_private.assert_editable(p public.norte_projects, e jsonb) returns void language plpgsql set search_path = '' as $$
begin
  if p.archived then raise exception 'archived'; end if;
  if e->>'tier' = 'essential' and coalesce(e->>'editableProject','') <> p.id::text then raise exception 'choose_editable_project'; end if;
end $$;
create function public.norte_choose_project(p_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare a public.norte_accounts; p public.norte_projects;
begin
  a := norte_private.account(); p := norte_private.assert_owner(p_id);
  if p.archived then raise exception 'archived'; end if;
  update public.norte_accounts set editable_project = p_id where user_id = a.user_id;
  return public.norte_entitlements();
end $$;

create function norte_private.assert_keys(v jsonb, allowed text[]) returns void language plpgsql set search_path = '' as $$
begin
  if jsonb_typeof(v) <> 'object' or exists(select 1 from jsonb_object_keys(v) k where not k = any(allowed)) then raise exception 'invalid_fields'; end if;
end $$;
create function norte_private.validate_payload(v jsonb) returns void language plpgsql set search_path = '' as $$
declare r jsonb; x jsonb; list jsonb;
begin
  perform norte_private.assert_keys(v,array['requirements','verifications','engineering','settings','lifecycle']);
  if octet_length(v::text) > 4000000 or jsonb_typeof(v->'requirements') is distinct from 'array' or jsonb_typeof(v->'verifications') is distinct from 'array' then raise exception 'invalid_payload'; end if;
  if jsonb_array_length(v->'requirements') > 5000 or jsonb_array_length(v->'verifications') > 2000 then raise exception 'payload_too_large'; end if;
  for r in select value from jsonb_array_elements(v->'requirements') loop
    perform norte_private.assert_keys(r,array['id','text','subsystem','type','method','extraMethods','origin','reference','sourceVersion','parent','owner','level','rationale','acceptance','condition','limit','architecture','test','evidence','criticality','version','status','findings','analysedAt','review','reviewer','reviewAt','reviewNote','history','isExample']);
    if coalesce(r->>'id','') !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,59}$' or jsonb_typeof(r->'text') is distinct from 'string' or length(r->>'text') > 20000 then raise exception 'invalid_requirement'; end if;
  end loop;
  if (select count(*) <> count(distinct value->>'id') from jsonb_array_elements(v->'requirements')) then raise exception 'duplicate_requirement'; end if;
  for r in select value from jsonb_array_elements(v->'verifications') loop
    perform norte_private.assert_keys(r,array['id','title','method','subsystem','requirementIds','owner','review','level','stage','status','result','criteria','procedure','conditions','evidence','note','requirementVersions','stale','updatedAt','evidenceHistory']);
    if coalesce(r->>'id','') !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,59}$' or jsonb_typeof(r->'requirementIds') is distinct from 'array' then raise exception 'invalid_verification'; end if;
    if r->>'status' = 'Concluída' and (coalesce(r->>'criteria','') = '' or coalesce(r->>'evidence','') = '' or coalesce(r->>'result','') in ('','Não executada')) then raise exception 'evidence_required'; end if;
    for x in select value from jsonb_array_elements(r->'requirementIds') loop
      if not exists(select 1 from jsonb_array_elements(v->'requirements') q where q->>'id' = x#>>'{}') then raise exception 'cross_project_link'; end if;
    end loop;
  end loop;
  perform norte_private.assert_keys(v->'engineering',array['module','profile','start','prepDays','closeDays','schedules','docReview','docKind','docQuery','expandedReview','reviewPicker','sourceBack','docId','version','changes','customDocs','applicability']);
  perform norte_private.assert_keys(v->'settings',array['standard','quality','trace','verification','anatel','itar']);
  perform norte_private.assert_keys(v->'lifecycle',array['durations']);
end $$;

create function public.norte_create_project(p_name text, p_type text, p_profile text, p_start date, p_payload jsonb default '{"requirements":[],"verifications":[],"engineering":{},"settings":{},"lifecycle":{}}') returns public.norte_projects language plpgsql security definer set search_path = '' as $$
declare e jsonb; p public.norte_projects;
begin
  e := public.norte_entitlements();
  if (select count(*) from public.norte_projects where owner_id = norte_private.uid() and not archived and deleted_at is null) >= (e->'limits'->>'projects')::integer then raise exception 'project_limit'; end if;
  perform norte_private.validate_payload(p_payload);
  if jsonb_array_length(p_payload->'requirements') > (e->'limits'->>'requirements')::integer or jsonb_array_length(p_payload->'verifications') > (e->'limits'->>'verifications')::integer then raise exception 'content_limit'; end if;
  insert into public.norte_projects(owner_id,name,project_type,profile,start_date) values(norte_private.uid(),p_name,p_type,p_profile,p_start) returning * into p;
  update public.norte_accounts set editable_project = case when e->>'tier' = 'essential' then p.id else coalesce(editable_project,p.id) end where user_id = p.owner_id;
  -- save_project preenche as tabelas relacionadas dentro da mesma transação.
  if jsonb_array_length(p_payload->'requirements') > 0 or p_payload <> p.payload then p := public.norte_save_project(p.id,1,p_payload); end if;
  insert into public.norte_audit(actor_id,project_id,event) values (p.owner_id,p.id,'project_created');
  return p;
end $$;

create function public.norte_save_project(p_id uuid, p_version integer, p_payload jsonb) returns public.norte_projects language plpgsql security definer set search_path = '' as $$
declare e jsonb; p public.norte_projects; r jsonb; oldr jsonb; newreq jsonb := '[]'; newver jsonb := '[]'; versions jsonb; stale boolean; oldv jsonb; newversion integer;
begin
  e := public.norte_entitlements(); p := norte_private.assert_owner(p_id);
  perform norte_private.assert_editable(p,e);
  if p.version <> p_version then raise exception 'version_conflict'; end if;
  perform norte_private.validate_payload(p_payload);
  if jsonb_array_length(p_payload->'requirements') > greatest(jsonb_array_length(p.payload->'requirements'),(e->'limits'->>'requirements')::integer) or jsonb_array_length(p_payload->'verifications') > greatest(jsonb_array_length(p.payload->'verifications'),(e->'limits'->>'verifications')::integer) then raise exception 'content_limit'; end if;
  -- Acima da cota permite correções e remoção, nunca substituir um item por outro novo.
  if jsonb_array_length(p.payload->'requirements') >= (e->'limits'->>'requirements')::integer and exists(select 1 from jsonb_array_elements(p_payload->'requirements') n where not exists(select 1 from jsonb_array_elements(p.payload->'requirements') o where o->>'id' = n->>'id')) then raise exception 'content_limit'; end if;
  if jsonb_array_length(p.payload->'verifications') >= (e->'limits'->>'verifications')::integer and exists(select 1 from jsonb_array_elements(p_payload->'verifications') n where not exists(select 1 from jsonb_array_elements(p.payload->'verifications') o where o->>'id' = n->>'id')) then raise exception 'content_limit'; end if;
  for r in select value from jsonb_array_elements(p_payload->'requirements') loop
    select value into oldr from jsonb_array_elements(p.payload->'requirements') where value->>'id' = r->>'id';
    newversion := case when oldr is null then 1 when (oldr - array['version','findings','status','analysedAt','history','review','reviewer','reviewAt','reviewNote']) is distinct from (r - array['version','findings','status','analysedAt','history','review','reviewer','reviewAt','reviewNote']) then (oldr->>'version')::integer + 1 else (oldr->>'version')::integer end;
    r := r || jsonb_build_object('version',newversion);
    newreq := newreq || jsonb_build_array(r);
  end loop;
  for r in select value from jsonb_array_elements(p_payload->'verifications') loop
    select value into oldv from jsonb_array_elements(p.payload->'verifications') where value->>'id' = r->>'id';
    select coalesce(jsonb_object_agg(q->>'id',q->'version'),'{}') into versions from jsonb_array_elements(newreq) q where r->'requirementIds' ? (q->>'id');
    stale := oldv is not null and coalesce(oldv->'requirementVersions','{}') <> versions and coalesce(oldv->>'evidence','') <> '';
    r := r || jsonb_build_object('stale',stale or coalesce((oldv->>'stale')::boolean,false),'requirementVersions',case when stale then oldv->'requirementVersions' else versions end);
    if oldv is not null and oldv->>'evidence' is distinct from r->>'evidence' then r := r || jsonb_build_object('evidenceHistory',coalesce(oldv->'evidenceHistory','[]') || jsonb_build_array(jsonb_build_object('evidence',oldv->'evidence','result',oldv->'result','requirementVersions',oldv->'requirementVersions','replacedAt',now()))); end if;
    newver := newver || jsonb_build_array(r);
  end loop;
  p_payload := p_payload || jsonb_build_object('requirements',newreq,'verifications',newver);
  insert into public.norte_versions(project_id,version,payload,author_id) values(p.id,p.version,p.payload,norte_private.uid());
  delete from public.norte_links where project_id = p.id;
  delete from public.norte_requirements where project_id = p.id;
  delete from public.norte_verifications where project_id = p.id;
  insert into public.norte_requirements select p.id,item->>'id',(item->>'version')::integer,item from jsonb_array_elements(newreq) item;
  insert into public.norte_verifications select p.id,item->>'id',item from jsonb_array_elements(newver) item;
  insert into public.norte_links select p.id,link.id,v.id,coalesce((v.data->'requirementVersions'->>link.id)::integer,reqrow.version) from public.norte_verifications v cross join lateral jsonb_array_elements_text(v.data->'requirementIds') link(id) join public.norte_requirements reqrow on reqrow.project_id = v.project_id and reqrow.id = link.id where v.project_id = p.id;
  update public.norte_projects set payload = p_payload, version = version + 1, updated_at = now() where id = p.id returning * into p;
  insert into public.norte_audit(actor_id,project_id,event) values(norte_private.uid(),p.id,'project_saved');
  return p;
end $$;
create function public.norte_manage_project(p_id uuid, p_version integer, p_action text, p_name text default null) returns public.norte_projects language plpgsql security definer set search_path = '' as $$
declare e jsonb; p public.norte_projects;
begin
  e := public.norte_entitlements(); p := norte_private.assert_owner(p_id);
  if p.version <> p_version then raise exception 'version_conflict'; end if;
  if p_action = 'rename' then update public.norte_projects set name = p_name where id = p.id;
  elsif p_action = 'archive' then update public.norte_projects set archived = true where id = p.id;
  elsif p_action = 'delete' and p_name = p.name then update public.norte_projects set deleted_at = now(), payload = '{"requirements":[],"verifications":[],"engineering":{},"settings":{},"lifecycle":{}}' where id = p.id; delete from public.norte_versions where project_id = p.id; delete from public.norte_requirements where project_id = p.id; delete from public.norte_verifications where project_id = p.id; delete from public.norte_access where project_id = p.id;
  elsif p_action = 'duplicate' then return public.norte_create_project(coalesce(p_name,p.name || ' · cópia'),p.project_type,p.profile,p.start_date,p.payload);
  else raise exception 'invalid_action'; end if;
  update public.norte_projects set version = version + 1, updated_at = now() where id = p.id returning * into p;
  insert into public.norte_audit(actor_id,project_id,event) values(norte_private.uid(),p.id,'project_' || p_action);
  return p;
end $$;

-- Negação padrão. As escritas são somente pelas funções limitadas acima.
do $$ declare t text; begin
  foreach t in array array['norte_config','norte_accounts','norte_projects','norte_access','norte_requirements','norte_verifications','norte_links','norte_versions','norte_audit','norte_sources','norte_source_access','norte_citations','norte_source_adoptions'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
  end loop;
  foreach t in array array['norte_access','norte_requirements','norte_verifications','norte_links','norte_versions','norte_source_adoptions'] loop
    execute format('create policy authorized_read on public.%I for select to authenticated using (public.norte_can_read(project_id))',t);
  end loop;
end $$;
create policy own_projects on public.norte_projects for select to authenticated using(public.norte_can_read(id));
create policy own_account on public.norte_accounts for select to authenticated using(user_id = norte_private.uid());
create policy config_read on public.norte_config for select using(active);
create policy sources_metadata on public.norte_sources for select using(license_status in ('public_authorized','metadata','pending') or public.norte_source_allowed(id));
create policy source_access_read on public.norte_source_access for select to authenticated using(user_id = norte_private.uid());
create policy citations_read on public.norte_citations for select using(verified and public.norte_source_allowed(source_id));
grant select on public.norte_config, public.norte_sources, public.norte_citations to anon;
revoke all on all functions in schema norte_private from public, anon, authenticated;
do $$ declare f record; begin
  for f in select oid::regprocedure as signature from pg_proc where pronamespace = 'public'::regnamespace and proname like 'norte_%' loop
    execute format('revoke all on function %s from public, anon, authenticated',f.signature);
    execute format('grant execute on function %s to authenticated',f.signature);
  end loop;
end $$;
grant execute on function public.norte_source_allowed(text) to anon;
