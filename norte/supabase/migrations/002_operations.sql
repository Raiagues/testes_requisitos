create table norte_private.sessions (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  encrypted_tokens text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create table norte_private.counters (key text primary key, count integer not null, expires_at timestamptz not null);
create table public.norte_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  project_id uuid not null references public.norte_projects(id),
  project_version integer not null,
  request_key uuid not null,
  input_hash text not null,
  input jsonb not null,
  snapshot jsonb not null,
  cost integer not null check(cost between 0 and 100),
  quota_period text not null,
  status text not null default 'queued' check(status in ('queued','running','ready','failed','cancelled')),
  refunded boolean not null default false,
  attempts integer not null default 0,
  lease_until timestamptz,
  lease_token uuid,
  storage_path text,
  filename text,
  mime text,
  sha256 text,
  error_code text,
  created_at timestamptz not null default now(),
  unique(user_id,request_key)
);
create index norte_jobs_poll on public.norte_jobs(status,created_at);
create table norte_private.usage (user_id uuid not null references auth.users(id), period text not null, used integer not null default 0 check(used >= 0), primary key(user_id,period));
create table public.norte_analyses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.norte_projects(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  project_version integer not null,
  model text not null,
  source_ids text[] not null,
  result jsonb not null,
  stale boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.norte_feedback (
  user_id uuid primary key references auth.users(id) on delete cascade,
  answers jsonb not null,
  created_at timestamptz not null default now()
);
create table public.norte_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  actor_hash text not null,
  request_key text not null,
  input_hash text not null,
  name text not null,
  email text not null,
  consent_at timestamptz not null default now(),
  configuration jsonb not null,
  quote jsonb not null,
  config_version integer not null references public.norte_config(version),
  status text not null default 'requested' check(status in ('requested','contacted','proposal_sent','confirmed','cancelled')),
  human_status text not null default 'availability_pending',
  infrastructure_status text not null default 'evaluation_pending',
  created_at timestamptz not null default now(),
  unique(actor_hash,request_key)
);
create table norte_private.outbox (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.norte_orders(id),
  status text not null default 'pending',
  attempts integer not null default 0,
  next_at timestamptz not null default now(),
  lease_until timestamptz
);
create table public.norte_events (id bigint generated always as identity primary key, user_id uuid, type text not null, created_at timestamptz not null default now());
create table public.norte_controls (id boolean primary key default true check(id), ai_enabled boolean not null default false, generation_enabled boolean not null default true, imports_enabled boolean not null default false);
insert into public.norte_controls(id) values(true) on conflict do nothing;

create function public.norte_session(p_action text, p_id text, p_user uuid default null, p_tokens text default null, p_expires timestamptz default null) returns jsonb language plpgsql security definer set search_path = '' as $$
declare s norte_private.sessions;
begin
  if p_action = 'put' then
    insert into norte_private.sessions(id,user_id,encrypted_tokens,expires_at) values(p_id,p_user,p_tokens,p_expires) on conflict(id) do update set encrypted_tokens = excluded.encrypted_tokens, expires_at = least(norte_private.sessions.created_at + interval '7 days',excluded.expires_at);
  elsif p_action = 'delete' then delete from norte_private.sessions where id = p_id;
  elsif p_action <> 'get' then raise exception 'invalid_action'; end if;
  select * into s from norte_private.sessions where id = p_id and expires_at > now();
  return to_jsonb(s);
end $$;
create function public.norte_rate(p_key text, p_limit integer, p_seconds integer) returns boolean language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  insert into norte_private.counters(key,count,expires_at) values(p_key,1,now() + make_interval(secs => p_seconds)) on conflict(key) do update set count = case when norte_private.counters.expires_at <= now() then 1 else norte_private.counters.count + 1 end, expires_at = case when norte_private.counters.expires_at <= now() then excluded.expires_at else norte_private.counters.expires_at end returning count into n;
  return n <= p_limit;
