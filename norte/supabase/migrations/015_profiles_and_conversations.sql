-- Dados da conta separados de cargos e permissões. Nada é exposto por SELECT direto.
create table norte_private.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '' check(length(name)<=100),
  company text not null default '' check(length(company)<=120),
  job_title text not null default '' check(length(job_title)<=100),
  discipline text not null default '' check(length(discipline)<=100),
  bio text not null default '' check(length(bio)<=500),
  version integer not null default 1,
  avatar bytea check(octet_length(avatar)<=100000),
  avatar_version integer not null default 0,
  updated_at timestamptz not null default now()
);
create table norte_private.account_activity (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen timestamptz not null default now()
);
-- Somente o ambiente de teste explicitamente habilitado recebe esta concessão.
-- Uma migração comum NÃO concede acesso de acompanhamento a administradores.
create table norte_private.prototype_observers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  expires_at timestamptz not null
);
create function norte_private.prototype_enabled() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from norte_private.prototype_observers o join norte_private.admins a using(user_id) where o.user_id=norte_private.uid() and o.enabled and o.expires_at>now())
$$;
create function norte_private.require_observer() returns void language plpgsql security definer set search_path='' as $$
begin
  perform norte_private.require_admin(null);
  if not norte_private.prototype_enabled() then raise exception 'not_found'; end if;
