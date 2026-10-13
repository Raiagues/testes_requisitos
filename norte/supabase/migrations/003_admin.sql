create function norte_private.require_admin(p_role text) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.norte_is_admin(p_role) or not exists(select 1 from jsonb_array_elements(coalesce(auth.jwt()->'amr','[]')) a where a->>'method' in ('totp','mfa/totp') and (a->>'timestamp')::bigint > extract(epoch from now() - interval '10 minutes')) then raise exception 'admin_mfa_recent_required'; end if;
end $$;
create function public.norte_admin_config(p_offer jsonb,p_limits jsonb,p_approved boolean) returns integer language plpgsql security definer set search_path = '' as $$
declare v integer;
begin
  perform norte_private.require_admin('commercial');
  perform norte_private.assert_keys(p_offer,array['monthly','firstDiscount','feedbackDiscount','validDays','services','volumes','hours','reviewers','addons','dedicatedSetup','dedicatedMonthly']);
  perform norte_private.assert_keys(p_limits,array['essential','trial','professional','trialDays']);
  if (p_offer->>'monthly')::integer < 0 or (p_offer->>'firstDiscount')::integer not between 0 and 100 or (p_offer->>'feedbackDiscount')::integer not between 0 and 100 then raise exception 'invalid_offer'; end if;
  lock table public.norte_config in exclusive mode;
  select max(version) + 1 into v from public.norte_config;
  update public.norte_config set active = false where active;
  insert into public.norte_config(version,active,offer,limits,operationally_approved) values(v,true,p_offer,p_limits,p_approved);
  insert into public.norte_audit(actor_id,event) values(auth.uid(),'commercial_configuration_changed');
  return v;
end $$;
create function public.norte_admin_order(p_id uuid,p_status text,p_activate boolean default false) returns void language plpgsql security definer set search_path = '' as $$
declare o public.norte_orders;
begin
  perform norte_private.require_admin('commercial');
  select * into o from public.norte_orders where id = p_id for update;
  if o.id is null then raise exception 'not_found'; end if;
  if p_activate then
    if p_status <> 'confirmed' or o.user_id is null or not coalesce((o.configuration->>'subscription')::boolean,false) then raise exception 'activation_requires_confirmed_order'; end if;
    update public.norte_accounts set plan = 'professional' where user_id = o.user_id;
  end if;
  update public.norte_orders set status = p_status where id = p_id;
  insert into public.norte_audit(actor_id,event) values(auth.uid(),case when p_activate then 'plan_manually_activated' else 'order_status_changed' end);
end $$;
create function public.norte_admin_controls(p_ai boolean,p_generation boolean,p_imports boolean) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform norte_private.require_admin('technical');
  update public.norte_controls set ai_enabled = p_ai,generation_enabled = p_generation,imports_enabled = p_imports where id;
  insert into public.norte_audit(actor_id,event) values(auth.uid(),'incident_controls_changed');
end $$;
create function public.norte_project_access(p_id uuid,p_user uuid,p_scope text,p_expires timestamptz) returns void language plpgsql security definer set search_path = '' as $$
declare p public.norte_projects; e jsonb;
begin
  e := public.norte_entitlements(); p := norte_private.assert_owner(p_id);
  if p_scope = 'revoke' then delete from public.norte_access where project_id = p.id and user_id = p_user;
  else
    if e->>'tier' = 'essential' then raise exception 'single_user_plan'; end if;
    if p_expires <= now() or p_expires > now() + interval '90 days' then raise exception 'invalid_expiration'; end if;
    insert into public.norte_access(project_id,user_id,scope,expires_at,granted_by) values(p.id,p_user,p_scope,p_expires,p.owner_id) on conflict(project_id,user_id) do update set scope = excluded.scope,expires_at = excluded.expires_at;
  end if;
  insert into public.norte_audit(actor_id,project_id,event) values(auth.uid(),p.id,'project_access_changed');