end $$;
create function public.norte_reserve_job(p_id uuid,p_version integer,p_key uuid,p_input jsonb,p_hash text) returns public.norte_jobs language plpgsql security definer set search_path = '' as $$
declare e jsonb; p public.norte_projects; j public.norte_jobs; units integer; v_period text; used integer; fmt text; doc text;
begin
  e := public.norte_entitlements(); p := norte_private.assert_owner(p_id);
  select * into j from public.norte_jobs where user_id = norte_private.uid() and request_key = p_key;
  if j.id is not null then
    if j.input_hash <> p_hash or j.project_id <> p_id or j.project_version <> p_version or j.input <> p_input then raise exception 'idempotency_conflict'; end if;
    return j;
  end if;
  select * into j from public.norte_jobs where user_id = norte_private.uid() and project_id = p_id and project_version = p_version and input = p_input and status in ('queued','running','ready') order by created_at limit 1;
  if j.id is not null then return j; end if;
  if not (select generation_enabled from public.norte_controls where id) then raise exception 'generation_suspended'; end if;
  if p.version <> p_version then raise exception 'version_conflict'; end if;
  perform norte_private.assert_keys(p_input,array['format','documents','review']);
  fmt := p_input->>'format';
  if fmt not in ('pdf','docx','zip','csv','ics','json') or jsonb_typeof(p_input->'documents') is distinct from 'array' or jsonb_array_length(p_input->'documents') not between 1 and 100 then raise exception 'invalid_generation'; end if;
  units := 0;
  for doc in select jsonb_array_elements_text(p_input->'documents') loop
    if doc !~ '^[A-Za-z0-9_-]{1,70}$' then raise exception 'invalid_document'; end if;
    if fmt in ('docx','zip') or (fmt = 'pdf' and doc not in ('REQ','RTM','CRN')) then units := units + 1; end if;
  end loop;
  if units > 0 then
    perform norte_private.assert_editable(p,e);
    if e->>'tier' = 'essential' then raise exception 'advanced_required'; end if;
  end if;
  v_period := case when e->>'tier' = 'trial' then 'trial' else to_char(now() at time zone 'UTC','YYYY-MM') end;
  insert into norte_private.usage(user_id,period) values(norte_private.uid(),v_period) on conflict do nothing;
  select u.used into used from norte_private.usage u where user_id = norte_private.uid() and u.period = v_period for update;
  if units > 0 and used + units > (e->'limits'->>'generations')::integer then raise exception 'generation_limit'; end if;
  if not public.norte_rate('generation:' || norte_private.uid(),20,3600) then raise exception 'rate_limit'; end if;
  update norte_private.usage u set used = u.used + units where user_id = norte_private.uid() and u.period = v_period;
  insert into public.norte_jobs(user_id,project_id,project_version,request_key,input_hash,input,snapshot,cost,quota_period) values(norte_private.uid(),p_id,p.version,p_key,p_hash,p_input,to_jsonb(p),units,v_period) returning * into j;
  insert into public.norte_audit(actor_id,project_id,event) values(norte_private.uid(),p_id,'generation_reserved');
  return j;
end $$;
create function public.norte_usage() returns jsonb language plpgsql security definer set search_path = '' as $$
declare e jsonb; v_period text; amount integer;
begin
  e := public.norte_entitlements(); v_period := case when e->>'tier' = 'trial' then 'trial' else to_char(now() at time zone 'UTC','YYYY-MM') end;
  select used into amount from norte_private.usage u where u.user_id = norte_private.uid() and u.period = v_period;
  return e || jsonb_build_object('generationsUsed',coalesce(amount,0));
end $$;
create function public.norte_claim_job() returns public.norte_jobs language plpgsql security definer set search_path = '' as $$
declare j public.norte_jobs;
begin
  perform pg_advisory_xact_lock(83045713);
  if exists(select 1 from public.norte_jobs where status = 'running' and lease_until > now()) then return null; end if;
  select * into j from public.norte_jobs where status = 'queued' or (status = 'running' and lease_until < now()) order by created_at for update skip locked limit 1;
  if j.id is null then return null; end if;
  if j.attempts >= 3 or not exists(select 1 from public.norte_projects p join public.norte_accounts a on a.user_id = p.owner_id join auth.users u on u.id = a.user_id where p.id = j.project_id and p.owner_id = j.user_id and p.deleted_at is null and not a.suspended and (u.banned_until is null or u.banned_until < now())) then
    perform public.norte_finish_job(j.id,j.lease_token,false,null,null,null,null,'authorization_or_retries'); return null;
  end if;
  update public.norte_jobs set status = 'running',attempts = attempts + 1,lease_until = now() + interval '2 minutes',lease_token = gen_random_uuid() where id = j.id returning * into j;
  return j;
