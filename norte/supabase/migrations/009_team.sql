-- Concessões explícitas. Nenhuma destas tabelas é exposta pela API de dados.
alter table public.norte_projects add column team_version integer not null default 1;
alter table public.norte_projects add column review_required boolean not null default false;
create table norte_private.members (
  project_id uuid not null references public.norte_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check(role in ('viewer','editor','reviewer')),
  scope text not null check(scope in ('project','documents')),
  documents jsonb not null default '{}', expires_at timestamptz not null,
  granted_by uuid not null references auth.users(id), primary key(project_id,user_id)
);
create table norte_private.invitations (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.norte_projects(id) on delete cascade,
  email text not null, role text not null check(role in ('viewer','editor','reviewer')),
  scope text not null check(scope in ('project','documents')), documents jsonb not null default '{}',
  expires_at timestamptz not null, access_until timestamptz not null,
  status text not null default 'pending' check(status in ('pending','accepted','revoked','declined')),
  created_by uuid not null references auth.users(id), created_at timestamptz not null default now()
);
create unique index norte_invitation_pending on norte_private.invitations(project_id,email) where status='pending';
create table norte_private.presence (
  project_id uuid not null references public.norte_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  tab_id uuid not null, module text not null, editing text not null default '',
  seen_at timestamptz not null default now(), primary key(project_id,user_id,tab_id)
);
alter table norte_private.members enable row level security;
alter table norte_private.invitations enable row level security;
alter table norte_private.presence enable row level security;
revoke all on norte_private.members,norte_private.invitations,norte_private.presence from public,anon,authenticated;

create function norte_private.team_role(p_id uuid) returns text language sql stable security definer set search_path='' as $$
  select case when p.owner_id=norte_private.uid() then 'owner'
    when m.user_id is not null then m.role
    when a.user_id is not null then case when a.scope='review' then 'reviewer' else 'viewer' end end
  from public.norte_projects p
  left join norte_private.members m on m.project_id=p.id and m.user_id=norte_private.uid() and m.expires_at>now()
  left join public.norte_access a on a.project_id=p.id and a.user_id=norte_private.uid() and a.expires_at>now()
    and not exists(select 1 from norte_private.members mm where mm.project_id=p.id and mm.user_id=norte_private.uid())
  where p.id=p_id and p.deleted_at is null
$$;
create or replace function public.norte_can_read(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(norte_private.team_role(p_id) is not null and not exists(select 1 from norte_private.members m where m.project_id=p_id and m.user_id=norte_private.uid() and m.scope='documents'),false)
$$;
create function public.norte_document_allowed(p_id uuid,p_document text,p_edit boolean default false) returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(case when norte_private.team_role(p_id)='owner' then true
    when norte_private.team_role(p_id) is null then false
    when p_edit and norte_private.team_role(p_id)<>'editor' then false
    when public.norte_can_read(p_id) then true
    else exists(select 1 from norte_private.members m where m.project_id=p_id and m.user_id=norte_private.uid() and m.expires_at>now() and m.documents->>p_document in ('view','edit') and (not p_edit or m.documents->>p_document='edit')) end,false)
$$;
create function norte_private.team_advanced(p public.norte_projects) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.norte_accounts a join auth.users u on u.id=a.user_id where a.user_id=p.owner_id and not a.suspended and (u.banned_until is null or u.banned_until<now()) and (a.plan='professional' or a.trial_ends_at>now()))
$$;
create function norte_private.document_exists(p public.norte_projects,d text) returns boolean language sql immutable set search_path='' as $$
  select d in ('REG','ANA','CRN') or (p.profile in ('NASA','ECSS') and d in ('CON','SEMP','REQ','ARQ','VVP','VCD','RTM','RES'))
    or (p.profile='NASA' and d in ('NEC','MOE','HSI','TPM','PRE','DET','INT','DES','DSP'))
    or exists(select 1 from jsonb_array_elements(coalesce(p.payload->'engineering'->'customDocs','[]')) c where c->>'id'=d)
    or (d ~ '^(PROC|ATA)-' and exists(select 1 from jsonb_array_elements(coalesce(p.payload->'engineering'->'schedules'->p.profile,'[]')) r where r->>'id'=regexp_replace(d,'^(PROC|ATA)-','')))