end $$;
create function public.norte_account_profile(p_input jsonb default null,p_version integer default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=norte_private.uid(); p norte_private.profiles; r jsonb;
begin
  perform norte_private.account();
  insert into norte_private.profiles(user_id) values(uid) on conflict do nothing;
  select * into p from norte_private.profiles where user_id=uid for update;
  if p_input is not null then
    perform norte_private.assert_keys(p_input,array['name','company','jobTitle','discipline','bio']);
    if jsonb_typeof(p_input) is distinct from 'object' or p_version is distinct from p.version then raise exception 'version_conflict'; end if;
    if (select count(*) from jsonb_each(p_input))<>5 or exists(select 1 from jsonb_each(p_input) v where jsonb_typeof(v.value)<>'string') or length(trim(p_input->>'name')) not between 2 and 100 then raise exception 'invalid_fields'; end if;
    update norte_private.profiles set name=trim(p_input->>'name'),company=trim(p_input->>'company'),job_title=trim(p_input->>'jobTitle'),discipline=trim(p_input->>'discipline'),bio=trim(p_input->>'bio'),version=version+1,updated_at=now() where user_id=uid returning * into p;
    insert into public.norte_audit(actor_id,event) values(uid,'profile_updated');
  end if;
  r:=jsonb_build_object('id',uid,'name',p.name,'company',p.company,'jobTitle',p.job_title,'discipline',p.discipline,'bio',p.bio,'version',p.version,'avatarVersion',p.avatar_version,'hasAvatar',p.avatar is not null);
  return jsonb_build_object('profile',r,'adminRole',(select role from norte_private.admins where user_id=uid),'observer',norte_private.prototype_enabled(),'supportAvailable',exists(select 1 from norte_private.prototype_observers where enabled and expires_at>now()),'roles',coalesce((select jsonb_agg(jsonb_build_object('projectId',x.id,'projectName',x.name,'role',norte_private.team_role(x.id))) from public.norte_projects x where x.deleted_at is null and norte_private.team_role(x.id) is not null),'[]'));
end $$;
create function public.norte_account_presence() returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=norte_private.uid();
begin
  insert into norte_private.account_activity(user_id) values(uid) on conflict(user_id) do update set last_seen=now() where norte_private.account_activity.last_seen<now()-interval '15 seconds';
end $$;
create function public.norte_register_signup(p_user uuid) returns void language sql security definer set search_path='' as $$
  insert into public.norte_accounts(user_id) select id from auth.users where id=p_user on conflict do nothing
$$;
-- Apenas bytes reprocessados no servidor podem ser persistidos como foto.
create function public.norte_avatar_write(p_user uuid,p_bytes text,p_version integer) returns integer language plpgsql security definer set search_path='' as $$
declare b bytea; v integer;
begin
  b:=decode(p_bytes,'base64');
  if b is not null and (octet_length(b) not between 20 and 100000 or substring(b from 1 for 4)<>decode('52494646','hex') or substring(b from 9 for 4)<>decode('57454250','hex')) then raise exception 'invalid_fields'; end if;
  perform pg_advisory_xact_lock(150001);
  if b is not null and (select coalesce(sum(octet_length(avatar)),0) from norte_private.profiles where user_id<>p_user)+octet_length(b)>26214400 then raise exception 'storage_limit'; end if;
  insert into norte_private.profiles(user_id) values(p_user) on conflict do nothing;
  update norte_private.profiles set avatar=b,avatar_version=avatar_version+1,updated_at=now() where user_id=p_user and avatar_version=p_version returning avatar_version into v;
  if v is null then raise exception 'version_conflict'; end if;
  insert into public.norte_audit(actor_id,event) values(p_user,'avatar_updated');
  return v;
end $$;
create function public.norte_avatar_read(p_user uuid) returns text language plpgsql security definer set search_path='' as $$
declare uid uuid:=norte_private.uid();
begin
  if p_user<>uid and not exists(select 1 from public.norte_projects p where p.deleted_at is null and norte_private.team_role(p.id) is not null and (p.owner_id=p_user or exists(select 1 from norte_private.members m where m.project_id=p.id and m.user_id=p_user and m.expires_at>now()))) then
    perform norte_private.require_observer();
  end if;
  return (select encode(avatar,'base64') from norte_private.profiles where user_id=p_user);
end $$;
create function public.norte_prototype_overview(p_query text default '',p_offset integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare people jsonb; total integer;
begin
  perform norte_private.require_observer();
  if length(p_query)>100 or p_offset not between 0 and 100000 then raise exception 'invalid_fields'; end if;
  select count(*) into total from public.norte_accounts a join auth.users u on u.id=a.user_id left join norte_private.profiles f on f.user_id=u.id where concat(u.email,' ',f.name,' ',f.company) ilike '%'||p_query||'%';
  select coalesce(jsonb_agg(to_jsonb(x)),'[]') into people from (
    select u.id,u.email,coalesce(nullif(f.name,''),split_part(u.email,'@',1)) as name,coalesce(f.company,'') as company,coalesce(f.job_title,'') as "jobTitle",case when f.avatar is not null then f.avatar_version else 0 end as "avatarVersion",a.plan,a.suspended,a.created_at as "createdAt",(to_jsonb(u)->>'last_sign_in_at') as "lastLogin",u.email_confirmed_at is not null as confirmed,t.last_seen as "lastSeen",coalesce(t.last_seen>now()-interval '65 seconds',false) as online,(select count(*) from public.norte_projects p where p.owner_id=u.id and p.deleted_at is null) as "projectCount"
    from public.norte_accounts a join auth.users u on u.id=a.user_id left join norte_private.profiles f on f.user_id=u.id left join norte_private.account_activity t on t.user_id=u.id where concat(u.email,' ',f.name,' ',f.company) ilike '%'||p_query||'%' order by a.created_at desc,u.id limit 30 offset p_offset
  ) x;
  insert into public.norte_audit(actor_id,event) values(norte_private.uid(),'prototype_users_viewed');
  return jsonb_build_object('users',people,'total',total,'offset',p_offset,'online',(select count(*) from norte_private.account_activity where last_seen>now()-interval '65 seconds'),'projects',(select count(*) from public.norte_projects where deleted_at is null));
end $$;
create function public.norte_prototype_user(p_user uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform norte_private.require_observer();
  if not exists(select 1 from public.norte_accounts where user_id=p_user) then raise exception 'not_found'; end if;
  insert into public.norte_audit(actor_id,event,result) values(norte_private.uid(),'prototype_account_viewed',p_user::text);
  return jsonb_build_object('projects',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'profile',p.profile,'version',p.version,'updatedAt',p.updated_at,'archived',p.archived,'requirements',jsonb_array_length(p.payload->'requirements'),'verifications',jsonb_array_length(p.payload->'verifications'),'people',1+(select count(*) from norte_private.members m where m.project_id=p.id and m.expires_at>now()))) from public.norte_projects p where p.owner_id=p_user and p.deleted_at is null),'[]'),'events',coalesce((select jsonb_agg(to_jsonb(x)) from (select event,result,created_at from public.norte_audit where actor_id=p_user order by created_at desc limit 30) x),'[]'));