end $$;
create function public.norte_finish_job(p_job uuid,p_lease uuid,p_ok boolean,p_path text,p_filename text,p_mime text,p_sha text,p_error text default null) returns boolean language plpgsql security definer set search_path = '' as $$
declare j public.norte_jobs;
begin
  select * into j from public.norte_jobs where id = p_job for update;
  if j.id is null or j.status in ('ready','failed','cancelled') or j.lease_token is distinct from p_lease then return false; end if;
  if p_ok and not exists(select 1 from public.norte_projects p join public.norte_accounts a on a.user_id = p.owner_id where p.id = j.project_id and p.owner_id = j.user_id and p.deleted_at is null and not a.suspended) then p_ok := false; p_error := 'access_revoked'; end if;
  if not p_ok and not j.refunded then update norte_private.usage set used = used - j.cost where user_id = j.user_id and period = j.quota_period; end if;
  update public.norte_jobs set status = case when p_ok then 'ready' else 'failed' end, refunded = not p_ok, storage_path = case when p_ok then p_path end, filename = p_filename, mime = p_mime, sha256 = p_sha, snapshot = '{}',error_code = p_error,lease_until = null where id = j.id;
  insert into public.norte_audit(actor_id,project_id,event,result) values(j.user_id,j.project_id,'generation_finished',case when p_ok then 'ok' else 'failed' end);
  return p_ok;
end $$;
create function public.norte_record_analysis(p_id uuid,p_version integer,p_model text,p_sources text[],p_result jsonb,p_user uuid) returns public.norte_analyses language plpgsql security definer set search_path = '' as $$
declare p public.norte_projects; a public.norte_analyses;
begin
  select * into p from public.norte_projects where id = p_id and owner_id = p_user and deleted_at is null;
  if p.id is null then raise exception 'not_found'; end if;
  if not p.ai_authorized or p.classification <> 'public' then raise exception 'ai_not_authorized'; end if;
  if exists(select 1 from unnest(p_sources) s where not exists(select 1 from public.norte_sources src where src.id = s and src.checked and src.ai_allowed and not src.suspended and src.license_status = 'public_authorized')) then raise exception 'source_not_authorized'; end if;
  insert into public.norte_analyses(project_id,user_id,project_version,model,source_ids,result,stale) values(p.id,p.owner_id,p_version,p_model,p_sources,p_result,p.version <> p_version) returning * into a;
  return a;
end $$;
create function public.norte_feedback_save(p_answers jsonb) returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform norte_private.account();
  if not exists(select 1 from public.norte_jobs where user_id = norte_private.uid() and status = 'ready') and not exists(select 1 from public.norte_links l join public.norte_projects p on p.id = l.project_id where p.owner_id = norte_private.uid()) then raise exception 'use_product_first'; end if;
  perform norte_private.assert_keys(p_answers,array['usefulness','difficulty','delivery','next','missing','comment']);
  if octet_length(p_answers::text) > 3000 then raise exception 'invalid_feedback'; end if;
  insert into public.norte_feedback(user_id,answers) values(norte_private.uid(),p_answers) on conflict(user_id) do update set answers = excluded.answers;
  insert into public.norte_events(user_id,type) values(norte_private.uid(),'feedback'); return true;
end $$;
create function public.norte_order_save(p_user uuid,p_actor text,p_key text,p_hash text,p_name text,p_email text,p_selection jsonb,p_quote jsonb,p_version integer) returns public.norte_orders language plpgsql security definer set search_path = '' as $$
declare o public.norte_orders;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_actor,0));
  select * into o from public.norte_orders where actor_hash = p_actor and request_key = p_key;
  if o.id is not null then if o.input_hash <> p_hash then raise exception 'idempotency_conflict'; end if; return o; end if;
  if not exists(select 1 from public.norte_config where active and version = p_version and operationally_approved) then raise exception 'offer_pending'; end if;
  insert into public.norte_orders(user_id,actor_hash,request_key,input_hash,name,email,configuration,quote,config_version) values(p_user,p_actor,p_key,p_hash,p_name,p_email,p_selection,p_quote,p_version) returning * into o;
  insert into norte_private.outbox(order_id) values(o.id);
  insert into public.norte_events(user_id,type) values(p_user,'request_saved');
  return o;