$$;
create function norte_private.validate_grant(p public.norte_projects,p_role text,p_scope text,p_documents jsonb,p_expires timestamptz) returns void language plpgsql set search_path='' as $$
declare d record;
begin
  if p_role is null or p_role not in ('viewer','editor','reviewer') or p_scope is null or p_scope not in ('project','documents') or jsonb_typeof(p_documents) is distinct from 'object' or octet_length(p_documents::text)>12000 or p_expires is null or p_expires<=now() or p_expires>now()+interval '90 days' then raise exception 'invalid_grant'; end if;
  if p_scope='project' and p_documents<>'{}' then raise exception 'invalid_grant'; end if;
  if p_scope='documents' and p_documents='{}' then raise exception 'invalid_grant'; end if;
  for d in select * from jsonb_each_text(p_documents) loop
    if not norte_private.document_exists(p,d.key) or d.value not in ('view','edit') then raise exception 'invalid_grant'; end if;
    -- Modelos derivados são alterados nos registros de origem do projeto.
    if d.value='edit' and (p_role<>'editor' or not exists(select 1 from jsonb_array_elements(coalesce(p.payload->'engineering'->'customDocs','[]')) c where c->>'id'=d.key)) then raise exception 'invalid_grant'; end if;
  end loop;
end $$;
create function public.norte_project_context(p_id uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare p public.norte_projects; role text; permissions jsonb; result jsonb;
begin
  role:=norte_private.team_role(p_id); if role is null then raise exception 'not_found'; end if;
  select * into p from public.norte_projects where id=p_id;
  select documents into permissions from norte_private.members where project_id=p_id and user_id=norte_private.uid();
  result:=to_jsonb(p);
  if not public.norte_can_read(p_id) then
    result:=result || jsonb_build_object('payload',jsonb_build_object('requirements','[]'::jsonb,'verifications','[]'::jsonb,'settings','{}'::jsonb,'lifecycle','{}'::jsonb,'engineering',jsonb_build_object('profile',p.profile,'start',p.start_date,'customDocs',coalesce((select jsonb_agg(c) from jsonb_array_elements(coalesce(p.payload->'engineering'->'customDocs','[]')) c where permissions ? (c->>'id')),'[]'::jsonb),'schedules','{}'::jsonb)));
  end if;
  return result || jsonb_build_object('access',jsonb_build_object('role',role,'scope',case when public.norte_can_read(p_id) then 'project' else 'documents' end,'documents',coalesce(permissions,'{}'),'advanced',norte_private.team_advanced(p)));
end $$;
create function public.norte_project_list() returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'profile',p.profile,'phase',p.phase,'project_type',p.project_type,'start_date',p.start_date,'archived',p.archived,'version',p.version,'updated_at',p.updated_at,'owner_id',p.owner_id,'role',norte_private.team_role(p.id)) order by p.updated_at desc),'[]') from public.norte_projects p where norte_private.team_role(p.id) is not null
$$;
create function public.norte_invitations() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if norte_private.uid() is null then raise exception 'not_authenticated'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'projectId',p.id,'projectName',p.name,'role',i.role,'scope',i.scope,'expiresAt',i.expires_at)) from norte_private.invitations i join public.norte_projects p on p.id=i.project_id where i.email=(select lower(email) from auth.users where id=norte_private.uid()) and i.status='pending' and i.expires_at>now() and p.deleted_at is null),'[]');
end $$;
create function public.norte_invitation_reply(p_id uuid,p_accept boolean) returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.norte_projects; i norte_private.invitations; pid uuid;
begin
  if norte_private.uid() is null or p_accept is null then raise exception 'not_authenticated'; end if;
  if not public.norte_rate('invitation-reply:'||norte_private.uid(),30,3600) then raise exception 'rate_limit'; end if;
  select project_id into pid from norte_private.invitations where id=p_id and email=(select lower(email) from auth.users where id=norte_private.uid());
  select * into p from public.norte_projects where id=pid and deleted_at is null for update;
  select * into i from norte_private.invitations where id=p_id for update;
  if p.id is null or i.status<>'pending' or i.expires_at<=now() or i.access_until<=now() then raise exception 'invitation_unavailable'; end if;
  if p_accept then
    if not norte_private.team_advanced(p) then raise exception 'single_user_plan'; end if;
    perform norte_private.validate_grant(p,i.role,i.scope,i.documents,i.access_until);
    if (select count(*) from norte_private.members where project_id=p.id and expires_at>now())>=19 and not exists(select 1 from norte_private.members where project_id=p.id and user_id=norte_private.uid()) then raise exception 'team_limit'; end if;
    insert into public.norte_accounts(user_id) values(norte_private.uid()) on conflict do nothing;
    insert into norte_private.members(project_id,user_id,role,scope,documents,expires_at,granted_by) values(p.id,norte_private.uid(),i.role,i.scope,i.documents,i.access_until,p.owner_id) on conflict(project_id,user_id) do update set role=excluded.role,scope=excluded.scope,documents=excluded.documents,expires_at=excluded.expires_at;
    delete from public.norte_access where project_id=p.id and user_id=norte_private.uid();
  end if;
  update norte_private.invitations set status=case when p_accept then 'accepted' else 'declined' end where id=i.id;
  update public.norte_projects set team_version=team_version+1 where id=p.id;
  insert into public.norte_audit(actor_id,project_id,event) values(norte_private.uid(),p.id,case when p_accept then 'invitation_accepted' else 'invitation_declined' end);
  return jsonb_build_object('projectId',p.id,'accepted',p_accept);
