create table norte_private.ai_leases(id uuid primary key default gen_random_uuid(),expires_at timestamptz not null);
create function public.norte_ai_slot(p_action text,p_id uuid default null,p_limit integer default 2) returns uuid language plpgsql security definer set search_path = '' as $$
declare slot uuid;
begin
  perform pg_advisory_xact_lock(83045712);
  delete from norte_private.ai_leases where expires_at <= now();
  if p_action = 'release' then delete from norte_private.ai_leases where id = p_id; return null; end if;
  if p_action <> 'acquire' or p_limit not between 1 and 20 then raise exception 'invalid_action'; end if;
  if (select count(*) from norte_private.ai_leases) >= p_limit then return null; end if;
  insert into norte_private.ai_leases(expires_at) values(now() + interval '20 seconds') returning id into slot;
  return slot;
end $$;
revoke all on function public.norte_ai_slot(text,uuid,integer) from public,anon,authenticated;
grant execute on function public.norte_ai_slot(text,uuid,integer) to service_role;

create function norte_private.sync_project_metadata() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.payload->'engineering'->>'profile' is not null then new.profile := new.payload->'engineering'->>'profile'; end if;
  if new.payload->'engineering'->>'start' is not null then new.start_date := (new.payload->'engineering'->>'start')::date; end if;
  return new;
end $$;
create trigger norte_project_metadata before update of payload on public.norte_projects for each row execute function norte_private.sync_project_metadata();
revoke all on function norte_private.sync_project_metadata() from public,anon,authenticated;

create function public.norte_revoke_sessions(p_user uuid) returns void language sql security definer set search_path = '' as $$
  delete from norte_private.sessions where user_id = p_user
$$;
revoke all on function public.norte_revoke_sessions(uuid) from public,anon,authenticated;
grant execute on function public.norte_revoke_sessions(uuid) to service_role;

-- Metadados operacionais restritos, sem textos de projetos.
create policy technical_audit on public.norte_audit for select to authenticated using(public.norte_is_admin('technical'));

create function public.norte_admin_source(p_id text,p_license text,p_note text,p_ai boolean) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform norte_private.require_admin('technical');
  if p_license not in ('public_authorized','licensed','metadata','pending') or length(p_note) not between 20 and 3000 then raise exception 'license_evidence_required'; end if;
  update public.norte_sources set license_status = p_license,license_note = p_note,ai_allowed = p_ai and p_license = 'public_authorized' where id = p_id;
  insert into public.norte_audit(actor_id,event) values(auth.uid(),'source_authorization_changed');
end $$;
revoke all on function public.norte_admin_source(text,text,text,boolean) from public,anon;
grant execute on function public.norte_admin_source(text,text,text,boolean) to authenticated;

create or replace function public.norte_cleanup() returns jsonb language plpgsql security definer set search_path = '' as $$
declare paths jsonb; j public.norte_jobs;
begin
  delete from norte_private.sessions where expires_at < now();
  delete from norte_private.counters where expires_at < now() - interval '1 day';
  delete from public.norte_events where created_at < now() - interval '90 days';
  delete from public.norte_audit where created_at < now() - interval '180 days';
  select coalesce(jsonb_agg(jobrow.storage_path),'[]') into paths from public.norte_jobs jobrow join public.norte_projects p on p.id = jobrow.project_id where p.deleted_at is not null and jobrow.storage_path is not null;
  for j in select job.* from public.norte_jobs job join public.norte_projects p on p.id = job.project_id where p.deleted_at is not null and job.status in ('queued','running') for update of job loop
    if not j.refunded then update norte_private.usage set used = used - j.cost where user_id = j.user_id and period = j.quota_period; end if;
    update public.norte_jobs set refunded = true,status = 'cancelled',snapshot = '{}' where id = j.id;
  end loop;
  update public.norte_jobs job set status = 'cancelled',snapshot = '{}' from public.norte_projects p where p.id = job.project_id and p.deleted_at is not null;
  delete from public.norte_analyses a using public.norte_projects p where p.id = a.project_id and p.deleted_at is not null;
  delete from public.norte_source_adoptions a using public.norte_projects p where p.id = a.project_id and p.deleted_at is not null;
  return paths;
end $$;
revoke all on function public.norte_cleanup() from public,anon,authenticated;
grant execute on function public.norte_cleanup() to service_role;