end $$;
create function public.norte_internal_audit(p_actor uuid,p_project uuid,p_event text,p_result text,p_request uuid) returns void language sql security definer set search_path = '' as $$
  insert into public.norte_audit(actor_id,project_id,event,result,request_id) values(p_actor,p_project,left(p_event,80),left(p_result,80),p_request)
$$;

do $$ declare t text; begin
  foreach t in array array['norte_jobs','norte_analyses','norte_feedback','norte_orders','norte_events','norte_controls'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
  end loop;
end $$;
grant select(id,user_id,project_id,project_version,request_key,input_hash,input,cost,quota_period,status,refunded,attempts,filename,mime,sha256,error_code,created_at) on public.norte_jobs to authenticated;
grant select on public.norte_analyses,public.norte_feedback,public.norte_orders,public.norte_controls,public.norte_events to authenticated;
create policy jobs_read on public.norte_jobs for select to authenticated using(public.norte_can_read(project_id));
create policy analysis_read on public.norte_analyses for select to authenticated using(public.norte_can_read(project_id));
create policy feedback_read on public.norte_feedback for select to authenticated using(user_id = auth.uid() or public.norte_is_admin('commercial'));
create policy orders_read on public.norte_orders for select to authenticated using(user_id = auth.uid() or public.norte_is_admin('commercial'));
create policy events_read on public.norte_events for select to authenticated using(public.norte_is_admin('commercial'));
create policy controls_read on public.norte_controls for select to authenticated using(true);
do $$ declare f record; begin
  for f in select oid::regprocedure as signature from pg_proc where pronamespace = 'public'::regnamespace and proname like 'norte_%' loop
    execute format('revoke all on function %s from public, anon, authenticated',f.signature);
  end loop;
  for f in select oid::regprocedure as signature from pg_proc where pronamespace = 'public'::regnamespace and proname in ('norte_can_read','norte_is_admin','norte_source_allowed','norte_entitlements','norte_activate_trial','norte_choose_project','norte_create_project','norte_save_project','norte_manage_project','norte_reserve_job','norte_usage','norte_feedback_save') loop
    execute format('grant execute on function %s to authenticated',f.signature);
  end loop;
  for f in select oid::regprocedure as signature from pg_proc where pronamespace = 'public'::regnamespace and proname in ('norte_session','norte_rate','norte_claim_job','norte_finish_job','norte_record_analysis','norte_order_save','norte_internal_audit') loop
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
grant execute on function public.norte_source_allowed(text) to anon;
do $$ declare t record; begin for t in select tablename from pg_tables where schemaname = 'public' and tablename like 'norte_%' loop execute format('grant all on public.%I to service_role',t.tablename); end loop; end $$;
grant usage,select on sequence public.norte_audit_id_seq,public.norte_events_id_seq to service_role;

-- Storage nunca recebe escrita direta de um usuário; só arquivos gerados ou fontes conferidas.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
  ('norte-projects','norte-projects',false,20971520,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/zip','text/csv','text/calendar','application/json']),
  ('norte-sources','norte-sources',false,52428800,array['application/pdf']),
  ('norte-quarantine','norte-quarantine',false,10485760,array['application/pdf']) on conflict(id) do update set public = false;
create policy norte_project_files_read on storage.objects for select to authenticated using(bucket_id = 'norte-projects' and exists(select 1 from public.norte_jobs j where j.storage_path = name and j.status = 'ready' and public.norte_can_read(j.project_id)));
create policy norte_source_files_read on storage.objects for select to authenticated using(bucket_id = 'norte-sources' and exists(select 1 from public.norte_sources s where s.storage_path = name and public.norte_source_allowed(s.id)));