end $$;
create function public.norte_prototype_project(p_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.norte_projects;
begin
  perform norte_private.require_observer();
  select * into p from public.norte_projects where id=p_id and deleted_at is null;
  if p.id is null then raise exception 'not_found'; end if;
  insert into public.norte_audit(actor_id,project_id,event) values(norte_private.uid(),p.id,'prototype_project_inspected');
  return jsonb_build_object('id',p.id,'name',p.name,'profile',p.profile,'version',p.version,'updatedAt',p.updated_at,'payload',p.payload);
end $$;

create table norte_private.messages (
  id bigint generated always as identity primary key,
  project_id uuid references public.norte_projects(id) on delete cascade,
  document_id text not null default '',
  support_user uuid references auth.users(id) on delete cascade,
  author_id uuid not null references auth.users(id),
  client_id uuid not null,
  body text not null check(length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  check((project_id is null)<>(support_user is null)),
  check(support_user is null or document_id=''),
  unique(author_id,client_id)
);
create index norte_message_project on norte_private.messages(project_id,document_id,id);
create index norte_message_support on norte_private.messages(support_user,id);
create index norte_message_author on norte_private.messages(author_id,created_at);
create function norte_private.require_conversation(p_project uuid,p_document text,p_support uuid,p_write boolean default false) returns void language plpgsql security definer set search_path='' as $$
declare uid uuid:=norte_private.uid(); p public.norte_projects;
begin
  if (p_project is null)=(p_support is null) or p_document is null or length(p_document)>60 then raise exception 'not_found'; end if;
  if p_support is not null then
    if p_document<>'' or not exists(select 1 from public.norte_accounts where user_id=p_support and not suspended) or not exists(select 1 from norte_private.prototype_observers where enabled and expires_at>now()) then raise exception 'not_found'; end if;
    if p_support<>uid then perform norte_private.require_observer(); end if;
  else
    select * into p from public.norte_projects where id=p_project and deleted_at is null;
    if p.id is null or (p_document='' and not public.norte_can_read(p.id)) or (p_document<>'' and (not norte_private.document_exists(p,p_document) or not public.norte_document_allowed(p.id,p_document))) then raise exception 'not_found'; end if;
    if p_write and (p.archived or not norte_private.team_advanced(p)) then raise exception 'advanced_required'; end if;
  end if;
end $$;
create function public.norte_messages(p_project uuid default null,p_document text default '',p_support uuid default null,p_after bigint default 0) returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform norte_private.require_conversation(p_project,p_document,p_support);
  if p_after<0 then raise exception 'invalid_fields'; end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.id) from (
    select m.id,m.author_id as "authorId",coalesce(nullif(f.name,''),split_part(u.email,'@',1)) as name,m.body,m.created_at as "createdAt" from norte_private.messages m join auth.users u on u.id=m.author_id left join norte_private.profiles f on f.user_id=m.author_id
    where m.project_id is not distinct from p_project and m.document_id=p_document and m.support_user is not distinct from p_support and m.id>p_after order by case when p_after=0 then -m.id else m.id end limit 100
  ) x),'[]');
end $$;
create function public.norte_message_send(p_project uuid,p_document text,p_support uuid,p_key uuid,p_body text) returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid:=norte_private.uid(); old norte_private.messages; mid bigint;
begin
  perform norte_private.require_conversation(p_project,p_document,p_support,true);
  if p_key is null or p_body is null or length(trim(p_body)) not between 1 and 2000 then raise exception 'invalid_fields'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,15));
  select * into old from norte_private.messages where author_id=uid and client_id=p_key;
  if old.id is not null then
    if old.project_id is distinct from p_project or old.support_user is distinct from p_support or old.document_id<>p_document or old.body<>trim(p_body) then raise exception 'idempotency_conflict'; end if;
    return jsonb_build_object('id',old.id);
  end if;
  if (select count(*) from norte_private.messages where author_id=uid and created_at>now()-interval '1 minute')>=30 or (select count(*) from norte_private.messages where author_id=uid and created_at>now()-interval '1 day')>=1000 then raise exception 'rate_limit'; end if;
  if (select count(*) from norte_private.messages where project_id is not distinct from p_project and document_id=p_document and support_user is not distinct from p_support)>=5000 then raise exception 'content_limit'; end if;
  insert into norte_private.messages(project_id,document_id,support_user,author_id,client_id,body) values(p_project,p_document,p_support,uid,p_key,trim(p_body)) returning id into mid;
  insert into public.norte_audit(actor_id,project_id,event) values(uid,p_project,'message_sent');
  return jsonb_build_object('id',mid);
