create function norte_private.snapshot_sources() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  new.snapshot := new.snapshot || jsonb_build_object('templateVersion',1,'sourceVersions',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'code',s.code,'title',s.title,'edition',s.edition,'sha256',s.sha256,'decision',a.decision,'rationale',a.rationale,'responsible',a.responsible,'url',s.official_url)) from public.norte_source_adoptions a join public.norte_sources s on s.id = a.source_id where a.project_id = new.project_id),'[]'::jsonb));
  return new;
end $$;
create trigger norte_job_provenance before insert on public.norte_jobs for each row execute function norte_private.snapshot_sources();
revoke all on function norte_private.snapshot_sources() from public,anon,authenticated;

drop function public.norte_adopt_source(uuid,text,text,text,text);
create function public.norte_adopt_source(p_project uuid,p_source text,p_decision text,p_rationale text,p_responsible text,p_version integer) returns public.norte_projects language plpgsql security definer set search_path = '' as $$
declare p public.norte_projects; e jsonb;
begin
  e := public.norte_entitlements(); p := norte_private.assert_owner(p_project); perform norte_private.assert_editable(p,e);
  if p.version <> p_version then raise exception 'version_conflict'; end if;
  if p_decision not in ('confirmed','pending','not_applicable') or length(p_rationale) not between 1 and 4000 or length(p_responsible) not between 1 and 200 then raise exception 'invalid_decision'; end if;
  if not exists(select 1 from public.norte_sources where id = p_source) then raise exception 'not_found'; end if;
  insert into public.norte_source_adoptions(project_id,source_id,decision,rationale,responsible) values(p_project,p_source,p_decision,p_rationale,p_responsible) on conflict(project_id,source_id) do update set decision = excluded.decision,rationale = excluded.rationale,responsible = excluded.responsible;
  insert into public.norte_audit(actor_id,project_id,event) values(auth.uid(),p_project,'source_adoption_changed');
  p.payload := jsonb_set(p.payload,'{engineering}',coalesce(p.payload->'engineering','{}') || jsonb_build_object('applicability',coalesce(p.payload->'engineering'->'applicability','{}') || jsonb_build_object(p_source,jsonb_build_object('decision',p_decision,'rationale',p_rationale,'responsible',p_responsible))));
  return public.norte_save_project(p.id,p.version,p.payload);
end $$;
revoke all on function public.norte_adopt_source(uuid,text,text,text,text,integer) from public,anon;
grant execute on function public.norte_adopt_source(uuid,text,text,text,text,integer) to authenticated;

create table public.norte_alerts(id bigint generated always as identity primary key,event text not null,result text,request_id uuid,created_at timestamptz not null default now());
alter table public.norte_alerts enable row level security;
revoke all on public.norte_alerts from public,anon,authenticated;
grant select on public.norte_alerts to authenticated;
grant all on public.norte_alerts to service_role;
grant usage,select on sequence public.norte_alerts_id_seq to service_role;
create policy technical_alerts on public.norte_alerts for select to authenticated using(public.norte_is_admin('technical'));
create function norte_private.signal_alert() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.event like 'admin_%' or new.event like '%authorization_changed' or new.event = 'storage_limits_changed' or new.result in ('rate_limit','source_integrity_failed','file_integrity_failed','ai_active_content','ai_unverified_reference','ai_budget_limit') then
    insert into public.norte_alerts(event,result,request_id) values(new.event,new.result,new.request_id);
  end if;
  delete from public.norte_alerts where created_at < now() - interval '90 days';
  return new;
end $$;
create trigger norte_alert_audit after insert on public.norte_audit for each row execute function norte_private.signal_alert();
revoke all on function norte_private.signal_alert() from public,anon,authenticated;

create function norte_private.final_authorization() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'norte_analyses' then
    if not (select ai_enabled from public.norte_controls where id) or not exists(select 1 from public.norte_accounts a join auth.users u on u.id = a.user_id where a.user_id = new.user_id and not a.suspended and (u.banned_until is null or u.banned_until < now())) then raise exception 'ai_not_authorized'; end if;
  elsif new.status = 'running' and not (select generation_enabled from public.norte_controls where id) then
    raise exception 'generation_suspended';
  elsif new.status = 'ready' and (not (select generation_enabled from public.norte_controls where id) or exists(select 1 from auth.users where id = new.user_id and banned_until > now())) then
    raise exception 'generation_suspended';
  end if;
  return new;
end $$;
create trigger norte_check_job before update of status on public.norte_jobs for each row execute function norte_private.final_authorization();
create trigger norte_check_analysis before insert on public.norte_analyses for each row execute function norte_private.final_authorization();
revoke all on function norte_private.final_authorization() from public,anon,authenticated;