end $$;
create function public.norte_team(p_id uuid,p_action text default 'list',p_input jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare p public.norte_projects; uid uuid:=norte_private.uid(); invitation uuid; member uuid; v_email text;
begin
  if norte_private.team_role(p_id) is null then raise exception 'not_found'; end if;
  if p_action='list' then
    select * into p from public.norte_projects where id=p_id;
  else
    p:=norte_private.assert_owner(p_id);
    if (p_input->>'version')::integer is distinct from p.team_version then raise exception 'version_conflict'; end if;
    if p_action='invite' then
      perform norte_private.assert_keys(p_input,array['version','email','role','scope','documents','expires']);
      if not norte_private.team_advanced(p) then raise exception 'single_user_plan'; end if;
      if p.archived then raise exception 'archived'; end if;
      if not public.norte_rate('invite:'||uid,30,3600) then raise exception 'rate_limit'; end if;
      v_email:=lower(trim(p_input->>'email'));
      if v_email is null or length(v_email)>200 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or v_email=(select lower(u.email) from auth.users u where u.id=uid) then raise exception 'invalid_grant'; end if;
      perform norte_private.validate_grant(p,p_input->>'role',p_input->>'scope',p_input->'documents',(p_input->>'expires')::timestamptz);
      update norte_private.invitations set status='revoked' where project_id=p.id and status='pending' and expires_at<=now();
      if (select count(*) from norte_private.invitations where project_id=p.id and status='pending')>=30 then raise exception 'team_limit'; end if;
      insert into norte_private.invitations(project_id,email,role,scope,documents,expires_at,access_until,created_by) values(p.id,v_email,p_input->>'role',p_input->>'scope',p_input->'documents',least(now()+interval '7 days',(p_input->>'expires')::timestamptz),(p_input->>'expires')::timestamptz,uid)
        on conflict(project_id,email) where status='pending' do update set role=excluded.role,scope=excluded.scope,documents=excluded.documents,expires_at=excluded.expires_at,access_until=excluded.access_until returning id into invitation;
    elsif p_action='cancel' then
      perform norte_private.assert_keys(p_input,array['version','invitationId']);
      update norte_private.invitations set status='revoked' where id=(p_input->>'invitationId')::uuid and project_id=p.id and status='pending';
    elsif p_action in ('update','revoke') then
      perform norte_private.assert_keys(p_input,array['version','userId','role','scope','documents','expires']);
      member:=(p_input->>'userId')::uuid; if member is null or member=p.owner_id then raise exception 'invalid_grant'; end if;
      if p_action='revoke' then
        delete from norte_private.members where project_id=p.id and user_id=member;
        delete from public.norte_access where project_id=p.id and user_id=member;
        update norte_private.invitations set status='revoked' where project_id=p.id and status='pending' and email=(select lower(u.email) from auth.users u where u.id=member);
        delete from norte_private.presence where project_id=p.id and user_id=member;
      else
        if not norte_private.team_advanced(p) then raise exception 'single_user_plan'; end if;
        perform norte_private.validate_grant(p,p_input->>'role',p_input->>'scope',p_input->'documents',(p_input->>'expires')::timestamptz);
        update norte_private.members set role=p_input->>'role',scope=p_input->>'scope',documents=p_input->'documents',expires_at=(p_input->>'expires')::timestamptz where project_id=p.id and user_id=member;
        if not found then raise exception 'not_found'; end if;
        delete from public.norte_access where project_id=p.id and user_id=member;
      end if;
    elsif p_action='protection' then
      perform norte_private.assert_keys(p_input,array['version','required']);
      if jsonb_typeof(p_input->'required') is distinct from 'boolean' then raise exception 'invalid_grant'; end if;
      if (p_input->>'required')::boolean and not norte_private.team_advanced(p) then raise exception 'single_user_plan'; end if;
      update public.norte_projects set review_required=(p_input->>'required')::boolean where id=p.id;
    else raise exception 'invalid_action'; end if;
    update public.norte_projects set team_version=team_version+1 where id=p.id returning * into p;
    insert into public.norte_audit(actor_id,project_id,event,result) values(uid,p.id,'team_'||p_action,coalesce(member::text,invitation::text,'ok'));
  end if;
  return jsonb_build_object('version',p.team_version,'reviewRequired',p.review_required,'advanced',norte_private.team_advanced(p),'ownerId',p.owner_id,'invitationId',invitation,
    'members',coalesce((select jsonb_agg(jsonb_build_object('userId',m.user_id,'email',u.email,'role',m.role,'scope',m.scope,'documents',m.documents,'expires',m.expires_at)) from norte_private.members m join auth.users u on u.id=m.user_id where m.project_id=p.id and (uid=p.owner_id or m.user_id=uid)),'[]'),
    'invitations',case when uid=p.owner_id then coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'email',i.email,'role',i.role,'scope',i.scope,'expires',i.expires_at)) from norte_private.invitations i where i.project_id=p.id and status='pending' and expires_at>now()),'[]') else '[]'::jsonb end);