end $$;
create function public.norte_support_inbox() returns jsonb language plpgsql security definer set search_path='' as $$
begin
  perform norte_private.require_observer();
  return coalesce((select jsonb_agg(to_jsonb(x) order by x."updatedAt" desc) from (
    select distinct on(m.support_user) m.support_user as "userId",coalesce(nullif(f.name,''),split_part(u.email,'@',1)) as name,u.email,m.body as preview,m.created_at as "updatedAt" from norte_private.messages m join auth.users u on u.id=m.support_user left join norte_private.profiles f on f.user_id=u.id where m.support_user is not null order by m.support_user,m.id desc limit 100
  ) x),'[]');
end $$;
alter table norte_private.profiles enable row level security;
alter table norte_private.account_activity enable row level security;
alter table norte_private.prototype_observers enable row level security;
alter table norte_private.messages enable row level security;
revoke all on all tables in schema norte_private from public,anon,authenticated;
revoke all on all functions in schema norte_private from public,anon,authenticated;
do $$ declare f record; begin
  for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname in ('norte_account_profile','norte_account_presence','norte_avatar_read','norte_prototype_overview','norte_prototype_user','norte_prototype_project','norte_messages','norte_message_send','norte_support_inbox') loop
    execute format('revoke all on function %s from public,anon',f.signature);
    execute format('grant execute on function %s to authenticated',f.signature);
  end loop;
end $$;
revoke all on function public.norte_avatar_write(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.norte_avatar_write(uuid,text,integer) to service_role;
revoke all on function public.norte_register_signup(uuid) from public,anon,authenticated;
grant execute on function public.norte_register_signup(uuid) to service_role;

create or replace function public.norte_presence(p_id uuid,p_tab uuid,p_module text,p_editing text default '',p_leave boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.norte_projects; uid uuid:=norte_private.uid(); visible jsonb;
begin
  if norte_private.team_role(p_id) is null then raise exception 'not_found'; end if;
  if p_tab is null or p_module is null or p_module not in ('requirements','verification','documents','schedule','team','changes') or p_editing is null or length(p_editing)>60 or p_leave is null then raise exception 'invalid_fields'; end if;
  if not public.norte_can_read(p_id) and (p_module<>'documents' or (p_editing<>'' and not public.norte_document_allowed(p_id,p_editing))) then raise exception 'not_found'; end if;
  delete from norte_private.presence where seen_at<now()-interval '90 seconds';
  if p_leave then delete from norte_private.presence where project_id=p_id and user_id=uid and tab_id=p_tab;
  else
    if not public.norte_rate('presence:'||uid,120,60) then raise exception 'rate_limit'; end if;
    delete from norte_private.presence where user_id=uid and tab_id not in (select tab_id from norte_private.presence where user_id=uid order by seen_at desc limit 9);
    insert into norte_private.presence(project_id,user_id,tab_id,module,editing) values(p_id,uid,p_tab,p_module,p_editing) on conflict(project_id,user_id,tab_id) do update set seen_at=now(),module=excluded.module,editing=excluded.editing;
  end if;
  select * into p from public.norte_projects where id=p_id;
  select coalesce(jsonb_agg(jsonb_build_object('userId',s.user_id,'name',coalesce(nullif(f.name,''),left(split_part(u.email,'@',1),60)),'avatarVersion',case when f.avatar is not null then f.avatar_version else 0 end,'role',case when s.user_id=p.owner_id then 'owner' else coalesce(m.role,a.scope,'viewer') end,'module',case when public.norte_can_read(p_id) then s.module else 'documents' end,'editing',case when public.norte_can_read(p_id) or public.norte_document_allowed(p_id,s.editing) then s.editing else '' end,'seenAt',s.seen_at)),'[]') into visible
    from (select distinct on (user_id) * from norte_private.presence where project_id=p_id and seen_at>now()-interval '65 seconds' order by user_id,seen_at desc) s
    join auth.users u on u.id=s.user_id and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<now())
    left join norte_private.profiles f on f.user_id=s.user_id
    left join norte_private.members m on m.project_id=p_id and m.user_id=s.user_id and m.expires_at>now()
    left join public.norte_access a on a.project_id=p_id and a.user_id=s.user_id and a.expires_at>now()
    where (s.user_id=p.owner_id or m.user_id is not null or a.user_id is not null) and not exists(select 1 from public.norte_accounts ac where ac.user_id=s.user_id and ac.suspended);
  return jsonb_build_object('people',visible,'projectVersion',p.version,'teamVersion',p.team_version);
end $$;