end $$;
create function public.norte_set_ai_scope(p_id uuid,p_classification text,p_authorized boolean) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform norte_private.require_admin('technical');
  if p_classification <> 'public' and p_authorized then raise exception 'restricted_processing_unavailable'; end if;
  update public.norte_projects set classification = p_classification,ai_authorized = p_authorized where id = p_id and deleted_at is null;
  insert into public.norte_audit(actor_id,project_id,event) values(auth.uid(),p_id,'processing_scope_changed');
end $$;
create function public.norte_file_allowed(p_bucket text,p_path text) returns boolean language sql stable security definer set search_path = '' as $$
  select case when p_bucket = 'norte-projects' then exists(select 1 from public.norte_jobs j where j.storage_path = p_path and j.status = 'ready' and public.norte_can_read(j.project_id)) when p_bucket = 'norte-sources' then exists(select 1 from public.norte_sources s where s.storage_path = p_path and public.norte_source_allowed(s.id)) else false end
$$;
drop policy norte_project_files_read on storage.objects;
drop policy norte_source_files_read on storage.objects;
create policy norte_files_read on storage.objects for select to authenticated using(public.norte_file_allowed(bucket_id,name));
drop policy own_account on public.norte_accounts;
create policy own_account on public.norte_accounts for select to authenticated using(user_id = auth.uid());
drop policy source_access_read on public.norte_source_access;
create policy source_access_read on public.norte_source_access for select to authenticated using(user_id = auth.uid());
revoke all on all functions in schema norte_private from public,anon,authenticated;
do $$ declare f record; begin
  for f in select oid::regprocedure as signature from pg_proc where pronamespace = 'public'::regnamespace and proname in ('norte_admin_config','norte_admin_order','norte_admin_controls','norte_project_access','norte_set_ai_scope','norte_file_allowed') loop
    execute format('revoke all on function %s from public,anon',f.signature);
    execute format('grant execute on function %s to authenticated',f.signature);
  end loop;
end $$;

create function public.norte_outbox(p_action text,p_id uuid default null) returns jsonb language plpgsql security definer set search_path = '' as $$
declare o norte_private.outbox; result jsonb;
begin
  if p_action = 'claim' then
    select * into o from norte_private.outbox where status = 'pending' and next_at <= now() and (lease_until is null or lease_until < now()) and attempts < 5 order by next_at for update skip locked limit 1;
    if o.id is null then return null; end if;
    update norte_private.outbox set lease_until = now() + interval '2 minutes',attempts = attempts + 1 where id = o.id;
    select jsonb_build_object('id',o.id,'orderId',n.id,'name',n.name,'email',n.email) into result from public.norte_orders n where n.id = o.order_id;
    return result;
  elsif p_action = 'sent' then update norte_private.outbox set status = 'sent',lease_until = null where id = p_id;
  elsif p_action = 'failed' then update norte_private.outbox set lease_until = null,next_at = now() + interval '15 minutes' * greatest(attempts,1) where id = p_id;
  else raise exception 'invalid_action'; end if;
  return null;
end $$;
revoke all on function public.norte_outbox(text,uuid) from public,anon,authenticated;
grant execute on function public.norte_outbox(text,uuid) to service_role;

create function public.norte_cleanup() returns jsonb language plpgsql security definer set search_path = '' as $$
declare paths jsonb;
begin
  delete from norte_private.sessions where expires_at < now();
  delete from norte_private.counters where expires_at < now() - interval '1 day';
  delete from public.norte_events where created_at < now() - interval '90 days';
  delete from public.norte_audit where created_at < now() - interval '180 days';
  select coalesce(jsonb_agg(j.storage_path),'[]') into paths from public.norte_jobs j join public.norte_projects p on p.id = j.project_id where p.deleted_at is not null and j.storage_path is not null;
  update public.norte_jobs j set status = 'cancelled',snapshot = '{}' from public.norte_projects p where p.id = j.project_id and p.deleted_at is not null;
  delete from public.norte_analyses a using public.norte_projects p where p.id = a.project_id and p.deleted_at is not null;
  return paths;
end $$;
revoke all on function public.norte_cleanup() from public,anon,authenticated;
grant execute on function public.norte_cleanup() to service_role;