end $$;
create function public.norte_presence(p_id uuid,p_tab uuid,p_module text,p_editing text default '',p_leave boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
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
  select coalesce(jsonb_agg(jsonb_build_object('userId',s.user_id,'name',left(split_part(u.email,'@',1),60),'role',case when s.user_id=p.owner_id then 'owner' else coalesce(m.role,a.scope,'viewer') end,'module',case when public.norte_can_read(p_id) then s.module else 'documents' end,'editing',case when public.norte_can_read(p_id) or public.norte_document_allowed(p_id,s.editing) then s.editing else '' end,'seenAt',s.seen_at)),'[]') into visible
    from (select distinct on (user_id) * from norte_private.presence where project_id=p_id and seen_at>now()-interval '65 seconds' order by user_id,seen_at desc) s
    join auth.users u on u.id=s.user_id and u.email_confirmed_at is not null and (u.banned_until is null or u.banned_until<now())
    left join norte_private.members m on m.project_id=p_id and m.user_id=s.user_id and m.expires_at>now()
    left join public.norte_access a on a.project_id=p_id and a.user_id=s.user_id and a.expires_at>now()
    where (s.user_id=p.owner_id or m.user_id is not null or a.user_id is not null) and not exists(select 1 from public.norte_accounts ac where ac.user_id=s.user_id and ac.suspended);
  return jsonb_build_object('people',visible,'projectVersion',p.version,'teamVersion',p.team_version);
end $$;

-- Toda autorização do Storage é reavaliada, inclusive nos arquivos já gerados.
create function public.norte_job_allowed(p_job uuid) returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.norte_jobs j where j.id=p_job and (public.norte_can_read(j.project_id) or (norte_private.team_role(j.project_id) is not null and j.input->>'format' in ('pdf','docx') and jsonb_array_length(j.input->'documents')=1 and public.norte_document_allowed(j.project_id,j.input->'documents'->>0))))
$$;
drop policy jobs_read on public.norte_jobs;
create policy jobs_read on public.norte_jobs for select to authenticated using(public.norte_job_allowed(id));
create or replace function public.norte_file_allowed(p_bucket text,p_path text) returns boolean language sql stable security definer set search_path='' as $$
  select case when p_bucket='norte-projects' then exists(select 1 from public.norte_jobs j where j.storage_path=p_path and j.status='ready' and public.norte_job_allowed(j.id)) when p_bucket='norte-sources' then exists(select 1 from public.norte_sources s where s.storage_path=p_path and public.norte_source_allowed(s.id)) else false end
$$;
revoke all on all functions in schema norte_private from public,anon,authenticated;
do $$ declare f record; begin
  for f in select oid::regprocedure signature from pg_proc where pronamespace='public'::regnamespace and proname in ('norte_can_read','norte_document_allowed','norte_project_context','norte_project_list','norte_invitations','norte_invitation_reply','norte_team','norte_presence','norte_job_allowed','norte_file_allowed') loop
    execute format('revoke all on function %s from public,anon',f.signature); execute format('grant execute on function %s to authenticated',f.signature);
  end loop;
end $$;
